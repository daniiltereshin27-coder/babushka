import {readFileSync} from 'node:fs';

const initialCities = JSON.parse(readFileSync(new URL('../assets/exchange-cities.json', import.meta.url)));
export const countryOf = location => location.split(', ')[1];
const nameKey = name => name.normalize('NFKC').toLocaleLowerCase('ru').replace(/ё/g, 'е')
  .replace(/[’‘ʼ]/g, "'").replace(/[‐‑–—]/g, '-');

export function initLocations(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS countries (
    name TEXT PRIMARY KEY, name_key TEXT NOT NULL UNIQUE);
    CREATE TABLE IF NOT EXISTS cities (
    location TEXT PRIMARY KEY, country TEXT NOT NULL REFERENCES countries(name),
    name_key TEXT NOT NULL, UNIQUE(country,name_key));`);
  if (db.prepare('SELECT 1 FROM countries LIMIT 1').get()) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    const country = db.prepare('INSERT OR IGNORE INTO countries VALUES (?,?)');
    const city = db.prepare('INSERT INTO cities VALUES (?,?,?)');
    for (const location of initialCities) {
      const name = countryOf(location);
      country.run(name, nameKey(name));
      city.run(location, name, nameKey(location.split(', ')[0]));
    }
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

export function locationDirectory(db) {
  const sort = (a,b) => a.localeCompare(b,'ru');
  return {
    countries:db.prepare('SELECT name FROM countries').all().map(row=>row.name).sort(sort),
    cities:db.prepare('SELECT location FROM cities').all().map(row=>row.location).sort(sort)
  };
}

function cleanName(value, field) {
  const name = typeof value === 'string' ? value.normalize('NFKC').trim().replace(/\s+/gu,' ') : '';
  if (!name || name.length > 100 || !/\p{L}/u.test(name) || /[,\p{C}<>]/u.test(name))
    throw Error('Проверьте название ' + field + '. Допустимо до 100 символов без запятых.');
  return name;
}

// Keep the existing "city, country" identifier used in rules, pauses and saved links.
export function addLocation(db, {type, country, city, intake, payout}) {
  if (!['country','city'].includes(type)) throw Error('Выберите страну или город.');
  country = cleanName(country, 'страны');
  const hasCity = type === 'city' || (city != null && city !== '');
  if (hasCity) {
    city = cleanName(city, 'города');
    if (typeof intake !== 'boolean' || typeof payout !== 'boolean') throw Error('Укажите доступные операции.');
  }
  db.exec('SAVEPOINT settings_change');
  try {
    const existing = db.prepare('SELECT name FROM countries WHERE name_key=?').get(nameKey(country));
    if (type === 'country') {
      if (existing) throw Error('Такая страна уже есть. Выберите её в списке и добавьте город.');
      db.prepare('INSERT INTO countries VALUES (?,?)').run(country,nameKey(country));
    } else {
      if (!existing) throw Error('Выберите существующую страну.');
      country = existing.name;
    }
    let location = '';
    if (hasCity) {
      location = city + ', ' + country;
      if (db.prepare('SELECT 1 FROM cities WHERE country=? AND name_key=?').get(country,nameKey(city)))
        throw Error('Такой город в этой стране уже есть.');
      db.prepare('INSERT INTO cities VALUES (?,?,?)').run(location,country,nameKey(city));
      const pause = db.prepare('INSERT INTO location_pauses (scope,name) VALUES (?,?)');
      if (!intake) pause.run('intake',location);
      if (!payout) pause.run('payout',location);
    }
    db.exec('RELEASE settings_change');
    return {country, location};
  } catch (error) { db.exec('ROLLBACK TO settings_change; RELEASE settings_change'); throw error; }
}
