import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url);
const wranglerRequire=createRequire(require.resolve('wrangler/package.json'));
const {Miniflare}=wranglerRequire('miniflare');
await mkdir('.test-runtime',{recursive:true});
for(const file of ['game','server']){let source=await readFile(`lib/${file}.ts`,'utf8');source=source.replace("from './game'","from './game.js'");await writeFile(`.test-runtime/${file}.js`,ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);}
const {dayAt,resetAt,effectiveStreak,duelResult}=await import('../.test-runtime/game.js');
const {createGameHandler}=await import('../.test-runtime/server.js');
test('Warsaw midnight and DST boundaries',()=>{
 assert.equal(dayAt(new Date('2026-10-07T21:59:59Z')),'2026-10-07');
 assert.equal(dayAt(new Date('2026-10-07T22:00:00Z')),'2026-10-08');
 assert.equal(resetAt(new Date('2026-10-07T17:00:00Z')),Date.parse('2026-10-07T22:00:00Z'));
 assert.equal(resetAt(new Date('2026-03-28T23:00:00Z')),Date.parse('2026-03-29T22:00:00Z'));
 assert.equal(resetAt(new Date('2026-10-24T22:00:00Z')),Date.parse('2026-10-25T23:00:00Z'));
 assert.equal(effectiveStreak({last_day:'2026-10-05',streak:90},'2026-10-07'),0);
 assert.equal(effectiveStreak({last_day:'2026-10-06',streak:90},'2026-10-07'),90);
});
test('Duel waits for complete days, rewards survivor and ties correctly',()=>{
 assert.deepEqual(duelResult('2026-10-07','2026-10-07',new Set(),new Set()),{score:0,ended:null,winner:null});
 assert.deepEqual(duelResult('2026-10-07','2026-10-08',new Set(['2026-10-07']),new Set()),{score:0,ended:'2026-10-07',winner:'a'});
 assert.deepEqual(duelResult('2026-10-07','2026-10-09',new Set(['2026-10-07']),new Set(['2026-10-07'])),{score:1,ended:'2026-10-08',winner:null});
});
test('Real D1 integration: accounts, atomic rewards, inventory, friendships and challenges',async t=>{
 const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("test")}}',d1Databases:['DB']});
 t.after(()=>mf.dispose());const db=await mf.getD1Database('DB');
 const migration=await readFile('drizzle/0000_handy_jazinda.sql','utf8');for(const sql of migration.split('--> statement-breakpoint'))if(sql.trim())await db.prepare(sql.trim()).run();
 let now=new Date('2026-10-07T17:00:00Z');const handle=createGameHandler(db,()=>now);
 function client(){let cookie='';return async(action,body={},options={})=>{const req=new Request('https://button.test/api/game'+(action===null?'?'+new URLSearchParams(body):''),action===null?{headers:{cookie}}:{method:'POST',headers:{'content-type':'application/json',origin:options.origin||'https://button.test',cookie,'cf-connecting-ip':options.ip||'198.51.100.1'},body:JSON.stringify({action,...body})});const response=await handle(req);const set=response.headers.get('set-cookie');if(set)cookie=set.split(';')[0];return {status:response.status,data:await response.json(),cookie:set};};}
 const a=client(),b=client(),c=client(),anon=client();
 await t.test('Guest cannot mutate; cross-origin is rejected',async()=>{assert.equal((await anon('click')).status,401);assert.equal((await anon('register',{username:'Alice',password:'password123'},{origin:'https://evil.test'})).status,403);});
 await t.test('Registration, case-insensitive uniqueness and secure session',async()=>{const r=await a('register',{username:'Alice',password:'password123'});assert.equal(r.status,200);assert.match(r.cookie,/HttpOnly; SameSite=Lax/);assert.match(r.cookie,/Secure/);assert.equal((await anon('register',{username:'ALICE',password:'password123'})).status,409);assert.equal((await b('register',{username:'Bob',password:'password123'})).status,200);assert.equal((await c('register',{username:'Carol',password:'password123'})).status,200);const u=await db.prepare('SELECT * FROM users WHERE username=?').bind('Alice').first();assert.notEqual(u.password,'password123');assert.equal(u.password.length,64);const state=await a(null);assert.equal(state.data.me.username,'Alice');assert.equal(state.data.me.password,undefined);});
 await t.test('Concurrent duplicate clicks award exactly once',async()=>{const clicks=await Promise.all(Array.from({length:10},()=>a('click')));assert.equal(clicks.filter(r=>r.status===200).length,1);assert.equal(clicks.filter(r=>r.status===409).length,9);const state=await a(null);assert.equal(state.data.me.total,1);assert.equal(state.data.me.balance,100);assert.equal(state.data.me.streak,1);assert.equal(state.data.stats.today,1);});
 let aid,bid,cid;
 await t.test('Friend requests require recipient acceptance',async()=>{aid=(await a(null)).data.me.id;bid=(await b(null)).data.me.id;cid=(await c(null)).data.me.id;assert.equal((await a('friend',{target:bid})).status,200);assert.equal((await a('friend_accept',{target:bid})).status,403);assert.equal((await c('friend_accept',{target:aid})).status,403);assert.equal((await b('friend_accept',{target:aid})).status,200);assert.equal((await a(null)).data.friends[0].status,'accepted');});
 let duel;
 await t.test('Challenges only between friends; equal next-day start',async()=>{assert.equal((await a('challenge',{target:cid})).status,403);assert.equal((await a('challenge',{target:bid})).status,200);assert.equal((await a('challenge',{target:bid})).status,409);duel=(await b(null)).data.challenges[0].id;assert.equal((await a('challenge_accept',{id:duel})).status,403);assert.equal((await c('challenge_accept',{id:duel})).status,404);assert.equal((await b('challenge_accept',{id:duel})).status,200);assert.equal((await a(null)).data.challenges[0].start,'2026-10-08');});
 await t.test('Midnight permits click; no early loss; missed day ends duel',async()=>{now=new Date('2026-10-07T22:00:00Z');assert.equal((await a('click')).status,200);let state=(await a(null)).data;assert.equal(state.me.streak,2);assert.equal(state.challenges[0].status,'active');assert.equal(state.challenges[0].score,0);now=new Date('2026-10-08T22:00:00Z');state=(await a(null)).data;assert.equal(state.challenges[0].status,'finished');assert.equal(state.challenges[0].winner,aid);assert.equal(state.me.wins,1);assert.equal((await a('click')).status,200);assert.equal((await a(null)).data.me.balance,300);});
 await t.test('Purchases cannot overspend or charge twice; equip requires ownership',async()=>{assert.equal((await a('equip',{item:'gold'})).status,403);assert.equal((await a('buy',{item:'gold'})).status,409);const r=await Promise.all([a('buy',{item:'ocean'}),a('buy',{item:'ocean'}),a('buy',{item:'frog'})]);assert.equal(r.filter(r=>r.status===200).length,1);let state=(await a(null)).data;assert.equal(state.me.balance,0);assert.equal(state.me.lifetime,300);assert.deepEqual(state.inventory,['ocean']);assert.equal((await a('equip',{item:'ocean'})).status,200);assert.equal((await a(null)).data.me.button,'ocean');});
 await t.test('Skipped day resets current series and preserves record',async()=>{now=new Date('2026-10-11T10:00:00Z');assert.equal((await a(null)).data.me.streak,0);assert.equal((await a('click')).status,200);const state=(await a(null)).data;assert.equal(state.me.streak,1);assert.equal(state.me.best,3);assert.equal(state.me.total,4);});
 await t.test('Profile public stats and escaped search',async()=>{await a('bio',{bio:'Hello <script>world</script>'});const p=(await anon(null,{profile:aid})).data;assert.equal(p.username,'Alice');assert.equal(p.password,undefined);assert.equal(p.history.length,4);assert.equal((await anon(null,{search:"%' OR 1=1--"})).data.ranking.length,0);assert.equal((await anon(null,{search:'ali'})).data.ranking.length,1);});
 await t.test('Password change revokes all sessions and old credentials',async()=>{const a2=client();assert.equal((await a2('login',{username:'alice',password:'wrongpass'})).status,401);assert.equal((await a2('login',{username:'alice',password:'password123'})).status,200);assert.equal((await a('password',{oldPassword:'password123',password:'newpassword123'})).status,200);assert.equal((await a2('click')).status,401);assert.equal((await a2('login',{username:'alice',password:'password123'})).status,401);assert.equal((await a2('login',{username:'alice',password:'newpassword123'})).status,200);assert.equal((await a2('logout')).status,200);assert.equal((await a2('click')).status,401);});
 await t.test('Rate limit applies even for varied usernames on one address',async()=>{let status;for(let i=0;i<21;i++)status=(await anon('login',{username:'missing'+i,password:'wrongpass'},{ip:'198.51.100.2'})).status;assert.equal(status,429);});
});
