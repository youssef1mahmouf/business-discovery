const http=require('http'),crypto=require('crypto'),fs=require('fs'),path=require('path');
const PORT=process.env.PORT||3000,DATA_FILE=process.env.DATA_FILE||path.join(__dirname,'..','data.json'),TOKEN_SECRET=process.env.TOKEN_SECRET||'dev-only-change-me',FRONTEND_ORIGIN=process.env.FRONTEND_ORIGIN||'*';
function loadDb(){try{return JSON.parse(fs.readFileSync(DATA_FILE,'utf8'))}catch(_){return{users:[],states:{}}}}
function saveDb(db){fs.writeFileSync(DATA_FILE,JSON.stringify(db,null,2))}
function hashPassword(p){const s=crypto.randomBytes(16).toString('hex');return s+':'+crypto.scryptSync(p,s,64).toString('hex')}
function verifyPassword(p,st){const [s,h]=st.split(':');return crypto.timingSafeEqual(Buffer.from(crypto.scryptSync(p,s,64).toString('hex'),'hex'),Buffer.from(h,'hex'))}
function signToken(payload){const d=Buffer.from(JSON.stringify(payload)).toString('base64url');return d+'.'+crypto.createHmac('sha256',TOKEN_SECRET).update(d).digest('base64url')}
function verifyToken(t){const [d,s]=(t||'').split('.');if(!d||!s)return null;const e=crypto.createHmac('sha256',TOKEN_SECRET).update(d).digest('base64url');if(!crypto.timingSafeEqual(Buffer.from(s),Buffer.from(e)))return null;try{return JSON.parse(Buffer.from(d,'base64url').toString())}catch(_){return null}}
function send(res,st,obj){res.writeHead(st,{'Content-Type':'application/json','Access-Control-Allow-Origin':FRONTEND_ORIGIN,'Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Allow-Methods':'GET,POST,PUT,OPTIONS'});res.end(JSON.stringify(obj))}
function parseBody(req){return new Promise((resolve,reject)=>{let data='';req.on('data',c=>data+=c);req.on('end',()=>{try{resolve(data?JSON.parse(data):{})}catch(e){reject(e)}})})}
const server=http.createServer(async(req,res)=>{
 if(req.method==='OPTIONS'){send(res,204,{});return}
 const url=req.url.split('?')[0];
 try{
  if(req.method==='GET'&&url==='/api/health')return send(res,200,{ok:true});
  if(req.method==='POST'&&url==='/api/auth/register'){const{email,password}=await parseBody(req);if(!email||!password||password.length<8)return send(res,400,{error:'invalid_input'});const db=loadDb();if(db.users.some(u=>u.email===email.toLowerCase()))return send(res,409,{error:'email_in_use'});const user={id:Date.now(),email:email.toLowerCase(),passwordHash:hashPassword(password),createdAt:new Date().toISOString()};db.users.push(user);saveDb(db);return send(res,200,{token:signToken({sub:user.id,email:user.email}),user:{id:user.id,email:user.email}})}
  if(req.method==='POST'&&url==='/api/auth/login'){const{email,password}=await parseBody(req);const db=loadDb();const user=db.users.find(u=>u.email===(email||'').toLowerCase());if(!user||!verifyPassword(password||'',user.passwordHash))return send(res,401,{error:'invalid_credentials'});return send(res,200,{token:signToken({sub:user.id,email:user.email}),user:{id:user.id,email:user.email}})}
  if(req.method==='GET'&&url==='/api/auth/me'){const auth=req.headers.authorization||'';const token=auth.startsWith('Bearer ')?auth.slice(7):null;const payload=verifyToken(token);if(!payload)return send(res,401,{error:'unauthorized'});return send(res,200,{user:{id:payload.sub,email:payload.email}})}
  if(req.method==='POST'&&url==='/api/auth/change-password'){const auth=req.headers.authorization||'';const token=auth.startsWith('Bearer ')?auth.slice(7):null;const payload=verifyToken(token);if(!payload)return send(res,401,{error:'unauthorized'});const{currentPassword,newPassword}=await parseBody(req);if(!newPassword||newPassword.length<8)return send(res,400,{error:'invalid_input'});const db=loadDb();const user=db.users.find(u=>u.id===payload.sub);if(!user||!verifyPassword(currentPassword||'',user.passwordHash))return send(res,401,{error:'invalid_credentials'});user.passwordHash=hashPassword(newPassword);saveDb(db);return send(res,200,{ok:true})}
  if(req.method==='GET'&&url==='/api/state'){const auth=req.headers.authorization||'';const token=auth.startsWith('Bearer ')?auth.slice(7):null;const payload=verifyToken(token);if(!payload)return send(res,401,{error:'unauthorized'});const db=loadDb();return send(res,200,{state:db.states[payload.sub]||null})}
  if(req.method==='PUT'&&url==='/api/state'){const auth=req.headers.authorization||'';const token=auth.startsWith('Bearer ')?auth.slice(7):null;const payload=verifyToken(token);if(!payload)return send(res,401,{error:'unauthorized'});const{state}=await parseBody(req);if(!state||typeof state!=='object')return send(res,400,{error:'invalid_state'});const db=loadDb();db.states[payload.sub]=state;saveDb(db);return send(res,200,{ok:true,updatedAt:new Date().toISOString()})}
  send(res,404,{error:'not_found'});
 }catch(e){send(res,500,{error:'server_error'})}
});
server.listen(PORT,()=>console.log('Backend listening on '+PORT));
