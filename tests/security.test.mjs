import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {initSecurity,configureManager,signIn,sessionFor} from '../server/security.mjs';
import {initRequests,readSnapshot,submitRequest} from '../server/requests.mjs';

test('separate salted verifiers, opaque sessions, expiry and credential revocation',async t=>{
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());
  db.exec('PRAGMA foreign_keys=ON');initSecurity(db);
  const pass=randomBytes(24).toString('base64url');
  await configureManager(db,'create','First',pass);
  await configureManager(db,'create','second',pass);
  const users=db.prepare('SELECT salt,verifier FROM managers').all();
  assert.notDeepEqual(users[0].salt,users[1].salt);assert.notDeepEqual(users[0].verifier,users[1].verifier);
  const login=()=>signIn(db,{login:'First',password:pass},'local',10000);
  const auth=await login(); assert.equal(auth.status,200);
  const cookie='bx='+auth.token;
  assert.ok(sessionFor(db,cookie,'bx',10001));
  assert.notEqual(db.prepare('SELECT digest FROM sessions').get().digest,auth.token);
  assert.equal(sessionFor(db,cookie,'bx',10001+30*60000),null);
  const second=await login();
  await configureManager(db,'reset','first',pass);
  assert.equal(sessionFor(db,'bx='+second.token,'bx',10000),null);
  const third=await login();await configureManager(db,'remove','first');
  assert.equal(sessionFor(db,'bx='+third.token,'bx',10000),null);
  const log=JSON.stringify(db.prepare('SELECT * FROM audit').all());
  assert.ok(!log.includes(pass) && !log.includes(auth.token));
});

test('login attempt window survives restart and expires; unknown users get the same denial',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'bx-limit-')),path=join(dir,'db');
  let db=new DatabaseSync(path);t.after(()=>{db.close();rmSync(dir,{recursive:true});});initSecurity(db);
  const pass=randomBytes(24).toString('base64url');await configureManager(db,'create','staff',pass);
  const attempt=(login,password,at)=>signIn(db,{login,password},'local',at);
  const denial=await attempt('unused','wrong',1000);
  for(let i=0;i<5;i++) assert.deepEqual(await attempt('staff','wrong',1000),denial);
  db.close();db=new DatabaseSync(path);initSecurity(db);
  assert.equal((await attempt('staff',pass,2000)).status,429);
  assert.equal((await attempt('staff',pass,901001)).status,200);
});

test('legacy receipts migrate without losing retries, plaintext or wrong-key acceptance',t=>{
  const dir=mkdtempSync(join(tmpdir(),'bx-crypt-')),path=join(dir,'db');
  const db=new DatabaseSync(path);t.after(()=>{db.close();rmSync(dir,{recursive:true});});
  db.exec("PRAGMA journal_mode=WAL; CREATE TABLE exchange_requests (id INTEGER PRIMARY KEY,token TEXT UNIQUE,digest TEXT,snapshot TEXT,created TEXT,delivery TEXT)");
  const token=randomUUID(),master=randomBytes(32);
  const record={src:'AAA',dst:'BBB',city:'',side:'send',value:'1',name:'PRIVATE_TEST_CLIENT',telegram:'private_test_account',send:1,receive:2,rate:2};
  db.prepare("INSERT INTO exchange_requests VALUES (1,?,'legacy',?,'2026-01-01','pending')").run(token,JSON.stringify(record));
  initRequests(db,master);
  const row=db.prepare('SELECT * FROM exchange_requests').get();
  assert.deepEqual(readSnapshot(db,row),record);assert.notEqual(row.token,token);
  assert.ok(!readFileSync(path).includes(Buffer.from(record.name)));
  assert.throws(()=>initRequests(db,randomBytes(32)),/Ключ/);
  assert.throws(()=>readSnapshot(db,{...row,token:'different'}));
  const body={...record,token,expected:record,consents:{rules:true,privacy:true,aml:true}};
  assert.equal(submitRequest(db,body).number,'BX-000001');
});
