// Run from the project root. Only the temporary database is used.
import {randomBytes} from 'node:crypto';
import {configureManager,initSecurity} from '../../server/security.mjs';
import {initRequests,readSnapshot} from '../../server/requests.mjs';
import {loadKey} from '../../server/private-storage.mjs';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {openStore,save} from '../../server/store.mjs';
import {locationDirectory} from '../../server/locations.mjs';
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || '/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const dir=mkdtempSync(join(tmpdir(),'bx-acceptance-'));
const path=join(dir,'qa.sqlite');
const db=openStore(path);
process.env.BX_KEY_FILE=join(dir,'key');
initRequests(db,loadKey(db));initSecurity(db);
const password=randomBytes(24).toString('base64url');
await configureManager(db,'create','qa-manager',password);
const seed={src:'USDT_TRC20',dst:'USD',min:100,max:50000,percent:-1,enabled:true};
for(const city of locationDirectory(db).cities.filter(v=>!v.startsWith('Москва,')&&!v.startsWith('Дубай,')).slice(0,26)) save(db,{...seed,city});
const port=Number(process.env.BX_QA_PORT || 8186);
const origin='http://127.0.0.1:'+port;
const app=spawn(process.execPath,['server/app.mjs'],{env:{...process.env,PORT:String(port),BX_DB:path},stdio:['ignore','pipe','inherit']});
let browser;
try {
  await Promise.race([once(app.stdout,'data'),once(app,'exit').then(()=>{throw Error('QA server did not start');})]);
  browser=await chromium.launch({executablePath:process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:960},reducedMotion:'reduce'});
  const a=await context.newPage(), c=await context.newPage();
  const errors=[];
  for(const page of [a,c]){page.setDefaultTimeout(7000);page.on('pageerror',e=>errors.push(e.message));}
  const A=id=>a.locator('#'+id), C=id=>c.locator('#'+id);
  const waitText=async(page,id,text)=>page.waitForFunction(([id,text])=>document.getElementById(id).textContent.toLowerCase().includes(text.toLowerCase()),[id,text]);
  const section=async hash=>{ await a.locator('.sidebar a[href="#'+hash+'"]').click(); await A(hash+'-panel').waitFor({state:'visible'}); };
  const ruleSave=async()=>{await a.locator('#editor .primary').click();await waitText(a,'status','сохранен');};
  const saveCoin=async()=>{await A('instrument-save').click();await waitText(a,'instrument-status','Сохранено');};
  const pick=async(id,query)=>{await A(id).click(); await A('pick-search').fill(query);await a.locator('#pick-options [role=option]').first().click();};
  const screen=async(page,file)=>page.screenshot({path:'qa/admin-calculator/'+file+'.png'});
  for(const endpoint of ['rules','catalog','locations','audit','session']) {
    assert.equal((await context.request.get(origin+'/api/admin/'+endpoint)).status(),401);
  }
  const anonPost=await context.request.post(origin+'/api/admin/rules',{headers:{origin},data:{}});
  assert.equal(anonPost.status(),401);
  await a.goto(origin+'/admin/#catalog');
  await a.locator('[name=login]').fill('qa-manager');
  await a.locator('[name=password]').fill(password);
  await a.getByRole('button',{name:'Войти'}).click();
  await a.waitForURL('**/admin/#catalog');
  await waitText(a,'catalog-count','49');
  const managerCookie=(await context.cookies()).find(cookie=>cookie.name==='bx-local-'+port);
  assert.ok(managerCookie.httpOnly && managerCookie.sameSite==='Strict');
  const csrf=(await (await context.request.get(origin+'/api/admin/session')).json()).csrf;
  for(const headers of [{origin},{origin:'http://localhost:'+port,'x-bx-csrf':csrf}])
    assert.equal((await context.request.post(origin+'/api/admin/rules',{headers,data:{}})).status(),403);
  const visitor=await browser.newContext();
  assert.equal((await visitor.request.get(origin+'/api/quote?src=USDT_TRC20&dst=USD&side=send&value=1000&chooseCity=1')).status(),200);
  await visitor.close();
  for(const [category,label,symbol,send,receive] of [
    ['crypto','QA Coin','QAC',true,false],['cash','QA Cash','QAF',false,true],['cashless','QA Bank','QAB',true,true]
  ]){
    await A('catalog-add').click();await A('instrument-category').selectOption(category);
    await A('instrument-label').fill(label);await A('instrument-symbol').fill(symbol);
    await A('instrument-usd').fill('1');await A('instrument-send').setChecked(send);await A('instrument-receive').setChecked(receive);
    if(category==='crypto') {await A('instrument-file').setInputFiles(resolve('assets/currencies/atelier/BTC.webp'));await A('instrument-preview').waitFor({state:'visible'});}
    await saveCoin();
  }
  await A('catalog-search').fill('QA Coin');await a.locator('.catalog-item').click();
  await A('instrument-file').setInputFiles(resolve('assets/currencies/atelier/ETH.webp'));await saveCoin();
  assert.match(await A('instrument-preview').getAttribute('src'),/v=2$/);
  await section('locations');await A('add-country').click();await A('geo-country').fill('Тестовая страна');await A('geo-city').fill('Янтарный');
  await A('geo-save').click();await waitText(a,'pause-status','Янтарный');
  await A('add-city').click();await A('geo-city').fill('Второй');await A('geo-payout').uncheck();await A('geo-save').click();
  await waitText(a,'pause-status','Второй');
  await a.getByRole('button',{name:'Создать правило для города Янтарный, Тестовая страна'}).click();
  await pick('src','QA Coin');await pick('dst','QA Cash');
  assert.match(await A('city-value').textContent(),/Янтарный/);
  await A('min').fill('100');await A('max').fill('5000');await A('percent').fill('-2');await A('add-tier').click();
  await a.locator('[name=threshold]').fill('1000');await a.locator('[name=percent]').fill('-1');await ruleSave();
  await A('rule-search').fill('QAC Янтарный');assert.equal(await a.locator('.rule').count(),1);
  await screen(a,'rule');
  await c.goto(new URL(await A('preview').getAttribute('href'),origin).href);
  async function amount(id,value,expectedId,expected){
    await C(id).fill(value);
    await c.waitForFunction(([id,n])=>Number(document.getElementById(id).value.replace(/\s/g,'').replace(',','.'))===n,[expectedId,expected]);
  }
  await amount('send-amount','100','receive-amount',98);
  await amount('send-amount','5000','receive-amount',4950);
  await C('send-amount').fill('99.99');await waitText(c,'amount-error','Допустимая');
  await amount('send-amount','999','receive-amount',979.02);
  await amount('send-amount','1000','receive-amount',990);
  await amount('send-amount','1001','receive-amount',990.99);
  await amount('receive-amount','990','send-amount',1000);
  await c.clock.install();
  const refresh=c.waitForResponse(r=>r.url().includes('/api/quote?')&&r.url().includes('side=receive'));
  await c.clock.fastForward(61000);await refresh;
  assert.equal(await C('receive-amount').inputValue(),'990');
  await C('send-amount').fill('5001');await waitText(c,'amount-error','Допустимая');
  assert.equal(await c.locator('#exchange-form [type=submit]').isDisabled(),true);
  await amount('send-amount','1000','receive-amount',990);
  await c.locator('#exchange-form [type=submit]').click();
  assert.equal(await C('consent-rules').isChecked(),false);
  await C('request-name').fill('Тест клиента');await C('request-telegram').fill('@test_client');
  await c.locator('.bx-request__submit').click();await waitText(c,'consent-error','Подтвердите');
  for(const id of ['rules','privacy','aml'])await C('consent-'+id).check();
  await a.locator('[name=percent]').fill('-0.5');await ruleSave();
  await waitText(c,'summary-to','995');await waitText(c,'request-quote-error','Курс изменился');
  await section('locations');
  const payout=a.getByRole('checkbox',{name:'Выдача наличных — Янтарный'});
  await payout.uncheck();await waitText(c,'request-quote-error','Выдача');assert.ok(await c.locator('.bx-request__submit').isDisabled());
  await section('directions');await waitText(a,'effective-status','Выдача');await a.locator('[data-status=paused]').click();assert.equal(await a.locator('.rule').count(),1);
  await screen(a,'blocked-rule');
  await section('locations');await payout.check();await c.waitForFunction(()=>!document.querySelector('.bx-request__submit').disabled);
  await A('toggle-pause').click();await waitText(c,'request-quote-error','приостановлен');await A('toggle-pause').click();
  await c.waitForFunction(()=>!document.querySelector('.bx-request__submit').disabled);
  await section('directions');
  await A('enabled').uncheck();await ruleSave();await waitText(c,'request-quote-error','недоступен');
  await A('enabled').check();await ruleSave();
  await section('catalog');await A('catalog-search').fill('QA Coin');await a.locator('.catalog-item').click();
  await A('instrument-send').uncheck();await saveCoin();
  await c.waitForFunction(()=>document.querySelector('.bx-request__submit').disabled);
  assert.equal(await C('request-name').inputValue(),'Тест клиента');
  await A('instrument-send').check();await saveCoin();
  // A disabled currency may have been removed from the active selection; reopen the original route.
  await c.reload();await c.locator('#exchange-form [type=submit]').click();
  await C('request-name').fill('Тест клиента');await C('request-telegram').fill('@test_client');
  for(const key of ['rules','privacy','aml'])await C('consent-'+key).check();
  // Change in a different session, with no storage event. Submission must catch the stale quote.
  const row=db.prepare("SELECT * FROM rules WHERE city='Янтарный, Тестовая страна'").get();
  save(db,{...row,enabled:true,tiers:[{threshold:1000,percent:0}]});
  await c.locator('.bx-request__submit').click();await waitText(c,'request-quote-error','Курс изменился');
  assert.equal(await C('request-name').inputValue(),'Тест клиента');assert.ok(await C('consent-privacy').isChecked());
  await waitText(c,'summary-to','1');await screen(c,'reconfirm');
  // Simulate a committed request whose HTTP response never reaches the page.
  await c.route('**/api/requests',async route=>{
    const result=await route.fetch();
    assert.equal(result.status(),201);
    await route.abort('failed');
  },{times:1});
  await c.locator('.bx-request__submit').click();await waitText(c,'request-quote-error','Повторите отправку');
  await section('locations');await payout.uncheck();await waitText(a,'pause-status','сохранены');
  const sent=c.waitForRequest(r=>r.url()===origin+'/api/requests');
  await c.locator('.bx-request__submit').click();await waitText(c,'request-number','BX-000001');
  const repeat=await context.request.post(origin+'/api/requests',{headers:{origin},data:(await sent).postDataJSON()});
  assert.equal((await repeat.json()).number,'BX-000001');
  const saved=db.prepare('SELECT token,snapshot FROM exchange_requests').all();assert.equal(saved.length,1);
  assert.equal(readSnapshot(db,saved[0]).receive,1000);
  await screen(c,'receipt');
  await payout.check();await waitText(a,'pause-status','сохранены');
  await c.goto(origin+'/?src=BTC&dst=USDT_TRC20&amount=1#exchange');
  await c.waitForFunction(()=>Number(document.querySelector('#receive-amount').value.replace(/\s/g,'').replace(',','.'))>0);
  assert.ok(!await C('send-location').isVisible() && !await C('delivery-fields').isVisible());
  // Switch to an unconfigured noncash pair.
  await C('send-currency').selectOption({label:'QA Bank'});
  await waitText(c,'amount-error','недоступен');assert.ok(await c.locator('#exchange-form [type=submit]').isDisabled());
  await section('directions');await a.locator('[data-status=all]').click();await A('rule-search').fill('');await A('next-rules').click();
  assert.match(await A('rule-count').textContent(),/7–12 из 31/);
  await A('rule-search').fill('QAC Янтарный');await a.locator('.rule').click();
  await A('city').click();await A('pick-search').fill('страна янтарный');await a.keyboard.press('ArrowDown');await a.keyboard.press('Enter');
  await A('rule-search').fill('Дубай USDT USD');await a.locator('.rule').filter({hasText:'USDT · TRC20 → Доллар'}).click();
  await A('reverse-rule').click();assert.match(await A('src-value').textContent(),/Доллар/);
  await a.reload();await waitText(a,'rule-count','31');
  await section('locations');await pick('location','Россия');await A('add-city').click();await A('geo-city').fill('Тестовый город');await A('geo-save').click();
  await waitText(a,'pause-status','Тестовый город');await A('add-city').click();await A('geo-city').fill('тестовый город');await A('geo-save').click();await waitText(a,'geo-error','уже есть');assert.equal(await A('geo-city').inputValue(),'тестовый город');await A('geo-cancel').click();
  await pick('location','Тестовая страна');
  await c.goto(origin+'/?src=USDT_TRC20&dst=USD&city='+encodeURIComponent('Москва, Россия')+'&amount=1000#exchange');
  await c.waitForFunction(()=>document.querySelector('#receive-amount').value.includes('980'));
  await c.locator('[data-city-open="receive"]').click();await C('city-search').fill('ОАЭ Дубай');await c.locator('#city-results button').first().click();
  await c.waitForFunction(()=>document.querySelector('#receive-amount').value.includes('990'));
  for(const width of [1280,768,390,320]){
    await a.setViewportSize({width,height:850});await c.setViewportSize({width,height:850});
    for(const panel of ['directions','locations','catalog']){
      await section(panel);
      assert.ok(await a.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),panel+' overflow '+width);
    }
    if(width===390){
      await section('locations');await screen(a,'mobile-locations');
      await c.goto(origin+'/#exchange');await C('send-picker').click();await c.locator('#picker-type').selectOption('crypto');
      assert.ok(await c.getByRole('button',{name:'QA Coin'}).isVisible());await c.locator('#currency-picker .bx-modal__close').click();
      await C('receive-picker').click();await c.locator('#picker-type').selectOption('crypto');
      assert.equal(await c.getByRole('button',{name:'QA Coin'}).count(),0);
      await c.locator('#currency-picker .bx-modal__close').click();
    }
  }
  await section('audit');await a.locator('#audit-list li').first().waitFor();
  assert.ok((await A('audit-list').innerText()).includes('Изменено правило'));
  await A('logout').click();await a.waitForURL('**/admin/login');
  assert.equal((await context.request.get(origin+'/api/admin/rules',{headers:{Cookie:managerCookie.name+'='+managerCookie.value}})).status(),401);
  assert.deepEqual(errors,[]);console.log('PASS browser: catalogue, location, 31 rules, timer, quotes, open form, pauses, receipt, retry, four viewport sizes.');
} finally {
  if(browser) await browser.close();
  app.kill();db.close();rmSync(dir,{recursive:true,force:true});
}
