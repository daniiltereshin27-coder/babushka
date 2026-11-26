const test=require('node:test');
const assert=require('node:assert/strict');
const {parse,calculate,secondsLeft}=require('../exchange-core.js');
const {searchCities}=require('../exchange-core.js');
const cities=['Москва, Россия','Санкт-Петербург, Россия','Нижний Новгород, Россия','Кёльн, Германия','Барселона, Испания'];
test('location search matches city and country in either order',()=>{
  for(const query of ['Россия Москва','Москва Россия','  РОССИЯ,  мос  ','Россия / Москва'])assert.deepEqual(searchCities(cities,query),[cities[0]]);
  assert.deepEqual(searchCities(cities,'Испания Барселона'),[cities[4]]);
  assert.deepEqual(searchCities(cities,'Россия Новгород Нижний'),[cities[2]]);
});
test('location search handles punctuation, aliases and spelling variants',()=>{
  for(const query of ['спб рф','санкт петербург россия','Санкт-Петербург','санктпетербург'])assert.deepEqual(searchCities(cities,query),[cities[1]]);
  assert.deepEqual(searchCities(cities,'кельн Германия'),[cities[3]]);
  assert.deepEqual(searchCities(cities,'Russia Moscow'),[cities[0]]);
});
test('location search requires all words and recovers after empty results',()=>{
  assert.deepEqual(searchCities(cities,'Москва Испания'),[]);
  assert.deepEqual(searchCities(cities,''),cities);
  assert.deepEqual(searchCities(cities,'Россия'),cities.slice(0,3));
});
const usdt={usd:1},eur={usd:1.1},btc={usd:68000};
test('localized amount accepts grouping and comma',()=>assert.equal(parse('12\u202f345,67'),12345.67));
test('malformed and nonnumeric amounts stay invalid',()=>{for(const s of ['', '1e5','12abc','-1','1,2,3','1.123456789'])assert.ok(Number.isNaN(parse(s)),s);});
test('reverse input preserves requested receiving amount',()=>{const q=calculate({from:usdt,to:eur,value:'990',side:'receive'});assert.equal(q.receive,990);assert.ok(Math.abs(q.send-1100)<1e-9);});
test('send and receive paths round trip for crypto',()=>{const q=calculate({from:btc,to:usdt,value:'.5'});assert.equal(q.valid,false);const a=calculate({from:btc,to:usdt,value:'0.5'}),b=calculate({from:btc,to:usdt,value:String(a.receive),side:'receive'});assert.ok(Math.abs(b.send-.5)<1e-10);});
test('empty, zero and invalid inputs cannot form a quote',()=>{for(const value of ['','0','text'])assert.equal(calculate({from:usdt,to:eur,value}).valid,false);});
test('clock has a full 60 second interval and expires on boundary',()=>{assert.equal(secondsLeft(61000,1000),60);assert.equal(secondsLeft(61000,60001),1);assert.equal(secondsLeft(61000,61000),0);assert.equal(secondsLeft(61000,120000),0);});


test('admin search combines currency category, words and network, prioritizing exact tickers', () => {
  const {searchCurrencies} = require('../exchange-core.js');
  const assets = {
    USDT: {label:'USDT · TRC20', symbol:'USDT', crypto:true, network:'Сеть Tron · TRC20'},
    WISE_USD: {label:'Wise · USD', symbol:'USD', kind:'payment'},
    USD: {label:'Доллар · USD', symbol:'USD'}
  };
  const search = (category, query) => searchCurrencies(assets, Object.keys(assets), category, query);
  assert.deepEqual(search('all','usd'), ['USD','WISE_USD','USDT']);
  assert.deepEqual(search('cash','usd'), ['USD']);
  assert.deepEqual(search('crypto','TrC-20 тетер'), ['USDT']);
  assert.deepEqual(search('cashless','доллар wise'), ['WISE_USD']);
  assert.deepEqual(search('cashless','Tron'), []);
});

test('rule navigation handles mixed queries, exact currencies, direction and rule status', () => {
  const {searchRules} = require('../exchange-core.js');
  const assets = {
    T: {symbol:'USDT', label:'USDT · TRC20', network:'Сеть Tron · TRC20'},
    USD: {symbol:'USD', label:'Доллар · USD'},
    BTC: {symbol:'BTC', label:'Bitcoin · BTC'}
  };
  const forward = {src:'T', dst:'USD', city:'Москва, Россия', enabled:1};
  const reverse = {...forward, src:'USD', dst:'T', enabled:0};
  const crypto = {src:'BTC', dst:'T', city:'', enabled:1};
  const find = (query, overrides = {}) => searchRules([forward, reverse, crypto], assets,
    {query, src:'', dst:'', status:'all', ...overrides});
  assert.deepEqual(find('usd trc-20 рф'), [forward, reverse]);
  assert.deepEqual(find('MOSCOW', {src:'T', dst:'USD'}), [forward]);
  assert.deepEqual(find('тетер', {status:'paused'}), [reverse]);
  assert.deepEqual(find('USD'), [forward, reverse]);
  assert.deepEqual(find('без города'), [crypto]);
});
