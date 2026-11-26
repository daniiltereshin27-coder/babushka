'use strict';
// Visual catalog observed on 001k.exchange, 2026-11-17.
// Prices are local presentation fixtures, not market quotes or a service offer.
(() => {
  const currencies = {
    USDT_TRC20: { label:'USDT · TRC20', symbol:'USDT', usd:1, network:'Сеть Tron · TRC20', crypto:true, digits:2 },
    USDT_ERC20: { label:'USDT · ERC20', symbol:'USDT', usd:1, network:'Сеть Ethereum · ERC20', crypto:true, digits:2 },
    BTC: { label:'Bitcoin · BTC', symbol:'BTC', usd:68000, network:'Сеть Bitcoin', crypto:true, digits:8 },
    ETH: { label:'Ethereum · ETH', symbol:'ETH', usd:2500, network:'Сеть Ethereum', crypto:true, digits:6 },
    USD: { label:'Доллар · USD', symbol:'USD', usd:1, network:'Доллар США', crypto:false, digits:2 },
    USDC: {label:'USDC · ERC20',symbol:'USDC',usd:1,network:'Сеть Ethereum · ERC20',crypto:true,digits:2},
    USDT_SOL: {label:'USDT · SOL',symbol:'USDT',usd:1,network:'Сеть Solana',crypto:true,digits:2},
    USDT_TON: {label:'USDT · TON',symbol:'USDT',usd:1,network:'Сеть TON',crypto:true,digits:2},
    AED: {label:'Дирхам · AED',symbol:'AED',usd:0.2723,network:'Дирхам ОАЭ',crypto:false,digits:2},
    GBP: {label:'Фунт · GBP',symbol:'GBP',usd:1.27,network:'Британский фунт',crypto:false,digits:2},
    CHF: {label:'Франк · CHF',symbol:'CHF',usd:1.13,network:'Швейцарский франк',crypto:false,digits:2},
    TRY: {label:'Лира · TRY',symbol:'TRY',usd:0.029,network:'Турецкая лира',crypto:false,digits:2},
    EUR: { label:'Евро · EUR', symbol:'EUR', usd:1.1, network:'Евро', crypto:false, digits:2 }
  };
  Object.assign(currencies,{
    THB:{label:'Бат · THB',symbol:'THB',usd:0.028,network:'Тайский бат',crypto:false,digits:2},
    JPY:{label:'Иена · JPY',symbol:'JPY',usd:0.0067,network:'Японская иена',crypto:false,digits:2},
    ARS:{label:'Песо · ARS',symbol:'ARS',usd:0.001,network:'Аргентинский песо',crypto:false,digits:2},
    INR:{label:'Рупия · INR',symbol:'INR',usd:0.012,network:'Индийская рупия',crypto:false,digits:2},
    BANK_PLN:{label:'Любой банк · PLN',symbol:'PLN',usd:0.25,network:'Банковский перевод · PLN',crypto:false,digits:2,kind:'bank'},
    BANK_USD:{label:'Любой банк · USD',symbol:'USD',usd:1,network:'Банковский перевод · USD',crypto:false,digits:2,kind:'bank'},
    CORP_USD:{label:'Счёт компании · USD',symbol:'USD',usd:1,network:'Счёт компании · USD',crypto:false,digits:2,kind:'company'},
    CORP_EUR:{label:'Счёт компании · EUR',symbol:'EUR',usd:1.1,network:'Счёт компании · EUR',crypto:false,digits:2,kind:'company'}
  });
  Object.assign(currencies,{"KZT": {"label": "Тенге · KZT", "symbol": "KZT", "usd": 0.002, "network": "Тенге", "crypto": false, "digits": 2}, "AUD": {"label": "Австралийский доллар · AUD", "symbol": "AUD", "usd": 0.65, "network": "Австралийский доллар", "crypto": false, "digits": 2}, "CNY": {"label": "Юань · CNY", "symbol": "CNY", "usd": 0.138, "network": "Юань", "crypto": false, "digits": 2}, "MXN": {"label": "Мексиканский песо · MXN", "symbol": "MXN", "usd": 0.05, "network": "Мексиканский песо", "crypto": false, "digits": 2}, "CZK": {"label": "Чешская крона · CZK", "symbol": "CZK", "usd": 0.043, "network": "Чешская крона", "crypto": false, "digits": 2}, "SGD": {"label": "Сингапурский доллар · SGD", "symbol": "SGD", "usd": 0.74, "network": "Сингапурский доллар", "crypto": false, "digits": 2}, "VND": {"label": "Донг · VND", "symbol": "VND", "usd": 3.9e-05, "network": "Донг", "crypto": false, "digits": 2}, "MDL": {"label": "Молдавский лей · MDL", "symbol": "MDL", "usd": 0.056, "network": "Молдавский лей", "crypto": false, "digits": 2}, "KGS": {"label": "Сом · KGS", "symbol": "KGS", "usd": 0.0114, "network": "Сом", "crypto": false, "digits": 2}, "BRL": {"label": "Реал · BRL", "symbol": "BRL", "usd": 0.18, "network": "Реал", "crypto": false, "digits": 2}, "COP": {"label": "Колумбийский песо · COP", "symbol": "COP", "usd": 0.00024, "network": "Колумбийский песо", "crypto": false, "digits": 2}, "AZN": {"label": "Манат · AZN", "symbol": "AZN", "usd": 0.588, "network": "Манат", "crypto": false, "digits": 2}, "AMD": {"label": "Драм · AMD", "symbol": "AMD", "usd": 0.00258, "network": "Драм", "crypto": false, "digits": 2}, "BGN": {"label": "Болгарский лев · BGN", "symbol": "BGN", "usd": 0.562, "network": "Болгарский лев", "crypto": false, "digits": 2}, "CAD": {"label": "Канадский доллар · CAD", "symbol": "CAD", "usd": 0.72, "network": "Канадский доллар", "crypto": false, "digits": 2}, "KRW": {"label": "Вона · KRW", "symbol": "KRW", "usd": 0.00072, "network": "Вона", "crypto": false, "digits": 2}, "RON": {"label": "Румынский лей · RON", "symbol": "RON", "usd": 0.22, "network": "Румынский лей", "crypto": false, "digits": 2}, "IDR": {"label": "Рупия Индонезии · IDR", "symbol": "IDR", "usd": 6.2e-05, "network": "Рупия Индонезии", "crypto": false, "digits": 2}});
  currencies.BANK_KRW={label:"Любой банк · KRW",symbol:"KRW",usd:currencies.KRW.usd,network:"Любой банк · KRW",crypto:false,digits:2,kind:"bank"};
  currencies.BANK_CNY={label:"Любой банк · CNY",symbol:"CNY",usd:currencies.CNY.usd,network:"Любой банк · CNY",crypto:false,digits:2,kind:"bank"};
  currencies.CARD_CNY={label:"Visa/Mastercard · CNY",symbol:"CNY",usd:currencies.CNY.usd,network:"Visa/Mastercard · CNY",crypto:false,digits:2,kind:"card"};
  currencies.ALIPAY={label:"Alipay · CNY",symbol:"CNY",usd:currencies.CNY.usd,network:"Alipay · CNY",crypto:false,digits:2,kind:"payment"};
  currencies.PAYPAL_EUR={label:"PayPal · EUR",symbol:"EUR",usd:currencies.EUR.usd,network:"PayPal · EUR",crypto:false,digits:2,kind:"payment"};
  currencies.PAYPAL_USD={label:"PayPal · USD",symbol:"USD",usd:currencies.USD.usd,network:"PayPal · USD",crypto:false,digits:2,kind:"payment"};
  currencies.WISE_USD={label:"Wise · USD",symbol:"USD",usd:currencies.USD.usd,network:"Wise · USD",crypto:false,digits:2,kind:"payment"};
  currencies.WISE_EUR={label:"Wise · EUR",symbol:"EUR",usd:currencies.EUR.usd,network:"Wise · EUR",crypto:false,digits:2,kind:"payment"};
  currencies.REVOLUT_EUR={label:"Revolut · EUR",symbol:"EUR",usd:currencies.EUR.usd,network:"Revolut · EUR",crypto:false,digits:2,kind:"payment"};
  currencies.ZELLE_USD={label:"Zelle · USD",symbol:"USD",usd:currencies.USD.usd,network:"Zelle · USD",crypto:false,digits:2,kind:"payment"};
  window.BXCatalog={currencies,sendOrder:["USDT_TRC20", "USDC", "USDT_ERC20", "USDT_SOL", "USDT_TON", "ETH", "BTC", "USD", "EUR", "AED", "CHF", "TRY", "GBP", "KZT", "AUD", "CNY", "THB", "MXN", "JPY", "CZK", "SGD", "VND", "MDL", "KGS", "BRL", "COP", "AZN", "AMD", "BGN", "ARS", "CAD", "INR", "KRW", "RON", "IDR", "BANK_KRW", "BANK_PLN", "BANK_USD", "CARD_CNY", "CORP_USD", "CORP_EUR", "BANK_CNY", "ALIPAY", "PAYPAL_EUR", "PAYPAL_USD", "WISE_USD", "WISE_EUR", "REVOLUT_EUR", "ZELLE_USD"],receiveOrder:["USD", "EUR", "AED", "CHF", "TRY", "GBP", "KZT", "AUD", "CNY", "THB", "MXN", "JPY", "CZK", "SGD", "VND", "MDL", "KGS", "BRL", "COP", "AZN", "AMD", "BGN", "ARS", "CAD", "INR", "KRW", "RON", "IDR", "BANK_KRW", "BANK_PLN", "BANK_USD", "CARD_CNY", "CORP_USD", "CORP_EUR", "BANK_CNY", "ALIPAY", "PAYPAL_EUR", "PAYPAL_USD", "WISE_USD", "WISE_EUR", "REVOLUT_EUR", "ZELLE_USD", "USDT_TRC20", "USDC", "USDT_ERC20", "USDT_SOL", "USDT_TON", "ETH", "BTC"]};
})();
