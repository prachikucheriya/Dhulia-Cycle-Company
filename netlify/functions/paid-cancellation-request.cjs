const {headers,reply,adminClient}=require('./_shared.cjs');
exports.handler=async e=>{
 if(e.httpMethod==='OPTIONS')return{statusCode:204,headers};
 if(!['POST','GET'].includes(e.httpMethod))return reply(405,{error:'Method not allowed'});
 try{
 const token=(e.headers.authorization||e.headers.Authorization||'').replace(/^Bearer\s+/i,'');
 if(!token)return reply(401,{error:'Sign in required'});
 const db=adminClient(),{data:auth,error:authError}=await db.auth.getUser(token);
 if(authError||!auth?.user)return reply(401,{error:'Invalid session'});
 if(e.httpMethod==='GET'){const {data,error}=await db.from('paid_cancellation_requests').select('id,order_id,item_id,quantity,status').eq('customer_id',auth.user.id).order('created_at',{ascending:false});if(error)return reply(500,{error:'Could not load cancellation requests'});return reply(200,{ok:true,requests:data||[]});}
 const {order_id,item_id,quantity}=JSON.parse(e.body||'{}');
 if(!/^[0-9a-f-]{36}$/i.test(order_id||'')||!/^[0-9a-f-]{36}$/i.test(item_id||'')||!Number.isInteger(quantity)||quantity<1)return reply(400,{error:'Invalid cancellation request'});
 const {data:order}=await db.from('orders').select('id,status,payment_status,customer_id').eq('id',order_id).eq('customer_id',auth.user.id).maybeSingle();
 if(!order)return reply(404,{error:'Order not found'});
 if(order.payment_status!=='paid'||!['placed','confirmed','packed'].includes(order.status))return reply(409,{error:'Paid order is not eligible for cancellation request'});
 const {data:item}=await db.from('order_items').select('id,quantity,cancelled_quantity').eq('id',item_id).eq('order_id',order_id).maybeSingle();
 if(!item||quantity>Number(item.quantity)-Number(item.cancelled_quantity||0))return reply(409,{error:'Invalid item or cancellation quantity'});
 const {data:existing,error:lookupError}=await db.from('paid_cancellation_requests').select('id,status').eq('order_id',order_id).eq('item_id',item_id).in('status',['pending','approved']).limit(1);if(lookupError)return reply(500,{error:'Could not check existing requests'});if(existing?.length)return reply(409,{error:'A cancellation request already exists for this item',already_requested:true});
 const {error}=await db.from('paid_cancellation_requests').insert({order_id,item_id,customer_id:auth.user.id,quantity,status:'pending'});
 if(error){console.error('Cancellation request insert failed',error);if(error.code==='23505')return reply(409,{error:'A cancellation request already exists for this item',already_requested:true});return reply(500,{error:'Could not save cancellation request. Please contact store support.'});}
 return reply(200,{ok:true,status:'pending'});
 }catch(err){console.error('Paid cancellation request error',err);return reply(500,{error:'Could not submit cancellation request'});}
};