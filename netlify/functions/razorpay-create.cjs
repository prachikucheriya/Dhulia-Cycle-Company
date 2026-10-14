const{headers,reply,adminClient}=require('./_shared.cjs');
const crypto=require('crypto');
exports.handler=async event=>{
 if(event.httpMethod==='OPTIONS')return{statusCode:204,headers};
 if(event.httpMethod!=='POST')return reply(405,{error:'Method not allowed'});
 try{
 const key=process.env.RAZORPAY_KEY_ID,secret=process.env.RAZORPAY_KEY_SECRET;
 if(!key?.startsWith('rzp_test_')||!secret)return reply(503,{error:'Razorpay test mode is not configured'});
 const b=JSON.parse(event.body||'{}'),a=b.address||{};
 if(!Array.isArray(b.items)||!b.items.length||b.items.length>40)return reply(400,{error:'Invalid cart'});
 if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.email||'')||!/^[6-9]\d{9}$/.test(b.phone||'')||!b.name?.trim()||!a.line1?.trim()||!a.city?.trim()||!a.state?.trim()||!/^[1-9]\d{5}$/.test(a.pin||''))return reply(400,{error:'Please enter valid delivery details'});
 const db=adminClient();let customerId=null;
 if(event.headers.authorization?.startsWith('Bearer ')){const{data}=await db.auth.getUser(event.headers.authorization.slice(7));customerId=data?.user?.id||null;}
 const ids=[...new Set(b.items.map(i=>i.id))];
 const{data:products,error:pe}=await db.from('products').select('id,name,sku,price,stock,active').in('id',ids);
 if(pe)throw pe;if(products.length!==ids.length)return reply(409,{error:'Product unavailable'});
 let subtotal=0,lines=[];
 for(const item of b.items){const p=products.find(p=>p.id===item.id),q=Number(item.quantity);if(!p?.active||!Number.isInteger(q)||q<1||q>20||q>p.stock)return reply(409,{error:'Invalid quantity or insufficient stock: '+(p?.name||'product')});const price=Number(p.price);subtotal+=price*q;lines.push({product_id:p.id,name:p.name,sku:p.sku,price,quantity:q,line_total:price*q});}
 const shipping=subtotal>=10000?0:299,amount=Math.round((subtotal+shipping)*100);
 const auth='Basic '+Buffer.from(key+':'+secret).toString('base64');
 const response=await fetch('https://api.razorpay.com/v1/orders',{method:'POST',headers:{Authorization:auth,'Content-Type':'application/json'},body:JSON.stringify({amount,currency:'INR',receipt:'DCC-'+crypto.randomBytes(10).toString('hex')})});
 const paymentOrder=await response.json();if(!response.ok||!paymentOrder.id){console.error('Razorpay order creation failed',response.status);return reply(502,{error:'Could not start test payment'});}
 const{error}=await db.from('razorpay_payment_intents').insert({razorpay_order_id:paymentOrder.id,customer_id:customerId,customer_name:b.name.trim(),email:b.email.trim(),phone:b.phone,address:a,notes:(b.notes||'').slice(0,500),lines,shipping,amount_paise:amount});
 if(error){console.error(error);return reply(500,{error:'Could not save payment session. Please retry.'});}
 return reply(200,{key_id:key,razorpay_order_id:paymentOrder.id,amount,currency:'INR',customer_name:b.name,email:b.email,phone:b.phone});
 }catch(err){console.error(err);return reply(500,{error:'Could not start payment'});}
};
