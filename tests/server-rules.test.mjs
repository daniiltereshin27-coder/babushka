import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { activeRoutes, openStore, quote, save, setPause, tiersFor } from '../server/store.mjs';

const dubai = 'Дубай, Объединённые Арабские Эмираты (ОАЭ)';
const moscow = 'Москва, Россия';
const direction = { src: 'USDT_TRC20', dst: 'USD', city: dubai };
const calculate = (db, changes) => quote(db, { ...direction, side: 'send', value: '1000', ...changes });

test('city, direction and inclusive limits apply to both input sides', t => {
  const db = openStore(':memory:');
  t.after(() => db.close());
  assert.equal(calculate(db).receive, 990);
  assert.equal(calculate(db, {city: moscow}).receive, 980);
  assert.equal(calculate(db, {src: 'USD', dst: 'USDT_TRC20'}).receive, 995);
  for (const [value, side] of [['500', 'send'], ['49500', 'receive']])
    assert.equal(calculate(db, {city: moscow, value, side}).error, '');
  for (const [value, side] of [['499,99', 'send'], ['49500,01', 'receive']])
    assert.match(calculate(db, {city: moscow, value, side}).error, /Допустимая сумма/);
});

test('creating, changing and disabling a rule survives database reopen', t => {
  const directory = mkdtempSync(join(tmpdir(), 'babushka-rules-'));
  const path = join(directory, 'test.sqlite');
  let db = openStore(path);
  t.after(() => { db.close(); rmSync(directory, { recursive: true }); });
  const rule = { ...direction, city: 'Санкт-Петербург, Россия', min: 1, max: 5000, percent: 2, enabled: true };
  const id = save(db, rule);
  assert.equal(calculate(db, rule).receive, 1020);
  assert.throws(() => save(db, rule), /уже есть/);
  const edited = { ...rule, id, percent: -4, max: 1000 };
  save(db, edited);
  db.close();
  db = openStore(path);
  assert.equal(calculate(db, rule).receive, 960);
  assert.equal(calculate(db, {...rule, side: 'receive', value: '960'}).send, 1000);
  assert.match(calculate(db, {...rule, value: '1001'}).error, /Допустимая сумма/);
  save(db, {...edited, enabled: false});
  assert.match(calculate(db, rule).error, /недоступен/);
  assert.equal(calculate(db).receive, 990);
});

test('invalid changes leave existing rules intact', t => {
  const db = openStore(':memory:');
  t.after(() => db.close());
  const rule = { ...direction, id: 1, min: 100, max: 1000, enabled: true, percent: -1 };
  for (const invalid of [{max: 99}, {min: 0}, {percent: -100}, {dst: rule.src}, {city: ''}, {dst: 'unknown'}])
    assert.throws(() => save(db, {...rule, ...invalid}));
  assert.equal(calculate(db).receive, 990);
});


test('threshold belongs to the new rate; reverse calculation respects the same bands', t => {
  const db = openStore(':memory:');
  t.after(() => db.close());
  const rule = { ...direction, city: moscow, id: 2, enabled: true, min: 500,
    max: 50000, percent: -2, tiers: [{threshold: 10000, percent: -1}] };
  save(db, rule);
  const calc = (value, side = 'send') => calculate(db, {city: moscow, value, side});
  assert.equal(calc('9999').receive, 9799.02);
  assert.equal(calc('9999.99999999').rate, 0.98);
  assert.equal(calc('10000').receive, 9900);
  assert.equal(calc('10000.00000001').rate, 0.99);
  assert.equal(calc('9900', 'receive').send, 10000);
  assert.equal(calc('9799,02', 'receive').send, 9999);
  assert.match(calc('9850', 'receive').error, /диапазонах/);
  assert.equal(calc('49500','receive').send, 50000);
  assert.match(calc('50000.01').error, /Допустимая/);
  for (const threshold of [500, 700, 50001]) {
    assert.throws(() => save(db, {...rule, tiers: [...rule.tiers, {threshold, percent: 0}]}), /Границы/);
    assert.deepEqual(tiersFor(db, 2).map(t => t.threshold), [10000]);
  }
  save(db, {...rule, tiers: [{threshold: 10000, percent: -5}]});
  assert.ok(calc('9600', 'receive').send < 10000);
  save(db, {...rule, tiers: []});
  assert.equal(calc('10000').receive, 9800);
});

test('city and country pauses persist independently and filter every affected route', t => {
  const directory = mkdtempSync(join(tmpdir(), 'babushka-geo-'));
  const path = join(directory, 'test.sqlite');
  let db = openStore(path);
  t.after(() => { db.close(); rmSync(directory, { recursive: true }); });
  const spb = 'Санкт-Петербург, Россия';
  const rule = { ...direction, city: spb, min:100, max:50000, enabled:true, percent:-2,
    tiers:[{threshold: 10000,percent:-1}] };
  save(db, rule);
  save(db, {...rule, src:'USD', dst:'USDT_TRC20'});
  const cityPause = {scope:'city', name:spb, paused:true};
  const countryPause = {scope:'country', name:'Россия', paused:true};
  setPause(db, cityPause);
  assert.ok(activeRoutes(db).some(r => r.city === moscow));
  assert.ok(!activeRoutes(db).some(r => r.city === spb));
  setPause(db, countryPause);
  db.close();
  db = openStore(path);
  assert.ok(!activeRoutes(db).some(r => r.city.endsWith('Россия')));
  assert.equal(calculate(db).receive, 990);
  assert.ok(activeRoutes(db).some(r => r.city === ''));
  setPause(db, {...countryPause, paused:false});
  assert.ok(calculate(db, {city: spb}).paused);
  assert.equal(calculate(db, {city: moscow}).receive, 980);
  setPause(db, {...cityPause, paused:false});
  assert.equal(calculate(db, {city: spb, value:'10000'}).receive, 9900);
});


test('intake and payout apply to the cash leg for quotes and public city lists', t => {
  const db = openStore(':memory:');
  t.after(() => db.close());
  const incoming = {src:'USD', dst:'USDT_TRC20'};
  const cashPair = {src:'USD', dst:'EUR'};
  save(db, {...cashPair, city:dubai, min:1, max:10000, percent:0, enabled:true});
  for (const scope of ['intake', 'payout']) {
    setPause(db, {scope, name:dubai, paused:true});
    assert.equal(Boolean(calculate(db,incoming).error), scope === 'intake');
    assert.equal(Boolean(calculate(db).error), scope === 'payout');
    assert.ok(calculate(db,cashPair).paused);
    assert.equal(calculate(db,{city:moscow}).receive, 980);
    const routes = activeRoutes(db).filter(r => r.city === dubai);
    assert.equal(routes.length, 1);
    assert.equal(routes[0].src, scope === 'intake' ? 'USDT_TRC20' : 'USD');
    setPause(db, {scope, name:dubai, paused:false});
  }
  assert.ok(!calculate(db,cashPair).error);
});

test('existing city pause becomes two independently resumable operations on restart', t => {
  const directory = mkdtempSync(join(tmpdir(), 'babushka-city-'));
  const path = join(directory, 'test.sqlite');
  let db = openStore(path);
  t.after(() => { db.close(); rmSync(directory, {recursive:true}); });
  db.prepare("INSERT INTO location_pauses VALUES ('city', ?)").run(dubai);
  db.close();
  db = openStore(path);
  assert.ok(calculate(db).paused);
  setPause(db, {scope:'intake', name:dubai, paused:false});
  assert.ok(calculate(db).paused);
  assert.equal(calculate(db, {src:'USD',dst:'USDT_TRC20'}).receive, 995);
  const country = dubai.split(', ')[1];
  setPause(db, {scope:'country', name:country, paused:true});
  assert.ok(calculate(db, {src:'USD',dst:'USDT_TRC20'}).paused);
  setPause(db, {scope:'country', name:country, paused:false});
  db.close();
  db = openStore(path);
  assert.equal(calculate(db, {src:'USD',dst:'USDT_TRC20'}).receive, 995);
  assert.ok(calculate(db).paused);
});

test('catalogue edits survive restart and control both existing and new rules', async t => {
  const {readCatalog, saveInstrument} = await import('../server/catalog.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'babushka-catalog-'));
  const path = join(dir, 'catalog.sqlite');
  let db = openStore(path);
  t.after(() => { db.close(); rmSync(dir, {recursive:true}); });
  const initial = readCatalog(db);
  const draft = {category:'crypto', label:'Тестовая монета', symbol:'TEST', network:'Testnet',
    usd:2, digits:4, send:true, receive:false};
  const key = saveInstrument(db, draft);
  const rule = {...direction, src:key, min:1, max:5000, enabled:true, percent:0};
  assert.ok(calculate(db, rule).error);
  save(db, rule);
  assert.equal(calculate(db, rule).receive, 2000);
  assert.throws(() => save(db, {...rule, src:'USD', dst:key}));
  const edited = {...draft, key, send:false, receive:true};
  saveInstrument(db, edited);
  db.close();
  db = openStore(path);
  const catalog = readCatalog(db);
  assert.deepEqual(catalog.sendOrder, initial.sendOrder);
  assert.deepEqual(catalog.receiveOrder, [...initial.receiveOrder,key]);
  assert.equal(catalog.currencies[key].usd, undefined);
  assert.equal(readCatalog(db,true).currencies[key].usd, 2);
  assert.ok(calculate(db, rule).paused);
  assert.ok(!activeRoutes(db).some(r => r.src === key));
  const reverse = {...rule, src:'USD', dst:key};
  save(db, reverse);
  assert.equal(calculate(db, reverse).receive, 500);
  assert.throws(() => saveInstrument(db, {...edited, icon:'invalid'}));
  assert.throws(() => saveInstrument(db, {...draft}));
  saveInstrument(db, {...edited, receive:false});
  assert.ok(calculate(db, reverse).paused);
});

test('custom countries and cities persist with independent cash operations and country pauses', async t => {
  const {addLocation, locationDirectory} = await import('../server/locations.mjs');
  const directory = mkdtempSync(join(tmpdir(), 'babushka-locations-'));
  const path = join(directory,'test.sqlite');
  let db = openStore(path);
  t.after(() => { db.close(); rmSync(directory, {recursive:true}); });
  const before = locationDirectory(db);
  const country = 'Тестовая страна';
  const first = addLocation(db,{type:'country',country,city:'Первый город',intake:true,payout:false});
  assert.throws(() => addLocation(db,{type:'country',country:'  ТЕСТОВАЯ   СТРАНА  '}), /уже есть/);
  assert.throws(() => addLocation(db,{type:'city',country,city:'первый город',intake:false,payout:true}), /уже есть/);
  assert.throws(() => addLocation(db,{type:'country',country:'Неверная страна',city:'А, Б',intake:true,payout:true}));
  const empty = addLocation(db,{type:'country',country:'Другая страна'});
  const second = addLocation(db,{type:'city',country:empty.country,city:'Первый город',intake:false,payout:true});
  const both = addLocation(db,{type:'city',country,city:'Второй город',intake:true,payout:true});
  db.close();
  db = openStore(path);
  const current = locationDirectory(db);
  assert.equal(current.cities.length,before.cities.length+3);
  assert.equal(current.countries.length,before.countries.length+2);
  assert.ok(before.cities.every(city=>current.cities.includes(city)));
  for (const [record,intake,payout] of [[first,true,false],[second,false,true],[both,true,true]]) {
    for (const [src,dst,allowed] of [['USD','USDT_TRC20',intake],['USDT_TRC20','USD',payout]]) {
      const direction = {src,dst,city:record.location};
      save(db,{...direction,enabled:true,min:1,max:10000,percent:0});
      assert.equal(!calculate(db,direction).error,allowed);
      assert.equal(activeRoutes(db,src,dst).some(rule=>rule.city===record.location),allowed);
    }
  }
  setPause(db,{scope:'country',name:country,paused:true});
  assert.ok(calculate(db,{city:both.location}).paused);
  assert.equal(calculate(db,{city:second.location}).receive,1000);
  setPause(db,{scope:'country',name:country,paused:false});
  assert.ok(calculate(db,{city:first.location}).paused);
  setPause(db,{scope:'payout',name:first.location,paused:false});
  assert.equal(calculate(db,{city:first.location}).receive,1000);
});
