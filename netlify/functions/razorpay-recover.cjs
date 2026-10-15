const {headers,reply,adminClient}=require('./_shared.cjs');
exports.handler=async event=>{
 if(event.httpMethod==='OPTIONS')return{statusCode:204,headers};
 if(event.httpMethod!=='POST')return reply(405,{error:'Method not allowed'});
 try{
  const token=(event.headers.authorization||event.headers.Authorization||'').replace(/^Bearer\s+/i,'');
  if(!token)return reply(401,{error:'Admin sign-in required'});
  const db=adminClient();
  const {data:userResult,error:authError}=await db.auth.getUser(token);
  if(authError||!userResult?.user)return reply(401,{error:'Invalid admin session'});
  const {data:profile,error:profileError}=await db.from('profiles').select('role').eq('id',userResult.user.id).single();
  if(profileError||profile?.role!=='admin')return reply(403,{error:'Admin access required'});
  const b=JSON.parse(event.body||'{}');
  const orderId=typeof b.order_id==='string'?b.order_id.trim():'';
  if(!/^order_[a-zA-Z0-9]{8,40}$/.test(orderId))return reply(400,{error:'Invalid Razorpay order ID'});
  const key=process.env.RAZORPAY_KEY_ID,secret=process.env.RAZORPAY_KEY_SECRET;
  if(!key?.startsWith('rzp_test_')||!secret)return reply(503,{error:'Razorpay Test Keys not configured'});
  const {data:intent,error:intentError}=await db.from('razorpay_payment_intents').select('razorpay_order_id,amount_paise,finalized_order_id').eq('razorpay_order_id',orderId).maybeSingle();
  if(intentError||!intent)return reply(404,{error:'Matching payment session not found'});
  if(intent.finalized_order_id)return reply(200,{ok:true,already_finalized:true,order_id:intent.finalized_order_id});
  const auth='Basic '+Buffer.from(key+':'+secret).toString('base64');
  const response=await fetch('https://api.razorpay.com/v1/orders/'+encodeURIComponent(orderId)+'/payments',{headers:{Authorization:auth}});
  if(!response.ok)return reply(502,{error:'Could not verify Razorpay payment ('+response.status+')'});
  const payload=await response.json();
  const matches=(payload.items||[]).filter(p=>p.status==='captured'&&p.order_id===orderId&&p.currency==='INR'&&Number(p.amount)===Number(intent.amount_paise));
  if(matches.length!==1)return reply(409,{error:'Expected exactly one captured INR payment matching this order and amount; found '+matches.length});
  const payment=matches[0];
  const {data:createdOrderId,error:finalizeError}=await db.rpc('finalize_razorpay_payment',{p_razorpay_order_id:orderId,p_razorpay_payment_id:payment.id});
  if(finalizeError){console.error('Admin recovery finalization failed',{code:finalizeError.code,message:finalizeError.message});return reply(409,{error:'Payment verified, but order creation failed',details:finalizeError.message});}
  const {data:order,error:orderError}=await db.from('orders').select('order_number,total,payment_status').eq('id',createdOrderId).single();
  if(orderError)return reply(200,{ok:true,order_id:createdOrderId,payment_id:payment.id});
  return reply(200,{ok:true,order_id:createdOrderId,order_number:order.order_number,total:order.total,payment_status:order.payment_status,payment_id:payment.id});
 }catch(e){console.error('Admin recovery failed',e);return reply(500,{error:'Payment recovery failed; no new payment was attempted'});}
};