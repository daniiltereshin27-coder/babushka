import {createHash,createHmac,createCipheriv,createDecipheriv,randomBytes,hkdfSync} from 'node:crypto';
import {quote} from './store.mjs';

const secrets=new WeakMap();
const tokenHash = token => createHash('sha256').update(token).digest('hex');
function receiptDigest(key,input,name,telegram,expected) {
  return createHmac('sha256',key).update(JSON.stringify([input,name,telegram,expected?.rate,expected?.send,expected?.receive])).digest('hex');
}
function seal(key,token,record) {
  const iv=randomBytes(12);
  const cipher=createCipheriv('aes-256-gcm',key,iv);
  cipher.setAAD(Buffer.from('request-v1:'+token));
  const encrypted=Buffer.concat([cipher.update(JSON.stringify(record),'utf8'),cipher.final()]);
  return 'v1.'+[iv,cipher.getAuthTag(),encrypted].map(b=>b.toString('base64url')).join('.');
}
export function readSnapshot(db,row) {
  const [version,iv,tag,ciphertext]=row.snapshot.split('.');
  if(version!=='v1') throw Error('Неподдерживаемый формат заявки.');
  const decipher=createDecipheriv('aes-256-gcm',secrets.get(db).cipher,Buffer.from(iv,'base64url'));
  decipher.setAAD(Buffer.from('request-v1:'+row.token));
  decipher.setAuthTag(Buffer.from(tag,'base64url'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(ciphertext,'base64url')),decipher.final()]));
}

export function initRequests(db,master) {
  if(!Buffer.isBuffer(master) || master.length!==32) throw Error('Требуется ключ заявок.');
  const derive = purpose => Buffer.from(hkdfSync('sha256',master,'Babushka Exchange',purpose,32));
  const keys={cipher:derive('snapshot v1'),digest:derive('receipt digest v1')};
  db.exec('PRAGMA secure_delete=ON');
  db.exec(`CREATE TABLE IF NOT EXISTS exchange_requests (
    id INTEGER PRIMARY KEY, token TEXT NOT NULL UNIQUE, digest TEXT NOT NULL,
    snapshot TEXT NOT NULL, created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    delivery TEXT NOT NULL DEFAULT 'pending')`); 
  db.exec('BEGIN IMMEDIATE');
  let migrated=false;
  try {
    db.exec('CREATE TABLE IF NOT EXISTS request_key_check (id INTEGER PRIMARY KEY CHECK(id=1), fingerprint TEXT NOT NULL)');
    const fingerprint=createHmac('sha256',master).update('database key verification v1').digest('hex');
    const check=db.prepare('SELECT fingerprint FROM request_key_check WHERE id=1').get();
    if(check && check.fingerprint!==fingerprint) throw Error('Ключ не соответствует базе заявок. Восстановите исходный ключ.');
    if(!check) {
      const rows=db.prepare('SELECT id,token,snapshot FROM exchange_requests ORDER BY id').all();
      const write=db.prepare('UPDATE exchange_requests SET token=?,digest=?,snapshot=? WHERE id=?');
      for(const row of rows) {
        const record=JSON.parse(row.snapshot);
        const {src,dst,city,side,value,name,telegram}=record;
        const token=tokenHash(row.token);
        write.run(token,receiptDigest(keys.digest,{src,dst,city,side,value},name,telegram,record),seal(keys.cipher,token,record),row.id);
      }
      migrated=rows.length>0;
      db.prepare('INSERT INTO request_key_check VALUES (1,?)').run(fingerprint);
    }
    db.exec('COMMIT');
  } finally { if(db.isTransaction) db.exec('ROLLBACK'); }
  if(migrated) db.exec('PRAGMA wal_checkpoint(TRUNCATE); VACUUM; PRAGMA wal_checkpoint(TRUNCATE)');
  secrets.set(db,keys);
}

// One transaction covers the last quote check, the immutable receipt and the delivery queue entry.
export function submitRequest(db, body) {
  const {token, src, dst, city, side, value, expected, consents} = body;
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const telegram = typeof body.telegram === 'string' ? body.telegram.trim().replace(/^@/,'') : '';
  if (typeof token !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(token) || name.length < 2 || name.length > 80 ||
      !/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(telegram) ||
      !['rules','privacy','aml'].every(key => consents?.[key] === true))
    return {status:400,error:'Проверьте имя, Telegram и обязательные согласия.'};
  const input = {src,dst,city,side,value};
  const keys=secrets.get(db);
  const digest=receiptDigest(keys.digest,input,name,telegram,expected);
  const storedToken=tokenHash(token);
  db.exec('BEGIN IMMEDIATE');
  try {
    const existing = db.prepare('SELECT id,digest FROM exchange_requests WHERE token=?').get(storedToken);
    let id = existing?.id;
    if (existing && existing.digest !== digest) return {status:409,error:'Эта заявка уже сохранена с другими данными. Откройте новую заявку.'};
    if (!existing) {
      const current = quote(db,input);
      if (current.error) return {status:409,error:current.error};
      if (['rate','send','receive'].some(key => current[key] !== expected?.[key]))
        return {status:409,error:'Курс изменился. Проверьте обновлённые суммы.',current};
      const labels = db.prepare('SELECT key,label,symbol,digits FROM instruments WHERE key IN (?,?)').all(src,dst);
      const snapshot = {...input, ...current, labels, name, telegram, consents:{rules:true,privacy:true,aml:true}};
      id = db.prepare('INSERT INTO exchange_requests(token,digest,snapshot) VALUES(?,?,?)')
        .run(storedToken,digest,seal(keys.cipher,storedToken,snapshot)).lastInsertRowid;
    }
    db.exec('COMMIT');
    return {status:existing ? 200 : 201,number:'BX-'+String(id).padStart(6,'0')};
  } finally {
    if (db.isTransaction) db.exec('ROLLBACK');
  }
}
