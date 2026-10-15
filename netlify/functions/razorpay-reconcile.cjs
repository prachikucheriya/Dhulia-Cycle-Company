const {headers,reply,adminClient}=require('./_shared.cjs');
exports.handler=async event=>{
 if(event.httpMethod==='OPTIONS')return{statusCode:204,headers};
 if(event.httpMethod!=='POST')return reply(405,{error:'Method not allowed'});
 try{
 const b=JSON.parse(event.body||'{}'),orderId=typeof b.order_id==='string'?b.order_id.trim():'';
 if(!/^order_[a-zA-Z0-9]{8,40}$/.test(orderId))return reply(400,{error:'Invalid order ID'});
 const key=process.env.RAZORPAY_KEY_ID,secret=process.env.RAZORPAY_KEY_SECRET;
 if(!key?.startsWith('rzp_test_')||!secret)return reply(503,{error:'Test payment not configured'});
 const db=adminClient();
 const {data:intent,error:ie}=await db.from('razorpay_payment_intents').select('amount_paise,finalized_order_id').eq('razorpay_order_id',orderId).maybeSingle();
 if(ie||!intent)return reply(404,{error:'Payment session not found'});
 let orderIdFinal=intent.finalized_order_id;
 if(!orderIdFinal){
 const auth='Basic '+Buffer.from(key+':'+secret).toString('base64');
 const response=await fetch('https://api.razorpay.com/v1/orders/'+encodeURIComponent(orderId)+'/payments',{headers:{Authorization:auth}});
 if(!response.ok)return reply(502,{error:'Payment confirmation temporarily unavailable'});
 const payload=await response.json();
 const captured=(payload.items||[]).filter(p=>p.status==='captured'&&p.order_id===orderId&&p.currency==='INR'&&Number(p.amount)===Number(intent.amount_paise));
 if(captured.length!==1)return reply(202,{ok:false,pending:true,message:'Payment is not yet confirmed as captured'});
 const {data,error}=await db.rpc('finalize_razorpay_payment',{p_razorpay_order_id:orderId,p_razorpay_payment_id:captured[0].id});
 if(error){console.error('Reconcile finalization failed',{code:error.code,message:error.message});return reply(409,{error:'Captured payment could not be finalized; contact store support'});}
 orderIdFinal=data;
 }
 const {data:order,error:oe}=await db.from('orders').select('order_number,total,payment_status').eq('id',orderIdFinal).single();
 if(oe||!order||order.payment_status!=='paid')return reply(409,{error:'Order confirmation unavailable'});
 return reply(200,{ok:true,order_id:orderIdFinal,order_number:order.order_number,total:order.total,payment_status:'paid'});
 }catch(e){console.error('Razorpay reconciliation error',e);return reply(500,{error:'Could not confirm payment; do not pay again'});}
};