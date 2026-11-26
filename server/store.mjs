import { DatabaseSync } from 'node:sqlite';
import {initLocations} from './locations.mjs';
import core from '../exchange-core.js';
import {initCatalog,readCatalog} from './catalog.mjs';

const cash = coin => coin.category === 'cash';
const columns = 'src,dst,city,min,max,percent,enabled';
export function openStore(path) {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON');
  db.exec(`CREATE TABLE IF NOT EXISTS rules (
    id INTEGER PRIMARY KEY, src TEXT NOT NULL, dst TEXT NOT NULL, city TEXT NOT NULL,
    min REAL NOT NULL, max REAL NOT NULL, percent REAL NOT NULL, enabled INTEGER NOT NULL,
    UNIQUE(src,dst,city))`);
  db.exec(`CREATE TABLE IF NOT EXISTS rate_tiers (
    rule_id INTEGER NOT NULL REFERENCES rules(id) ON DELETE CASCADE,
    threshold REAL NOT NULL, percent REAL NOT NULL, PRIMARY KEY(rule_id, threshold));
    CREATE TABLE IF NOT EXISTS location_pauses (
    scope TEXT NOT NULL, name TEXT NOT NULL, PRIMARY KEY(scope, name));`);
  // Older databases recorded a single pause for a city. Expand it atomically.
  db.exec(`BEGIN IMMEDIATE;
    INSERT OR IGNORE INTO location_pauses SELECT 'intake', name FROM location_pauses WHERE scope='city';
    INSERT OR IGNORE INTO location_pauses SELECT 'payout', name FROM location_pauses WHERE scope='city';
    DELETE FROM location_pauses WHERE scope='city';
    COMMIT;`);
  initLocations(db);
  if (!db.prepare('SELECT id FROM rules LIMIT 1').get()) {
    const insert = db.prepare('INSERT INTO rules (' + columns + ') VALUES (?,?,?,?,?,?,1)');
    db.exec('BEGIN');
    try {
      const dubai = 'Дубай, Объединённые Арабские Эмираты (ОАЭ)';
      insert.run('USDT_TRC20','USD',dubai,100,1000000,-1);
      const moscow = insert.run('USDT_TRC20','USD','Москва, Россия',500,50000,-2);
      db.prepare('INSERT INTO rate_tiers VALUES (?,?,?)').run(moscow.lastInsertRowid, 10000, -1);
      insert.run('USD','USDT_TRC20',dubai,100,50000,-0.5);
      insert.run('BTC','USDT_TRC20','',0.001,10,-0.5);
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  initCatalog(db);
  return db;
}
export function save(db, rule) {
  const {id,src,dst,city,min,max,percent,enabled} = rule;
  const assets = readCatalog(db).currencies;
  if (!Object.hasOwn(assets,src) || !Object.hasOwn(assets,dst) || src===dst) throw Error('Выберите две разные валюты.');
  if (enabled && (!assets[src].send || !assets[dst].receive)) throw Error('В каталоге отключена выбранная сторона обмена.');
  if ((cash(assets[src])||cash(assets[dst])) ? !db.prepare('SELECT 1 FROM cities WHERE location=?').get(city ?? '') : city!=='') throw Error('Проверьте город направления.');
  if (![min,max,percent].every(Number.isFinite) || min<=0 || max<min || percent<=-100 || typeof enabled!=='boolean')
    throw Error('Проверьте лимиты и процент: минимум должен быть положительным, максимум не ниже минимума, поправка выше −100%.');
  // Older clients may omit tiers when editing an existing single-rate rule.
  const tiers = rule.tiers === undefined ? (id == null ? [] : tiersFor(db, id)) : rule.tiers;
  if (!Array.isArray(tiers)) throw Error('Проверьте диапазоны сумм.');
  let previous = min;
  for (const tier of tiers) {
    if (!Number.isFinite(tier?.threshold) || tier.threshold <= previous || tier.threshold > max)
      throw Error('Границы должны идти по возрастанию после минимума и входить в лимиты направления.');
    if (!Number.isFinite(tier.percent) || tier.percent <= -100)
      throw Error('Поправка каждого диапазона должна быть выше −100%.');
    previous = tier.threshold;
  }
  const values = [src, dst, city, min, max, percent, Number(enabled)];
  db.exec('SAVEPOINT settings_change');
  try {
    const duplicate = db.prepare('SELECT id FROM rules WHERE src=? AND dst=? AND city=?').get(src,dst,city);
    if (duplicate && duplicate.id !== id) throw Error('Для этой пары и города уже есть правило. Выберите его в списке.');
    let ruleId = id;
    if (id == null) {
      ruleId = Number(db.prepare('INSERT INTO rules ('+columns+') VALUES (?,?,?,?,?,?,?)').run(...values).lastInsertRowid);
    } else if (!Number.isSafeInteger(id) || !db.prepare('UPDATE rules SET src=?,dst=?,city=?,min=?,max=?,percent=?,enabled=? WHERE id=?').run(...values,id).changes) {
      throw Error('Правило не найдено.');
    }
    db.prepare('DELETE FROM rate_tiers WHERE rule_id=?').run(ruleId);
    const insert = db.prepare('INSERT INTO rate_tiers VALUES (?,?,?)');
    for (const tier of tiers) insert.run(ruleId, tier.threshold, tier.percent);
    db.exec('RELEASE settings_change');
    return ruleId;
  } catch (error) {
    db.exec('ROLLBACK TO settings_change; RELEASE settings_change');
    throw error;
  }
}

export function tiersFor(db, id) {
  return db.prepare('SELECT threshold, percent FROM rate_tiers WHERE rule_id=? ORDER BY threshold').all(id);
}

export function setPause(db, { scope, name, paused }) {
  const scopes = scope === 'city' ? ['intake', 'payout'] : [scope];
  const table = scope === 'country' ? 'countries WHERE name=?' : 'cities WHERE location=?';
  if (typeof name !== 'string' || !db.prepare('SELECT 1 FROM '+table).get(name) || !scopes.every(item => ['country', 'intake', 'payout'].includes(item)) || typeof paused !== 'boolean')
    throw Error('Проверьте локацию и вид операции.');
  const statement = db.prepare(paused
    ? 'INSERT OR IGNORE INTO location_pauses (scope,name) VALUES (?,?)'
    : 'DELETE FROM location_pauses WHERE scope=? AND name=?');
  db.exec('SAVEPOINT settings_change');
  try {
    for (const operation of scopes) statement.run(operation, name);
    db.exec('RELEASE settings_change');
  } catch (error) {
    db.exec('ROLLBACK TO settings_change; RELEASE settings_change');
    throw error;
  }
}

function pauseMessage(db, row, assets) {
  const paused = db.prepare('SELECT 1 FROM location_pauses WHERE scope=? AND name=?');
  return core.ruleBlock({...row,enabled:true},assets,(scope,name)=>paused.get(scope,name));
}

export function activeRoutes(db, src, dst) {
  const rows = src === undefined
    ? db.prepare('SELECT src,dst,city FROM rules WHERE enabled=1 ORDER BY id').all()
    : db.prepare('SELECT src,dst,city FROM rules WHERE enabled=1 AND src=? AND dst=? ORDER BY id').all(src, dst);
  const assets = readCatalog(db).currencies;
  return rows.filter(row => !pauseMessage(db, row, assets));
}

export function quote(db, {src, dst, city, side, value}) {
  const row = db.prepare('SELECT * FROM rules WHERE src=? AND dst=? AND city=?').get(src,dst,city);
  if (!row) return {error:'Для этой пары и локации расчёт недоступен.'};
  if (!row.enabled) return {paused:true,error:'Обмен недоступен: направление на паузе.'};
  const assets = readCatalog(db, true).currencies;
  const message = pauseMessage(db, row, assets);
  if (message) return {paused:true, error:message};
  const base = assets[src].usd / assets[dst].usd;
  const bands = [{ threshold: row.min, percent: row.percent }, ...tiersFor(db, row.id)]
    .map(tier => ({ threshold: tier.threshold, rate: base * (1 + tier.percent / 100) }));
  if (bands.some(({rate}) => !Number.isFinite(rate) || rate <= 0 || !Number.isFinite(rate * row.max)))
    return {error:'Проверьте курс валют и процент направления.'};
  const input = String(value).replace(/\s/g,'').replace(',','.');
  if (!['send','receive'].includes(side) || !/^\d{1,15}(?:\.\d{0,8})?$/.test(input) || Number(input) <= 0)
    return {rate: bands[0].rate, error:'Введите положительную сумму (до 8 знаков после запятой).'};
  const number = Number(input);
  const format = n => n.toLocaleString('ru-RU', {maximumFractionDigits:8});
  const limitError = 'Допустимая сумма: от '+format(row.min)+' до '+format(row.max)+' '+assets[src].symbol+'.';
  if (side === 'send') {
    const band = bands.findLast(tier => number >= tier.threshold) || bands[0];
    return {send: number, receive: number * band.rate, rate: band.rate,
      error: number < row.min || number > row.max ? limitError : ''};
  }

  // When two bands produce the requested payout, the lower spend wins.
  for (let index = 0; index < bands.length; index++) {
    const {threshold, rate} = bands[index];
    const upper = bands[index + 1]?.threshold ?? row.max;
    let send = number / rate;
    const epsilon = Number.EPSILON * 2 * send;
    if (Math.abs(send - threshold) <= epsilon) send = threshold;
    if (Math.abs(send - upper) <= epsilon) send = upper;
    if (send >= threshold && (index + 1 === bands.length ? send <= upper : send < upper))
      return {send, receive: number, rate, error: ''};
  }
  const insideEnvelope = bands.some(b => number >= b.threshold * b.rate) &&
    bands.some((b, i) => number <= (bands[i + 1]?.threshold ?? row.max) * b.rate);
  return {error: insideEnvelope
    ? 'Эта сумма к получению недоступна при действующих диапазонах. Измените сумму или введите её в поле «Отдаёте».'
    : limitError};
}
