import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {openStore,quote,setPause} from '../server/store.mjs';
import {initRequests,readSnapshot,submitRequest} from '../server/requests.mjs';

const key=randomBytes(32);

function draft(db) {
  const input={src:'USDT_TRC20',dst:'USD',city:'Москва, Россия',side:'send',value:'1000'};
  const {send,receive,rate}=quote(db,input);
  return {...input,expected:{send,receive,rate},token:randomUUID(),name:'Тест',telegram:'@test_client',
    consents:{rules:true,privacy:true,aml:true}};
}

test('server rejects invalid contacts, missing consents, changed quotes, limits and city pauses before storing',t=>{
  const db=openStore(':memory:');t.after(()=>db.close());initRequests(db,key);
  const body=draft(db);
  for(const invalid of [{name:' '},{telegram:'@'},{token:'invalid'},{consents:{rules:true,privacy:true}}])
    assert.equal(submitRequest(db,{...body,...invalid}).status,400);
  assert.equal(submitRequest(db,{...body,value:'100'}).status,409);
  const changed=submitRequest(db,{...body,expected:{...body.expected,receive:990}});
  assert.equal(changed.status,409);assert.equal(changed.current.receive,980);
  setPause(db,{scope:'payout',name:body.city,paused:true});
  assert.match(submitRequest(db,body).error,/Выдача/);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM exchange_requests').get().n,0);
});

test('receipt and accepted terms survive restart, lost response and later rule pause',t=>{
  const dir=mkdtempSync(join(tmpdir(),'bx-receipts-')),path=join(dir,'requests.sqlite');
  let db=openStore(path);t.after(()=>{db.close();rmSync(dir,{recursive:true});});initRequests(db,key);
  const body=draft(db);
  const first=submitRequest(db,body);assert.equal(first.status,201);
  db.close();db=openStore(path);initRequests(db,key);
  setPause(db,{scope:'country',name:'Россия',paused:true});
  assert.deepEqual(submitRequest(db,body),{status:200,number:first.number});
  assert.equal(submitRequest(db,{...body,telegram:'@other_client'}).status,409);
  assert.equal(submitRequest(db,{...body,token:randomUUID()}).status,409);
  const rows=db.prepare('SELECT token,snapshot,delivery FROM exchange_requests').all();assert.equal(rows.length,1);
  assert.ok(!rows[0].snapshot.includes(body.telegram.slice(1)));
  const record=readSnapshot(db,rows[0]);assert.equal(record.receive,980);assert.equal(record.rate,.98);
  assert.equal(record.telegram,'test_client');assert.deepEqual(record.consents,body.consents);
  assert.equal(rows[0].delivery,'pending');
});
