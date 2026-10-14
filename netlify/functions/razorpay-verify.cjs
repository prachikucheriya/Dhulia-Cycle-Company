const{headers,reply,adminClient}=require('./_shared.cjs');const crypto=require('crypto');
exports.handler=async event=>{
 if(event.httpMethod==='OPTIONS')return{statusCode:204,headers};
 if(event.httpMethod!=='POST')return reply(405,{error:'Method not allowed'});
 try{
 const key=process.env.RAZORPAY_KEY_ID,secret=process.env.RAZORPAY_KEY_SECRET;
 if(!key?.startsWith('rzp_test_')||!secret)return reply(503,{error:'Razorpay test mode is not configured'});
 const b=JSON.parse(event.body||'{}');
 if(!/^order_[a-zA-Z0-9]+$/.test(b.razorpay_order_id||'')||!/^pay_[a-zA-Z0-9]+$/.test(b.razorpay_payment_id||'')||typeof b.razorpay_signature!=='string')return reply(400,{error:'Invalid payment details'});
 const expected=crypto.createHmac('sha256',secret).update(b.razorpay_order_id+'|'+b.razorpay_payment_id).digest('hex');
 const actual=b.razorpay_signature;if(!/^[0-9a-f]{64}$/.test(actual)||!crypto.timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(actual,'hex')))return reply(400,{error:'Payment signature verification failed'});
 const auth='Basic '+Buffer.from(key+':'+secret).toString('base64');
 const response=await fetch('https://api.razorpay.com/v1/payments/'+encodeURIComponent(b.razorpay_payment_id),{headers:{Authorization:auth}});
 const payment=await response.json();
 if(!response.ok||payment.status!=='captured'||payment.order_id!==b.razorpay_order_id||payment.currency!=='INR')return reply(409,{error:'Payment is not captured. Please contact support if debited.'});
 const db=adminClient();const{data:intent,error:intentError}=await db.from('razorpay_payment_intents').select('amount_paise').eq('razorpay_order_id',b.razorpay_order_id).single();
 if(intentError||!intent)return reply(404,{error:'Payment session not found'});
 if(Number(payment.amount)!==Number(intent.amount_paise))return reply(409,{error:'Payment amount mismatch'});
 const{data:orderId,error}=await db.rpc('finalize_razorpay_payment',{p_razorpay_order_id:b.razorpay_order_id,p_razorpay_payment_id:b.razorpay_payment_id});
 if(error){console.error('Paid order finalization failed',error);return reply(409,{error:'Payment received but order could not be finalized. Please contact support with payment ID '+b.razorpay_payment_id});}
 const{data:order}=await db.from('orders').select('order_number,total').eq('id',orderId).single();
 return reply(200,{ok:true,order_id:orderId,order_number:order?.order_number,total:order?.total,payment_status:'paid'});
 }catch(err){console.error(err);return reply(500,{error:'Could not verify payment. Please contact support if payment succeeded.'});}
};
