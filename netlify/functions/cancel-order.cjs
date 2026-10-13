const{headers,reply,adminClient}=require('./_shared.cjs');
exports.handler=async e=>{
 if(e.httpMethod==='OPTIONS')return{statusCode:204,headers};
 if(e.httpMethod!=='POST')return reply(405,{error:'Method not allowed'});
 try{
  const db=adminClient();
  const token=(e.headers.authorization||'').replace(/^Bearer /,'');
  if(!token)return reply(401,{error:'Please sign in'});
  const{data:auth,error:authError}=await db.auth.getUser(token);
  if(authError||!auth?.user)return reply(401,{error:'Invalid session'});
  const{order_id}=JSON.parse(e.body||'{}');
  if(!order_id)return reply(400,{error:'Order ID required'});
  const{data:order,error:orderError}=await db.from('orders').select('id,status,customer_id').eq('id',order_id).eq('customer_id',auth.user.id).maybeSingle();
  if(orderError)return reply(500,{error:'Could not verify order'});
  if(!order)return reply(404,{error:'Order not found in your account'});
  if(order.status==='cancelled')return reply(200,{ok:true,status:'cancelled'});
  if(!['placed','confirmed','packed'].includes(order.status))return reply(409,{error:'This order can no longer be cancelled'});
  const{error}=await db.rpc('cancel_order_restore_stock',{p_order_id:order.id});
  if(error)return reply(409,{error:error.message||'Cancellation failed'});
  return reply(200,{ok:true,status:'cancelled'});
 }catch(err){console.error('Customer cancellation failed',err);return reply(500,{error:'Could not cancel order'});}
};
