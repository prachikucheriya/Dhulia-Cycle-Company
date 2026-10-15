const {headers,reply,adminClient}=require('./_shared.cjs');
exports.handler=async event=>{
 if(event.httpMethod==='OPTIONS')return{statusCode:204,headers};
 if(!['GET','POST'].includes(event.httpMethod))return reply(405,{error:'Method not allowed'});
 try{
 const token=(event.headers.authorization||event.headers.Authorization||'').replace(/^Bearer\s+/i,'');
 if(!token)return reply(401,{error:'Admin sign-in required'});
 const db=adminClient(),{data:auth,error:ae}=await db.auth.getUser(token);
 if(ae||!auth?.user)return reply(401,{error:'Invalid admin session'});
 const {data:profile}=await db.from('profiles').select('role').eq('id',auth.user.id).maybeSingle();
 if(profile?.role!=='admin')return reply(403,{error:'Admin access required'});
 if(event.httpMethod==='GET'){
 const {data,error}=await db.from('paid_cancellation_requests').select('id,order_id,item_id,customer_id,quantity,status,created_at').order('created_at',{ascending:false}).limit(200);
 if(error)return reply(500,{error:'Could not load cancellation requests'});
 const orderIds=[...new Set((data||[]).map(x=>x.order_id))],itemIds=[...new Set((data||[]).map(x=>x.item_id))];
 const [{data:orders},{data:items}]=await Promise.all([orderIds.length?db.from('orders').select('id,order_number,customer_name,email,payment_status,status').in('id',orderIds):{data:[]},itemIds.length?db.from('order_items').select('id,name,price,quantity,cancelled_quantity').in('id',itemIds):{data:[]}]);
 return reply(200,{ok:true,requests:(data||[]).map(x=>({...x,order:(orders||[]).find(o=>o.id===x.order_id)||null,item:(items||[]).find(i=>i.id===x.item_id)||null}))});
 }
 const b=JSON.parse(event.body||'{}');
 if(!/^[0-9a-f-]{36}$/i.test(b.request_id||'')||!['approved','rejected'].includes(b.status))return reply(400,{error:'Invalid review details'});
 const {data:request,error:re}=await db.from('paid_cancellation_requests').select('id,status').eq('id',b.request_id).maybeSingle();
 if(re||!request)return reply(404,{error:'Request not found'});
 if(request.status!=='pending')return reply(409,{error:'Request already reviewed; refresh the list'});
 const {data:updated,error}=await db.from('paid_cancellation_requests').update({status:b.status}).eq('id',b.request_id).eq('status','pending').select('id,status').maybeSingle();
 if(error||!updated)return reply(409,{error:'Could not update request'});
 return reply(200,{ok:true,status:updated.status,refund_processed:false});
 }catch(e){console.error('Admin cancellation review error',e);return reply(500,{error:'Could not process request'});}
};