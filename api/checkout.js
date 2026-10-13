import legacy from '../netlify/functions/checkout.cjs';
export default async function handler(req,res){
  const result=await legacy.handler({httpMethod:req.method,headers:req.headers,body:JSON.stringify(req.body??{})});
  for(const [k,v] of Object.entries(result.headers||{}))res.setHeader(k,v);
  res.status(result.statusCode||500).send(result.body||'');
}
