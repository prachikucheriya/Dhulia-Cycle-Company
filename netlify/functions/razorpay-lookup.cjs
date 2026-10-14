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
  const {payment_id,order_id}=JSON.parse(event.body||'{}');
  const byOrder=!!order_id;
  if(byOrder?!/^order_[a-zA-Z0-9]{8,40}$/.test(order_id):!/^pay_[a-zA-Z0-9]{8,40}$/.test(payment_id||''))return reply(400,{error:'Invalid Razorpay ID'});
  const key=process.env.RAZORPAY_KEY_ID,secret=process.env.RAZORPAY_KEY_SECRET;
  if(!key?.startsWith('rzp_test_')||!secret)return reply(503,{error:'Test Razorpay keys not configured'});
  const auth='Basic '+Buffer.from(key+':'+secret).toString('base64');
  const url=byOrder?'https://api.razorpay.com/v1/orders/'+encodeURIComponent(order_id)+'/payments':'https://api.razorpay.com/v1/payments/'+encodeURIComponent(payment_id);
  const response=await fetch(url,{headers:{Authorization:auth}});
  if(!response.ok){let details={};try{details=await response.json()}catch{}const code=String(details?.error?.code||'UNKNOWN');const description=String(details?.error?.description||'Razorpay rejected the lookup').slice(0,240);console.error('Razorpay lookup rejected',{status:response.status,code,description});return reply(502,{error:'Razorpay lookup failed',razorpay_http_status:response.status,razorpay_error_code:code,razorpay_message:description});}
  const payload=await response.json();
  const payments=byOrder?(payload.items||[]):[payload];
  const payment=payments.find(p=>p.status==='captured')||payments[0];
  if(!payment)return reply(200,{razorpay_order_id:order_id,payments_found:0,message:'No payments found for this Razorpay order'});
  const {data:intent}=await db.from('razorpay_payment_intents').select('razorpay_order_id,finalized_order_id,amount_paise').eq('razorpay_order_id',payment.order_id||'').maybeSingle();
  return reply(200,{payment_id:payment.id,razorpay_order_id:payment.order_id,status:payment.status,payments_found:payments.length,amount_rupees:payment.amount/100,currency:payment.currency,session_found:!!intent,amount_matches:!!intent&&Number(intent.amount_paise)===Number(payment.amount),finalized_order_id:intent?.finalized_order_id||null});
 }catch(e){console.error('Razorpay admin lookup failed',e);return reply(500,{error:'Could not look up payment'});}
};