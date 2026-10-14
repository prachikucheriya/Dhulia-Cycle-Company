const {headers,reply,adminClient}=require('./_shared.cjs');
exports.handler=async event=>{
 if(event.httpMethod==='OPTIONS')return{statusCode:204,headers};
 if(event.httpMethod!=='POST')return reply(405,{error:'Method not allowed'});
 try{
  const token=(event.headers.authorization||event.headers.Authorization||'').replace(/^Bearer\s+/i,'');
  if(!token)return reply(401,{error:'Admin sign-in required'});
  const db=adminClient();
  const {data:userResult,error:authError}=await db.auth.getUser(token);
  if(authError||!userResult?.user)return reply(401,{error:'Invalid session'});
  const {data:profile,error:profileError}=await db.from('profiles').select('role').eq('id',userResult.user.id).single();
  if(profileError||profile?.role!=='admin')return reply(403,{error:'Admin access required'});
  const {payment_id}=JSON.parse(event.body||'{}');
  if(!/^pay_[a-zA-Z0-9]{8,40}$/.test(payment_id||''))return reply(400,{error:'Invalid payment ID'});
  const key=process.env.RAZORPAY_KEY_ID,secret=process.env.RAZORPAY_KEY_SECRET;
  if(!key?.startsWith('rzp_test_')||!secret)return reply(503,{error:'Test Razorpay keys not configured'});
  const auth='Basic '+Buffer.from(key+':'+secret).toString('base64');
  const response=await fetch('https://api.razorpay.com/v1/payments/'+encodeURIComponent(payment_id),{headers:{Authorization:auth}});
  if(!response.ok)return reply(502,{error:'Razorpay lookup failed ('+response.status+')'});
  const payment=await response.json();
  const {data:intent}=await db.from('razorpay_payment_intents').select('razorpay_order_id,finalized_order_id,amount_paise').eq('razorpay_order_id',payment.order_id||'').maybeSingle();
  return reply(200,{payment_id:payment.id,razorpay_order_id:payment.order_id,status:payment.status,amount_rupees:payment.amount/100,currency:payment.currency,session_found:!!intent,amount_matches:!!intent&&Number(intent.amount_paise)===Number(payment.amount),finalized_order_id:intent?.finalized_order_id||null});
 }catch(e){console.error('Razorpay admin lookup failed',e);return reply(500,{error:'Could not look up payment'});}
};