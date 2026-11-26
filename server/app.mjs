import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { activeRoutes, openStore, quote, save, setPause, tiersFor } from './store.mjs';

import {initSecurity,signIn,sessionFor,audit} from './security.mjs';
import {databasePath,loadKey} from './private-storage.mjs';
import {initRequests,submitRequest} from './requests.mjs';
import {addLocation, locationDirectory} from './locations.mjs';
import {readCatalog,saveInstrument} from './catalog.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const port=Number(process.env.PORT || 8080);
const publicOrigin=process.env.BX_ORIGIN;
if ((publicOrigin && (new URL(publicOrigin).protocol!=='https:' || new URL(publicOrigin).origin!==publicOrigin)) ||
    (process.env.NODE_ENV==='production' && !publicOrigin)) throw Error('Для публикации укажите BX_ORIGIN в формате https://домен');
const authorities = publicOrigin ? [new URL(publicOrigin).host] : ['localhost:'+port,'127.0.0.1:'+port];
const cookieName = publicOrigin ? '__Host-bx-session' : 'bx-local-'+port;
const cookie = (value,age) => cookieName+'='+value+'; Path=/; HttpOnly; SameSite=Strict; Max-Age='+age+(publicOrigin?'; Secure':'');
const db=openStore(databasePath());
initRequests(db,loadKey(db));
initSecurity(db);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.jpeg':'image/jpeg','.ttf':'font/ttf','.mp3':'audio/mpeg','.mp4':'video/mp4'};
const publicFiles=new Set(['index.html','about/index.html','styles.css','desk.css','mobile-framing.css','calculator-typography.css','main.js','flight.js','desk.js','exchange-core.js','mobile-framing.js','admin/index.html','admin/admin.js','admin/admin.css','admin/catalog.js','admin/access.js','admin/login.html','admin/login.js']);
function locationSettings() {
  const operationPauses = db.prepare("SELECT scope,name FROM location_pauses WHERE scope IN ('intake','payout') ORDER BY name").all();
  // Keep the original country/city pause list usable by older admin pages.
  const pauses = db.prepare(`SELECT scope,name FROM location_pauses WHERE scope='country'
    UNION ALL SELECT 'city',name FROM location_pauses WHERE scope IN ('intake','payout')
    GROUP BY name HAVING COUNT(*)=2 ORDER BY name`).all();
  return {...locationDirectory(db), pauses, operationPauses};
}
// Sample repeated denials to keep malformed traffic from flooding the audit journal.
const deniedAt=new Map();
function noteDenial(event,actor=null) {
  const now=Date.now();
  if(now-(deniedAt.get(event)||0)>=60000) { audit(db,actor,event);deniedAt.set(event,now); }
}
createServer({requestTimeout:30000,headersTimeout:15000},async(req,res)=>{
  function json(status,body){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(body));}
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('X-Frame-Options','DENY');
  if(publicOrigin) res.setHeader('Strict-Transport-Security','max-age=31536000');
  if(!authorities.includes(req.headers.host))return json(403,{error:'Только локальный доступ.'});
  try {
    const url=new URL(req.url,'http://'+req.headers.host);
    const path=decodeURIComponent(url.pathname);
    const adminApi=path.startsWith('/api/admin/');
    const adminPage=path==='/admin'||path.startsWith('/admin/');
    const login=path==='/api/auth/login';
    const origin=publicOrigin || 'http://'+req.headers.host;
    let session;
    if(adminApi || adminPage || login) {
      res.setHeader('Cache-Control','no-store');
      res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
      const publicLoginFile=['/admin/login','/admin/login.html','/admin/login.js','/admin/admin.css'].includes(path);
      if(!publicLoginFile && !login) {
        session=sessionFor(db,req.headers.cookie,cookieName);
        if(!session) {
          if(adminApi) noteDenial('access.denied');
          if(adminPage) { res.writeHead(303,{Location:'/admin/login'});return res.end(); }
          return json(401,{error:'Войдите в админку.'});
        }
      }
    }
    if (req.method === 'POST' && ['/api/admin/rules', '/api/admin/pauses', '/api/admin/locations', '/api/admin/catalog', '/api/requests/check', '/api/requests','/api/auth/login','/api/admin/logout'].includes(path)) {
      if (req.headers.origin !== origin || req.headers['content-type'] !== 'application/json') {
        if(adminApi || login) noteDenial('origin.denied',session?.login);
        return json(403, {error: 'Недопустимый источник запроса.'});
      }
      if(adminApi && req.headers['x-bx-csrf']!==session.csrf) {
        noteDenial('csrf.denied',session.login);
        return json(403,{error:'Обновите страницу и повторите действие.'});
      }
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > (path === '/api/admin/catalog' ? 720000 : 16000)) return json(413, {error: 'Слишком большой запрос.'});
        chunks.push(chunk);
      }
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if(login) {
          const result=await signIn(db,body,req.socket.remoteAddress);
          if(result.retry) res.setHeader('Retry-After',String(result.retry));
          if(result.token) res.setHeader('Set-Cookie',cookie(result.token,28800));
          return json(result.status,result.token ? {ok:true} : {error:result.error});
        }
        if(adminApi) {
          const current=sessionFor(db,req.headers.cookie,cookieName);
          if(!current) return json(401,{error:'Войдите в админку.'});
        }
        if(path==='/api/admin/logout') {
          db.prepare('DELETE FROM sessions WHERE digest=?').run(session.digest);
          res.setHeader('Set-Cookie',cookie('',0));
          audit(db,session.login,'logout');
          return json(200,{ok:true});
        }
        if (path === '/api/requests') {
          const {status,...result} = submitRequest(db,body);
          return json(status,result);
        }
        if(adminApi) {
          let result,target=null;
          db.exec('BEGIN IMMEDIATE');
          try {
            if(path==='/api/admin/locations') { result=addLocation(db,body); target=result.location||result.country; }
            if(path==='/api/admin/catalog') { result={key:saveInstrument(db,body)};target=result.key; }
            if(path==='/api/admin/rules') { result={id:save(db,body)};target=String(result.id); }
            if(path==='/api/admin/pauses') { setPause(db,body);result={ok:true};target=body.scope+' · '+body.name; }
            const operation=path.slice(11);
            const action=operation==='catalog' ? (body.key?'updated':'created') :
              operation==='rules' ? (body.id?'updated':'created') :
              operation==='pauses' ? (body.paused?'paused':'resumed') : 'saved';
            audit(db,session.login,operation+'.'+action,target);
            db.exec('COMMIT');
          } finally { if(db.isTransaction) db.exec('ROLLBACK'); }
          if(path==='/api/admin/locations' || path==='/api/admin/pauses') Object.assign(result,locationSettings());
          return json(path==='/api/admin/locations'?201:200,result);
        }
        // Use the exact city and input from the open form. Never substitute a different location.
        const current = quote(db, body);
        if (current.error) return json(409, {error: current.error});
        if (['rate', 'send', 'receive'].some(key => current[key] !== body.expected?.[key]))
          return json(409, {error: 'Расчёт изменился. Проверьте суммы и подтвердите снова.'});
        return json(200, {ok: true});
      } catch (error) {
        if(adminApi) audit(db,session.login,path.slice(11)+'.rejected');
        const safe = adminApi && /^[А-ЯЁ]/u.test(error.message);
        return json(400,{error:safe ? error.message : 'Не удалось обработать запрос. Проверьте введённые данные.'});
      }
    }
    if(req.method!=='GET' && req.method!=='HEAD')return json(405,{error:'Метод недоступен.'});
    if (path === '/api/admin/session') return json(200,{login:session.login,csrf:session.csrf});
    if (path === '/api/admin/audit') return json(200,db.prepare('SELECT at,actor,event,target FROM audit ORDER BY id DESC LIMIT 100').all());
    if (path === '/api/admin/locations') return json(200, locationSettings());
    if (path === '/api/admin/rules') {
      const rules = db.prepare('SELECT * FROM rules ORDER BY id').all()
        .map(rule => ({...rule, tiers: tiersFor(db, rule.id)}));
      return json(200, {rules, catalog:readCatalog(db,true), ...locationSettings()});
    }
    if (path === '/api/admin/catalog') return json(200, readCatalog(db,true));
    if (path === '/api/catalog') return json(200, readCatalog(db));
    if (path.startsWith('/api/icons/')) {
      const row = db.prepare('SELECT icon,symbol FROM instruments WHERE key=?').get(path.slice('/api/icons/'.length));
      if (!row) return json(404, {error:'Иконка не найдена.'});
      res.writeHead(200, {'Content-Type': row.icon ? 'image/png' : 'image/svg+xml', 'Cache-Control':'no-cache', 'X-Content-Type-Options':'nosniff'});
      if (row.icon) return res.end(Buffer.from(row.icon));
      return res.end(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="45" fill="#204839" stroke="#d9b777" stroke-width="4"/><text x="50" y="60" text-anchor="middle" fill="#ffe7ac" font-family="sans-serif" font-size="24">${row.symbol.slice(0,5)}</text></svg>`);
    }
    if (path === '/api/routes') return json(200, activeRoutes(db));
    if(path==='/api/quote'){
      const q=Object.fromEntries(['src','dst','city','side','value'].map(k=>[k,url.searchParams.get(k)??'']));
      const available=activeRoutes(db, q.src, q.dst).map(r=>r.city);
      if(!available.includes(q.city) && url.searchParams.get('chooseCity')==='1' && available.length)q.city=available[0];
      return json(200,{...quote(db,q),city:q.city,cities:available.filter(Boolean)});
    }
    if(path==='/exchange-catalog.js'){
      res.writeHead(200,{'Content-Type':types['.js'],'Cache-Control':'no-store'});
      return res.end('window.BXServer=true;window.BXCatalog='+JSON.stringify(readCatalog(db))+';');
    }
    if(path==='/about'){res.writeHead(308,{Location:'/about/'});return res.end();}
    const name=path==='/about/'?'about/index.html':path==='/admin/login'?'admin/login.html':path==='/'?'index.html':['/admin','/admin/'].includes(path)?'admin/index.html':path.slice(1);
    if(!publicFiles.has(name) && !(name.startsWith('assets/') && !name.split('/').some(s=>s.startsWith('.')||s.includes('\\'))))return json(404,{error:'Не найдено.'});
    const file=resolve(root,name);
    const stat=statSync(file,{throwIfNoEntry:false});
    if(!stat?.isFile())return json(404,{error:'Не найдено.'});
    const headers={'Content-Type':types[extname(file)]||'application/octet-stream','Accept-Ranges':'bytes','Cache-Control':adminPage?'no-store':'no-cache'};
    const range=req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
    let start=0,end=stat.size-1;
    if(range){start=Number(range[1]);end=range[2]?Math.min(end,Number(range[2])):end;
      if(start>end){res.writeHead(416,{'Content-Range':'bytes */'+stat.size});return res.end();}
      headers['Content-Range']='bytes '+start+'-'+end+'/'+stat.size;
    }
    res.writeHead(range?206:200,{...headers,'Content-Length':end-start+1});
    if(req.method==='HEAD'||!stat.size)return res.end();
    const stream=createReadStream(file,{start,end});res.on('close',()=>stream.destroy());stream.on('error',()=>res.destroy());stream.pipe(res);
  }catch{if(!res.headersSent)json(500,{error:'Сервер не смог выполнить запрос.'});else res.destroy();}
}).listen(port,'127.0.0.1',()=>console.log('Babushka: http://127.0.0.1:'+port+'/admin/'));
