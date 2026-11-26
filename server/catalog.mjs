import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { runInNewContext } from 'node:vm';

const context = {window:{}};
runInNewContext(readFileSync(new URL('../exchange-catalog.js', import.meta.url), 'utf8'), context);
const seed = context.window.BXCatalog;

export function initCatalog(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS instruments (
    key TEXT PRIMARY KEY, label TEXT NOT NULL, symbol TEXT NOT NULL, category TEXT NOT NULL,
    network TEXT NOT NULL, kind TEXT NOT NULL, usd REAL NOT NULL, digits INTEGER NOT NULL,
    send INTEGER NOT NULL, receive INTEGER NOT NULL, send_pos INTEGER NOT NULL, receive_pos INTEGER NOT NULL,
    icon BLOB, icon_version INTEGER NOT NULL DEFAULT 0, original INTEGER NOT NULL DEFAULT 0)`);
  if (db.prepare('SELECT 1 FROM instruments LIMIT 1').get()) return;
  const insert = db.prepare(`INSERT INTO instruments(key,label,symbol,category,network,kind,usd,digits,send,receive,send_pos,receive_pos,original)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,1)`);
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const [key, coin] of Object.entries(seed.currencies)) {
      const src = seed.sendOrder.indexOf(key), dst = seed.receiveOrder.indexOf(key);
      insert.run(key, coin.label, coin.symbol, coin.crypto ? 'crypto' : coin.kind ? 'cashless' : 'cash',
        coin.network, coin.kind || '', coin.usd, coin.digits, Number(src >= 0), Number(dst >= 0), src, dst);
    }
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

export function readCatalog(db, includeRates = false) {
  const rows = db.prepare(`SELECT key,label,symbol,category,network,kind,usd,digits,send,receive,
    send_pos,receive_pos,original,icon_version FROM instruments ORDER BY rowid`).all();
  const currencies = Object.fromEntries(rows.map(row => {
    const {key,label,symbol,category,network,digits} = row;
    const icon = row.original && !row.icon_version ? '/assets/currencies/atelier/' + key + '.webp'
      : '/api/icons/' + key + '?v=' + row.icon_version;
    const coin = {label,symbol,category,network,digits,crypto:category==='crypto',icon,send:!!row.send,receive:!!row.receive};
    if (row.kind) coin.kind = row.kind;
    if (includeRates) coin.usd = row.usd;
    return [key, coin];
  }));
  const order = side => rows.filter(row => row[side]).sort((a,b) => a[side+'_pos'] - b[side+'_pos']).map(row => row.key);
  return { currencies, sendOrder:order('send'), receiveOrder:order('receive') };
}

function textField(value, maxLength) {
  if (typeof value !== 'string' || value.trim().length > maxLength) throw Error('Проверьте текстовые поля.');
  return value.trim();
}

function uploadedIcon(encoded) {
  if (typeof encoded !== 'string' || !encoded.startsWith('data:image/png;base64,')) throw Error('Выберите изображение для иконки.');
  const bytes = Buffer.from(encoded.slice(22), 'base64');
  if (bytes.length < 33 || bytes.length > 512 * 1024 ||
      !bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')) ||
      bytes.toString('ascii',12,16) !== 'IHDR' || bytes.readUInt32BE(16) !== 256 || bytes.readUInt32BE(20) !== 256)
    throw Error('Не удалось прочитать иконку.');
  return bytes;
}

export function saveInstrument(db, input) {
  const label = textField(input.label, 80);
  const symbol = textField(input.symbol, 15).toUpperCase();
  const network = textField(input.network, 120);
  const {category, usd, digits, send, receive} = input;
  if (!label || !/^[A-Z0-9][A-Z0-9.-]*$/.test(symbol)) throw Error('Введите название и тикер латиницей.');
  if (!['crypto','cash','cashless'].includes(category) || !Number.isFinite(usd) || usd <= 0 ||
      !Number.isInteger(digits) || digits < 0 || digits > 8 ||
      typeof send !== 'boolean' || typeof receive !== 'boolean') throw Error('Проверьте категорию, курс, точность и стороны обмена.');
  const bytes = input.icon == null ? null : uploadedIcon(input.icon);
  const key = input.key ?? ('CUSTOM_' + randomUUID());
  const existing = db.prepare('SELECT category,kind FROM instruments WHERE key=?').get(key);
  if (input.key != null && !existing) throw Error('Валюта не найдена.');
  const duplicate = db.prepare('SELECT 1 FROM instruments WHERE key<>? AND category=? AND label=? COLLATE NOCASE').get(key,category,label);
  if (duplicate) throw Error('Такое название уже есть в категории. Уточните сеть или способ оплаты.');
  if (existing && (existing.category === 'cash') !== (category === 'cash')) {
    const conflict = db.prepare(`SELECT 1 FROM rules r JOIN instruments i ON i.key=CASE WHEN r.src=? THEN r.dst ELSE r.src END
      WHERE (r.src=? OR r.dst=?) AND (r.city<>'') <> (?='cash' OR i.category='cash') LIMIT 1`).get(key,key,key,category);
    if (conflict) throw Error('Для действующих или сохранённых правил изменится привязка к городу. Создайте отдельный вариант обмена.');
  }
  const kind = category === 'cashless' ? existing?.kind || 'payment' : '';
  db.prepare(`INSERT INTO instruments(key,label,symbol,category,network,kind,usd,digits,send,receive,send_pos,receive_pos,icon,icon_version)
    VALUES(?,?,?,?,?,?,?,?,?,?,100000,100000,?,?)
    ON CONFLICT(key) DO UPDATE SET label=excluded.label,symbol=excluded.symbol,category=excluded.category,
    network=excluded.network,kind=excluded.kind,usd=excluded.usd,digits=excluded.digits,send=excluded.send,receive=excluded.receive,
    icon=COALESCE(excluded.icon,instruments.icon),icon_version=instruments.icon_version+excluded.icon_version`)
    .run(key,label,symbol,category,network,kind,usd,digits,Number(send),Number(receive),bytes,Number(!!bytes));
  return key;
}
