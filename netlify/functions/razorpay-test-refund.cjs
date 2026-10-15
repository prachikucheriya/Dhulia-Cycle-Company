const {headers,reply,adminClient}=require('./_shared.cjs');
exports.handler=async event=>{
 if(event.httpMethod==='OPTIONS')return{statusCode:204,headers};
 if(event.httpMethod!=='POST')return reply(405,{error:'Method not allowed'});
 try{
 const token=(event.headers.authorization||event.headers.Authorization||'').replace(/^Bearer\s+/i,'');
 if(!token)return reply(401,{error:'Admin login required'});
 const db=adminClient(),{data:auth,error:ae}=await db.auth.getUser(token);
 if(ae||!auth?.user)return reply(401,{error:'Invalid session'});
 const {data:profile}=await db.from('profiles').select('role').eq('id',auth.user.id).maybeSingle();
 if(profile?.role!=='admin')return reply(403,{error:'Admin only'});
 const {request_id}=JSON.parse(event.body||'{}');
 if(!/^[0-9a-f-]{36}$/i.test(request_id||''))return reply(400,{error:'Invalid request ID'});
 const {data:q,error:qe}=await db.from('paid_cancellation_requests').select('id,order_id,item_id,quantity,status,razorpay_refund_id,refund_amount_paise').eq('id',request_id).maybeSingle();
 if(qe||!q)return reply(404,{error:'Request not found'});
 const {data:order}=await db.from('orders').select('id,notes,payment_method,payment_status,status').eq('id',q.order_id).maybeSingle();
 if(!order||order.payment_method!=='RAZORPAY'||order.payment_status!=='paid')return reply(409,{error:'Not a paid Razorpay order'});
 const {data:item}=await db.from('order_items').select('id,order_id,price,quantity,cancelled_quantity').eq('id',q.item_id).eq('order_id',q.order_id).maybeSingle();
 if(!item||q.quantity>Number(item.quantity)-Number(item.cancelled_quantity||0))return reply(409,{error:'Invalid refund item quantity'});
 const amount=Math.round(Number(item.price)*Number(q.quantity)*100);
 if(!Number.isSafeInteger(amount)||amount<100)return reply(409,{error:'Invalid refund amount'});
 const match=String(order.notes||'').match(/Razorpay Payment ID:\s*(pay_[a-zA-Z0-9]+)/);
 if(!match)return reply(409,{error:'Razorpay payment reference missing'});
 const paymentId=match[1];
 const key=process.env.RAZORPAY_KEY_ID,secret=process.env.RAZORPAY_KEY_SECRET;
 if(!key?.startsWith('rzp_test_')||!secret)return reply(503,{error:'Only Razorpay Test Mode refunds are supported'});
 const authHeader='Basic '+Buffer.from(key+':'+secret).toString('base64');
 const paymentResp=await fetch('https://api.razorpay.com/v1/payments/'+encodeURIComponent(paymentId),{headers:{Authorization:authHeader}});
 if(!paymentResp.ok)return reply(502,{error:'Could not verify original payment'});
 const payment=await paymentResp.json();
 if(payment.status!=='captured'||payment.currency!=='INR'||amount>Number(payment.amount))return reply(409,{error:'Payment is not eligible for this refund amount'});
 const {data:intent}=await db.from('razorpay_payment_intents').select('finalized_order_id').eq('razorpay_order_id',payment.order_id).maybeSingle();
 if(intent?.finalized_order_id!==order.id)return reply(409,{error:'Payment and website order do not match'});
 if(q.status==='processing'||q.status==='refunded'||q.status==='refund_failed')return reply(409,{error:'Refund already started or finished. Check Razorpay before retrying.'});
 if(q.status!=='approved')return reply(409,{error:'Approve cancellation request first'});
 const {data:reserved,error:reserveError}=await db.rpc('reserve_test_refund',{p_request_id:q.id,p_amount_paise:amount});
 if(reserveError)return reply(503,{error:'Refund SQL setup required. Run supabase/razorpay_test_refunds.sql'});
 if(!reserved)return reply(409,{error:'Refund already started. Refresh requests.'});
 // Once reserved, never automatically retry: a timeout may mean Razorpay accepted the refund.
 const response=await fetch('https://api.razorpay.com/v1/payments/'+encodeURIComponent(paymentId)+'/refund',{method:'POST',headers:{Authorization:authHeader,'Content-Type':'application/json'},body:JSON.stringify({amount,speed:'normal',notes:{source:'Dhulia Cycle Company',cancellation_request_id:q.id}})});
 const payload=await response.json().catch(()=>({}));
 if(!response.ok||!/^rfnd_[a-zA-Z0-9]+$/.test(payload.id||'')){
 console.error('Razorpay refund response requires manual review',{status:response.status,code:payload?.error?.code});
 return reply(502,{error:'Refund initiation needs review. Do not retry automatically. Check Razorpay Dashboard using payment ID '+paymentId});
 }
 const status=payload.status==='processed'?'refunded':'processing';
 const {error:saveError}=await db.from('paid_cancellation_requests').update({razorpay_refund_id:payload.id,status,...(status==='refunded'?{refund_completed_at:new Date().toISOString()}:{})}).eq('id',q.id).eq('status','processing');
 if(saveError){console.error('Refund succeeded but DB update failed',{refundId:payload.id});return reply(500,{error:'Razorpay refund initiated; database update failed. Do not retry. Refund ID: '+payload.id});}
 return reply(200,{ok:true,refund_id:payload.id,refund_status:payload.status,amount_rupees:amount/100,stock_restored:false});
 }catch(e){console.error('Test refund error',e);return reply(500,{error:'Refund state uncertain. Do not retry; check Razorpay dashboard first.'});}
};