'use strict';
// Presentation arithmetic only. Production quotes and validation belong on the server.
((root) => {
  function parse(value) {
    const cleaned=String(value).trim().replace(/[\s\u00a0\u202f]/g,'').replace(',','.');
    return /^\d+(?:\.\d{0,8})?$/.test(cleaned)?Number(cleaned):NaN;
  }
  function calculate({from,to,value,side='send'}) {
    const n=parse(value),rate=from.usd/to.usd*.99;
    const send=side==='receive'?n/rate:n,receive=side==='receive'?n:n*rate;
    return {send,receive,rate,usd:send*from.usd,valid:Number.isFinite(n)&&n>0};
  }
  function secondsLeft(deadline,now=Date.now()) {return Math.max(0,Math.min(60,Math.ceil((deadline-now)/1000)));}
  function normalizeLocation(value) {
    return String(value).normalize('NFKC').toLocaleLowerCase('ru').replace(/ё/g,'е')
      .replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  }
  function matchQuery(query) {
    const words = normalizeLocation(query).split(/\s+/).filter(Boolean);
    return value => {
      const text = normalizeLocation(value);
      const compact = text.replace(/\s/g, '');
      return words.every(word => text.includes(word) || compact.includes(word));
    };
  }
  const aliases = {USDT:'Tether тезер тетер', USDC:'USD Coin', BTC:'биткоин биткойн', ETH:'эфир эфириум'};
  function currencyTerms(currencies, key) {
    const coin = currencies[key];
    return [key, coin.symbol, coin.label, coin.network, currencies[coin.symbol]?.label, aliases[coin.symbol]].join(' ');
  }
  function searchCurrencies(currencies, keys, category, query) {
    const matches = matchQuery(query);
    const filtered = keys.filter(key => {
      const coin = currencies[key];
      const type = coin.crypto ? 'crypto' : coin.kind ? 'cashless' : 'cash';
      return (category === 'all' || category === type) && matches(currencyTerms(currencies, key));
    });
    const ticker = query.trim().toUpperCase();
    if (!ticker) return filtered;
    const rank = key => key === ticker ? 0 : currencies[key].symbol === ticker ? 1 : 2;
    return filtered.sort((a, b) => rank(a) - rank(b));
  }
  function locationTerms(name) {
    const aliases = [];
    if(name === 'Россия' || name.endsWith(', Россия'))aliases.push('РФ Российская Федерация Russia');
    if(name.startsWith('Москва,'))aliases.push('Moscow Moskva');
    if(name.startsWith('Санкт-Петербург,'))aliases.push('СПб Питер Saint Petersburg');
    return [name, ...aliases].join(' ');
  }
  function searchCities(cities,query) {
    const matches = matchQuery(query);
    return cities.filter(name => matches(locationTerms(name)));
  }
  function ruleBlock(rule, assets, paused) {
    if (!rule.enabled) return 'Правило на паузе.';
    if (!assets[rule.src]?.send) return 'Для валюты отдачи отключена сторона «Отдаёте».';
    if (!assets[rule.dst]?.receive) return 'Для валюты получения отключена сторона «Получаете».';
    if (!rule.city) return '';
    const [city,country] = rule.city.split(', ');
    if (paused('country',country)) return 'Обмен временно приостановлен (' + country + ').';
    if (assets[rule.src].category === 'cash' && paused('intake',rule.city)) return 'Приём наличных временно приостановлен (' + city + ').';
    if (assets[rule.dst].category === 'cash' && paused('payout',rule.city)) return 'Выдача наличных временно приостановлена (' + city + ').';
    return '';
  }
  function searchRules(rules, currencies, {query, src, dst, status}) {
    const symbols = new Set(Object.values(currencies).map(coin => coin.symbol.toLowerCase()));
    const words = normalizeLocation(query).split(' ').filter(Boolean);
    const tickers = words.filter(word => symbols.has(word));
    const match = matchQuery(words.filter(word => !symbols.has(word)).join(' '));
    return rules.filter(rule => {
      if (src && rule.src !== src || dst && rule.dst !== dst) return false;
      if (status !== 'all' && Boolean(rule.enabled && !rule.blocked) !== (status === 'active')) return false;
      const sides = [currencies[rule.src].symbol.toLowerCase(), currencies[rule.dst].symbol.toLowerCase()];
      if (!tickers.every(word => sides.includes(word))) return false;
      return match([currencyTerms(currencies, rule.src), currencyTerms(currencies, rule.dst),
        locationTerms(rule.city || 'Без города')].join(' '));
    });
  }
  const api={parse,calculate,secondsLeft,searchCities,searchCurrencies,searchRules,ruleBlock};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.BXCalc=api;
})(typeof window!=='undefined'?window:globalThis);
