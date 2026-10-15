const {headers,reply,adminClient}=require('./_shared.cjs');
exports.handler=async event=>{
 if(event.httpMethod==='OPTIONS')return{statusCode:204,headers};
 if(event.httpMethod!=='POST')return reply(405,{error:'Method not allowed'});
 try{
 const token=(event.headers.authorization||event.headers.Authorization||'').replace(/^Bearer\s+/i,'');
 if(!token)return reply(401,{error:'Admin login required'});
 const db=adminClient(),{data:auth,error:ae}=await db.auth.getUser(token);
 if(ae||!auth?.user)return reply(401,{error:'Invalid admin session'});
 const {data:profile}=await db.from('profiles').select('role').eq('id',auth.user.id).maybeSingle();
 if(profile?.role!=='admin')return reply(403,{error:'Admin only'});
 const {request_id}=JSON.parse(event.body||'{}');
 if(!/^[0-9a-f-]{36}$/i.test(request_id||''))return reply(400,{error:'Invalid request ID'});
 const {data:q,error:qe}=await db.from('paid_cancellation_requests')
 .select('id,order_id,item_id,quantity,status,razorpay_refund_id,refund_amount_paise,stock_restored_at')
 .eq('id',request_id).maybeSingle();
 if(qe)return reply(503,{error:'Run the refund verification SQL in Supabase first'});
 if(!q)return reply(404,{error:'Cancellation request not found'});
 if(!/^rfnd_[a-zA-Z0-9]+$/.test(q.razorpay_refund_id||''))return reply(409,{error:'Refund ID not recorded; do not retry refund'});
 if(!['processing','refunded'].includes(q.status))return reply(409,{error:'Refund has not been initiated'});
 const key=process.env.RAZORPAY_KEY_ID,secret=process.env.RAZORPAY_KEY_SECRET;
 if(!key?.startsWith('rzp_test_')||!secret)return reply(503,{error:'Test mode keys required'});
 const authHeader='Basic '+Buffer.from(key+':'+secret).toString('base64');
 const response=await fetch('https://api.razorpay.com/v1/refunds/'+encodeURIComponent(q.razorpay_refund_id),
 {headers:{Authorization:authHeader}});
 if(!response.ok)return reply(502,{error:'Razorpay refund status lookup failed. No stock changed.'});
 const refund=await response.json();
 const {data:order}=await db.from('orders').select('id,notes,payment_method,payment_status').eq('id',q.order_id).maybeSingle();
 const {data:item}=await db.from('order_items').select('id,order_id,price,quantity,product_id').eq('id',q.item_id).eq('order_id',q.order_id).maybeSingle();
 const paymentId=String(order?.notes||'').match(/Razorpay Payment ID:\s*(pay_[a-zA-Z0-9]+)/)?.[1];
 const expected=Math.round(Number(item?.price)*Number(q.quantity)*100);
 if(!order||order.payment_method!=='RAZORPAY'||order.payment_status!=='paid'||!item||!item.product_id
 ||!paymentId||refund.payment_id!==paymentId||refund.currency!=='INR'
 ||Number(refund.amount)!==Number(q.refund_amount_paise)||Number(refund.amount)!==expected)
 return reply(409,{error:'Refund/payment/item/amount mismatch. No stock changed.'});
 const result={ok:true,refund_id:refund.id,razorpay_status:refund.status,amount_rupees:Number(refund.amount)/100,stock_restored:false};
 if(refund.status!=='processed')return reply(200,{...result,message:'Refund not yet processed. Stock unchanged.'});
 const {data:restored,error:restoreError}=await db.rpc('confirm_test_refund_restore_stock',{
 p_request_id:q.id,p_refund_id:refund.id,p_amount_paise:Number(refund.amount)});
 if(restoreError){console.error('Verified refund stock restoration failed',{request_id:q.id,error:restoreError.message});return reply(409,{...result,error:'Refund processed, but stock restoration failed: '+restoreError.message});}
 return reply(200,{...result,stock_restored:!!restored?.restored,already_restored:!!restored?.already_restored,message:restored?.already_restored?'Stock was already restored':'Verified refund and restored stock'});
 }catch(e){console.error('Refund verification error',e);return reply(500,{error:'Could not verify refund. No new refund was initiated.'});}
};