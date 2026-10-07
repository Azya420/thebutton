import {CATALOG,dayAt,shiftDay,resetAt,effectiveStreak,duelResult} from './game';
type Row=Record<string,any>;
class GameError extends Error {constructor(message:string,public status=400){super(message);}}
const hex=(b:ArrayBuffer|Uint8Array)=>Array.from(new Uint8Array(b as ArrayBuffer)).map(x=>x.toString(16).padStart(2,'0')).join('');
const random=()=>hex(crypto.getRandomValues(new Uint8Array(32)));
async function hash(s:string){return hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));}
async function passwordHash(password:string,salt:string){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);return hex(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:new TextEncoder().encode(salt),iterations:100000},key,256));}
function equal(a:string,b:string){let n=a.length^b.length;for(let i=0;i<a.length;i++)n|=a.charCodeAt(i)^b.charCodeAt(i);return n===0;}
function publicUser(u:Row,day:string){return {id:u.id,username:u.username,created:u.created,balance:u.balance,lifetime:u.lifetime,total:u.total,streak:effectiveStreak(u as any,day),best:u.best,last_day:u.last_day,button:u.button,avatar:u.avatar,frame:u.frame,bio:u.bio};}
export function createGameHandler(db:D1Database,clock=()=>new Date()){
 const q=(sql:string,...args:any[])=>db.prepare(sql).bind(...args);
 const all=async(sql:string,...args:any[])=> (await q(sql,...args).all<Row>()).results;
 const one=(sql:string,...args:any[])=>q(sql,...args).first<Row>();
 async function auth(req:Request){const token=req.headers.get('cookie')?.match(/(?:^|;\s*)tb_session=([a-f0-9]{64})(?:;|$)/)?.[1];if(!token)return null;return one('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>?',await hash(token),clock().getTime());}
 async function rate(req:Request,username:string){const ip=req.headers.get('cf-connecting-ip')||'unknown';const now=clock().getTime();const key=await hash(ip+'|'+Math.floor(now/900000));const userkey=await hash('user|'+username+'|'+Math.floor(now/900000));const results=await db.batch([q('DELETE FROM rate_limits WHERE expires<?',now),...Array.from(new Set([key,userkey])).map(k=>q('INSERT INTO rate_limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count',k,now+900000))]);if(results.slice(1).some(r=>(r.results[0] as Row)?.count>20))throw new GameError('Za dużo prób. Spróbuj ponownie za 15 minut.',429);}
 async function settle(me:Row,day:string){const list=await all(`SELECT c.*,ua.username AS a_name,ub.username AS b_name FROM challenges c JOIN users ua ON ua.id=c.a JOIN users ub ON ub.id=c.b WHERE c.a=? OR c.b=? ORDER BY c.created DESC LIMIT 100`,me.id,me.id);const active=list.filter(c=>c.status==='active');if(active.length){const earliest=active.map(c=>c.start).sort()[0];const ids=Array.from(new Set(active.flatMap(c=>[c.a,c.b])));const rows=await all(`SELECT user_id,day FROM clicks WHERE user_id IN (${ids.map(()=>'?').join(',')}) AND day>=?`,...ids,earliest);for(const c of active){const r=duelResult(c.start,day,new Set(rows.filter(r=>r.user_id===c.a).map(r=>r.day)),new Set(rows.filter(r=>r.user_id===c.b).map(r=>r.day)));c.score=r.score;if(r.ended){c.status='finished';c.winner=r.winner==='a'?c.a:r.winner==='b'?c.b:null;c.ended=r.ended;await q('UPDATE challenges SET status=?,winner=?,score=?,ended=? WHERE id=? AND status=?','finished',c.winner,r.score,r.ended,c.id,'active').run();}}}return list;}
 async function profile(id:string,day:string){const u=await one('SELECT * FROM users WHERE id=?',id);if(!u)throw new GameError('Nie znaleziono gracza.',404);return {...publicUser(u,day),history:await all('SELECT day,at FROM clicks WHERE user_id=? AND day>=? ORDER BY day',id,shiftDay(day,-83)),wins:(await one('SELECT COUNT(*) AS n FROM challenges WHERE winner=? AND status=?',id,'finished'))?.n||0};}
 function response(data:any,status=200,cookie?:string){return Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...(cookie?{'Set-Cookie':cookie}:{})}});}
 const cookie=(req:Request,value:string,age:number)=>`tb_session=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${new URL(req.url).protocol==='https:'?'; Secure':''}`;
 return async function handle(req:Request){try{
  const now=clock(),day=dayAt(now),yesterday=shiftDay(day,-1),url=new URL(req.url);
  if(req.method!=='GET'&&req.method!=='POST')return response({error:'Niedozwolona metoda.'},405);
  if(req.method==='POST'){const origin=req.headers.get('origin');if(origin!==url.origin)throw new GameError('Niedozwolone źródło żądania.',403);const type=req.headers.get('content-type')||'';if(!type.includes('application/json'))throw new GameError('Wymagany JSON.',415);if(Number(req.headers.get('content-length')||0)>4096)throw new GameError('Żądanie jest za duże.',413);}
  let me=await auth(req);
  if(req.method==='GET'){
   if(url.searchParams.get('profile'))return response(await profile(url.searchParams.get('profile')!,day));
   const search=(url.searchParams.get('search')||'').slice(0,24).replace(/[\\%_]/g,'\\$&');
   const sort=url.searchParams.get('sort');const order=sort==='points'?'lifetime DESC,best DESC':sort==='best'?'best DESC,lifetime DESC':'current_streak DESC,lifetime DESC';
   const ranking=await all(`SELECT id,username,avatar,frame,button,total,best,lifetime,last_day,streak,CASE WHEN last_day IN (?,?) THEN streak ELSE 0 END AS current_streak FROM users WHERE username_key LIKE ? ESCAPE '\\' ORDER BY ${order},created ASC,id ASC LIMIT 100`,day,yesterday,'%'+search.toLowerCase()+'%');
   const stats=await one('SELECT (SELECT COUNT(*) FROM users) AS players,(SELECT COUNT(*) FROM clicks WHERE day=?) AS today,(SELECT COUNT(*) FROM clicks) AS clicks,(SELECT MAX(best) FROM users) AS record',day);
   if(!me)return response({me:null,day,serverTime:now.getTime(),resetAt:resetAt(now),ranking:ranking.map(u=>publicUser({...u,balance:undefined},day)),stats,catalog:CATALOG});
   const friends=await all(`SELECT f.*,u.id,u.username,u.avatar,u.frame,u.last_day,u.streak,u.total,u.best,u.lifetime FROM friends f JOIN users u ON u.id=CASE WHEN f.a=? THEN f.b ELSE f.a END WHERE f.a=? OR f.b=? ORDER BY f.created DESC`,me.id,me.id,me.id);
   const challenges=await settle(me,day);
   return response({me:await profile(me.id,day),day,serverTime:now.getTime(),resetAt:resetAt(now),ranking:ranking.map(u=>publicUser({...u,balance:undefined},day)),stats,catalog:CATALOG,friends:friends.map(f=>({...f,streak:effectiveStreak(f as any,day)})),challenges,inventory:(await all('SELECT item FROM purchases WHERE user_id=?',me.id)).map(r=>r.item)});
  }
  const raw=await req.text();if(raw.length>4096)throw new GameError('Żądanie jest za duże.',413);let body:Row;try{body=JSON.parse(raw);}catch{throw new GameError('Nieprawidłowe żądanie.');}const action=body.action;
  if(action==='register'||action==='login'){
   const username=typeof body.username==='string'?body.username.trim():'';const password=typeof body.password==='string'?body.password:'';
   if(!/^[a-zA-Z0-9_]{3,20}$/.test(username))throw new GameError('Nazwa: 3–20 znaków, litery bez polskich znaków, cyfry lub _.');
   if(password.length<8||password.length>128)throw new GameError('Hasło musi mieć od 8 do 128 znaków.');
   await rate(req,username.toLowerCase());let u=await one('SELECT * FROM users WHERE username_key=?',username.toLowerCase());
   if(action==='register'){
    if(u)throw new GameError('Ta nazwa jest już zajęta.',409);const salt=random(),id=crypto.randomUUID(),hashed=await passwordHash(password,salt);
    try{await q('INSERT INTO users(id,username,username_key,password,salt,created) VALUES(?,?,?,?,?,?)',id,username,username.toLowerCase(),hashed,salt,now.getTime()).run();}catch(e){if(String(e).includes('UNIQUE'))throw new GameError('Ta nazwa jest już zajęta.',409);throw e;}u=await one('SELECT * FROM users WHERE id=?',id);
   }else{const check=await passwordHash(password,u?.salt||'dummy-salt');if(!u||!equal(check,u.password))throw new GameError('Nieprawidłowa nazwa lub hasło.',401);}
   const token=random();await db.batch([q('DELETE FROM sessions WHERE expires<?',now.getTime()),q('INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)',await hash(token),u!.id,now.getTime()+30*86400000)]);
   return response({ok:true},200,cookie(req,token,30*86400));
  }
  if(!me)throw new GameError('Zaloguj się, aby zagrać.',401);
  if(action==='logout'){const token=req.headers.get('cookie')?.match(/tb_session=([a-f0-9]{64})/)?.[1];if(token)await q('DELETE FROM sessions WHERE token=?',await hash(token)).run();return response({ok:true},200,cookie(req,'',0));}
  if(action==='click'){const r=await q('INSERT OR IGNORE INTO clicks(user_id,day,at) VALUES(?,?,?)',me.id,day,now.getTime()).run();if(r.meta.changes===0)throw new GameError('Dzisiejszy klik jest już zapisany. Wróć po północy!',409);return response({ok:true,reward:100});}
  if(action==='buy'){
   const item=CATALOG.find(i=>i.id===body.item);if(!item||item.price===0)throw new GameError('Nieprawidłowy przedmiot.');
   const r=await q('INSERT OR IGNORE INTO purchases(user_id,item,price,at) SELECT id,?,?,? FROM users WHERE id=? AND balance>=?',item.id,item.price,now.getTime(),me.id,item.price).run();
   if(!r.meta.changes)throw new GameError('Masz już ten przedmiot albo brakuje Ci punktów.',409);return response({ok:true});
  }
  if(action==='equip'){const item=CATALOG.find(i=>i.id===body.item);if(body.item==='default'||body.item==='none'){await q(`UPDATE users SET ${body.item==='default'?'avatar':'frame'}=? WHERE id=?`,body.item,me.id).run();return response({ok:true});}if(!item)throw new GameError('Nieprawidłowy przedmiot.');if(item.price>0&&!await one('SELECT item FROM purchases WHERE user_id=? AND item=?',me.id,item.id))throw new GameError('Najpierw kup ten przedmiot.',403);await q(`UPDATE users SET ${item.kind}=? WHERE id=?`,item.id,me.id).run();return response({ok:true});}
  if(action==='bio'){const bio=typeof body.bio==='string'?body.bio.trim():'';if(bio.length>160)throw new GameError('Opis może mieć do 160 znaków.');await q('UPDATE users SET bio=? WHERE id=?',bio,me.id).run();return response({ok:true});}
  if(action==='password'){if(typeof body.password!=='string'||body.password.length<8||body.password.length>128)throw new GameError('Nowe hasło: 8–128 znaków.');await rate(req,me.username_key);if(typeof body.oldPassword!=='string'||!equal(await passwordHash(body.oldPassword,me.salt),me.password))throw new GameError('Obecne hasło jest nieprawidłowe.',401);const salt=random();await db.batch([q('UPDATE users SET password=?,salt=? WHERE id=?',await passwordHash(body.password,salt),salt,me.id),q('DELETE FROM sessions WHERE user_id=?',me.id)]);return response({ok:true},200,cookie(req,'',0));}
  if(action==='friend'||action==='friend_accept'||action==='friend_remove'||action==='challenge'){
   const other=await one('SELECT id FROM users WHERE id=?',typeof body.target==='string'?body.target:'');if(!other||other.id===me.id)throw new GameError('Wybierz innego gracza.');const [a,b]=[me.id,other.id].sort();const f=await one('SELECT * FROM friends WHERE a=? AND b=?',a,b);
   if(action==='friend'){if(f)throw new GameError('Zaproszenie lub znajomość już istnieje.',409);if((await one('SELECT COUNT(*) AS n FROM friends WHERE a=? OR b=?',me.id,me.id))!.n>=200)throw new GameError('Limit 200 znajomości i zaproszeń.');await q('INSERT OR IGNORE INTO friends(a,b,sender,created) VALUES(?,?,?,?)',a,b,me.id,now.getTime()).run();}
   if(action==='friend_accept'){if(!f||f.sender===me.id||f.status!=='pending')throw new GameError('Nie masz takiego zaproszenia.',403);await q('UPDATE friends SET status=? WHERE a=? AND b=?','accepted',a,b).run();}
   if(action==='friend_remove'){await q('DELETE FROM friends WHERE a=? AND b=?',a,b).run();}
   if(action==='challenge'){if(f?.status!=='accepted')throw new GameError('Wyzwania możesz wysyłać znajomym.',403);await settle(me,day);if((await one("SELECT COUNT(*) AS n FROM challenges WHERE (a=? OR b=?) AND status IN ('pending','active')",me.id,me.id))!.n>=20)throw new GameError('Limit 20 otwartych wyzwań.');try{await q('INSERT INTO challenges(id,a,b,sender,created) VALUES(?,?,?,?,?)',crypto.randomUUID(),a,b,me.id,now.getTime()).run();}catch(e){if(String(e).includes('UNIQUE'))throw new GameError('Macie już otwarte wyzwanie.',409);throw e;}}
   return response({ok:true});
  }
  if(action==='challenge_accept'||action==='challenge_decline'){
   const c=await one('SELECT * FROM challenges WHERE id=?',typeof body.id==='string'?body.id:'');if(!c||![c.a,c.b].includes(me.id)||c.status!=='pending')throw new GameError('Wyzwanie nie jest dostępne.',404);if(action==='challenge_accept'){if(c.sender===me.id)throw new GameError('Poczekaj na akceptację znajomego.',403);await q("UPDATE challenges SET status='active',start=? WHERE id=? AND status='pending'",shiftDay(day,1),c.id).run();}else{await q("UPDATE challenges SET status='declined' WHERE id=? AND status='pending'",c.id).run();}return response({ok:true});
  }
  throw new GameError('Nieznana akcja.');
 }catch(e){if(e instanceof GameError)return response({error:e.message},e.status);console.error('The Button API',e);return response({error:'Nie udało się wykonać operacji. Spróbuj ponownie.'},500);}};
}
