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
  const{order_id,item_id,quantity}=JSON.parse(e.body||'{}');
  if(!order_id)return reply(400,{error:'Order ID required'});
  const{data:order,error:orderError}=await db.from('orders').select('id,status,customer_id').eq('id',order_id).eq('customer_id',auth.user.id).maybeSingle();
  if(orderError)return reply(500,{error:'Could not verify order'});
  if(!order)return reply(403,{error:'This order is not linked to your signed-in account. Cancellation was not submitted. Please contact store support with your order number to verify ownership.'});
  if(order.status==='cancelled')return item_id?reply(409,{error:'Order already cancelled'}):reply(200,{ok:true,status:'cancelled'});
  if(!['placed','confirmed','packed'].includes(order.status))return reply(409,{error:'This order can no longer be cancelled'});
  if(item_id&&(!Number.isInteger(quantity)||quantity<1))return reply(400,{error:'Select a valid quantity'});
  const{error}=item_id?await db.rpc('cancel_order_item_restore_stock',{p_order_id:order.id,p_item_id:item_id,p_quantity:quantity}):await db.rpc('cancel_order_restore_stock',{p_order_id:order.id});
  if(error)return reply(409,{error:error.message||'Cancellation failed'});
  return reply(200,{ok:true,status:item_id?'updated':'cancelled'});
 }catch(err){console.error('Customer cancellation failed',err);return reply(500,{error:'Could not cancel order'});}
};
