const {createClient}=require('@supabase/supabase-js');
const headers={'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Allow-Methods':'POST, OPTIONS'};
const reply=(statusCode,data)=>({statusCode,headers,body:JSON.stringify(data)});
function adminClient(){if(!process.env.SUPABASE_URL||!process.env.SUPABASE_SERVICE_ROLE_KEY)throw Error('Server environment not configured');return createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})}
async function sendEmail(to,subject,html){if(!process.env.RESEND_API_KEY||!process.env.MAIL_FROM)return {sent:false,reason:'Email provider not configured'};let r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({from:process.env.MAIL_FROM,to:[to],subject,html})});if(!r.ok)throw Error('Email service returned '+r.status);return {sent:true}}
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
module.exports={headers,reply,adminClient,sendEmail,esc};
