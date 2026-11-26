import {createHash, randomBytes, scrypt, timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';

const derive = promisify(scrypt);
const cost = {N:131072,r:8,p:1,maxmem:160*1024*1024};
const hash = value => createHash('sha256').update(value).digest('hex');
const dummySalt = randomBytes(16);
const dummyVerifier = Buffer.alloc(32);
const minute = 60000;
let verifying = 0;

export function initSecurity(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS managers (
    login TEXT PRIMARY KEY, salt BLOB NOT NULL, verifier BLOB NOT NULL, scheme TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (
    digest TEXT PRIMARY KEY, login TEXT NOT NULL REFERENCES managers(login) ON DELETE CASCADE,
    csrf TEXT NOT NULL, created INTEGER NOT NULL, touched INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS login_limits (bucket TEXT PRIMARY KEY, count INTEGER NOT NULL, until_ms INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY, at INTEGER NOT NULL, actor TEXT, event TEXT NOT NULL, target TEXT);
    CREATE INDEX IF NOT EXISTS audit_date ON audit(at);`);
}

export function audit(db,actor,event,target=null) {
  const now=Date.now();
  const {lastInsertRowid}=db.prepare('INSERT INTO audit(at,actor,event,target) VALUES (?,?,?,?)').run(now,actor,event,target);
  if (Number(lastInsertRowid)%100===1)
    db.prepare('DELETE FROM audit WHERE at<? OR id<=?').run(now-90*24*60*minute,Number(lastInsertRowid)-10000);
}

export function normalizeLogin(input) {
  return typeof input==='string' ? input.trim().toLowerCase() : '';
}

// Provisioning and recovery are only available to the local operating-system user.
export async function configureManager(db, action, input, password) {
  const login=normalizeLogin(input);
  if (!['create','reset','remove'].includes(action) || !/^[a-z0-9][a-z0-9._-]{2,47}$/.test(login))
    throw Error('Логин должен содержать от 3 до 48 латинских букв, цифр или знаков . _ -');
  let salt, verifier;
  if (action!=='remove') {
    if (typeof password!=='string' || [...password].length<15 || Buffer.byteLength(password)>512 || !password.trim() || password.toLowerCase()===login)
      throw Error('Используйте уникальную парольную фразу от 15 символов, не более 512 байт.');
    salt=randomBytes(16);
    verifier=await derive(password,salt,32,cost);
  }
  db.exec('BEGIN IMMEDIATE');
  try {
    const exists=!!db.prepare('SELECT 1 FROM managers WHERE login=?').get(login);
    if (action==='create' && exists) throw Error('Логин уже занят.');
    if (action!=='create' && !exists) throw Error('Учётная запись не найдена.');
    if (action==='create') db.prepare("INSERT INTO managers VALUES (?,?,?,'scrypt-v1')").run(login,salt,verifier);
    else if (action==='reset') db.prepare("UPDATE managers SET salt=?,verifier=?,scheme='scrypt-v1' WHERE login=?").run(salt,verifier,login);
    else db.prepare('DELETE FROM managers WHERE login=?').run(login);
    db.prepare('DELETE FROM sessions WHERE login=?').run(login);
    db.prepare('DELETE FROM login_limits WHERE bucket=?').run('account:'+hash(login));
    audit(db,'local', 'manager.'+action,login);
    db.exec('COMMIT');
  } finally { if(db.isTransaction) db.exec('ROLLBACK'); }
}

export async function signIn(db,body,address, now=Date.now()) {
  const login=normalizeLogin(body?.login);
  const password=body?.password;
  const denied={status:401,error:'Неверный логин или пароль.'};
  if(typeof password!=='string' || Buffer.byteLength(password)>512 || login.length>48) return denied;
  db.prepare('DELETE FROM login_limits WHERE until_ms<=?').run(now);
  const account='account:'+hash(login), peer='peer:'+hash(address);
  const reserve=db.prepare(`INSERT INTO login_limits VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1`);
  const get=db.prepare('SELECT count,until_ms FROM login_limits WHERE bucket=?');
  for(const [bucket,max] of [[peer,30],[account,5]]) {
    const row=get.get(bucket);
    if(row && row.count>=max) {
      if(row.count===max) {
        db.prepare('UPDATE login_limits SET count=count+1 WHERE bucket=?').run(bucket);
        audit(db,null,'login.limited');
      }
      return {status:429,retry:Math.ceil((row.until_ms-now)/1000),error:'Слишком много попыток. Попробуйте позднее.'};
    }
  }
  if(verifying>=2) return {status:429,retry:5,error:'Попробуйте через несколько секунд.'};
  for(const bucket of [account,peer]) reserve.run(bucket,now+15*minute);
  const user=db.prepare('SELECT * FROM managers WHERE login=?').get(login);
  verifying++;
  let candidate;
  try { candidate=await derive(password,user?.salt || dummySalt,32,cost); }
  finally { verifying--; }
  const matches=timingSafeEqual(candidate,user?.verifier || dummyVerifier);
  // Recheck the credential version after the asynchronous KDF, including local resets.
  if (!matches || !user || user.scheme!=='scrypt-v1' || !db.prepare('SELECT 1 FROM managers WHERE login=? AND verifier=?').get(login,user.verifier)) {
    audit(db,user?.login || null,'login.failed');
    return denied;
  }
  const token=randomBytes(32).toString('base64url');
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('DELETE FROM login_limits WHERE bucket=?').run(account);
    db.prepare('UPDATE login_limits SET count=max(count-1,0) WHERE bucket=?').run(peer);
    db.prepare('DELETE FROM sessions WHERE created<=? OR touched<=?').run(now-8*60*minute,now-30*minute);
    db.prepare('INSERT INTO sessions VALUES (?,?,?,?,?)').run(hash(token),login,randomBytes(32).toString('base64url'),now,now);
    audit(db,login,'login.ok');
    db.exec('COMMIT');
  } finally { if(db.isTransaction) db.exec('ROLLBACK'); }
  return {status:200,token};
}

export function sessionFor(db,cookie,name,now=Date.now()) {
  const token=(cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(name+'='))?.slice(name.length+1);
  if (!token || !/^[a-zA-Z0-9_-]{43}$/.test(token)) return null;
  const digest=hash(token);
  const session=db.prepare('SELECT * FROM sessions WHERE digest=?').get(digest);
  if (!session) return null;
  if(session.created+8*60*minute<=now || session.touched+30*minute<=now) {
    db.prepare('DELETE FROM sessions WHERE digest=?').run(digest);
    return null;
  }
  // A read at every request enforces expiry; throttle timestamp writes to once per minute.
  if(now-session.touched>=minute) db.prepare('UPDATE sessions SET touched=? WHERE digest=?').run(now,digest);
  return session;
}
