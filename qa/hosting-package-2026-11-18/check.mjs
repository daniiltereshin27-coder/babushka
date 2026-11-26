import {chromium} from '/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
const base='http://127.0.0.1:8770';
const manifest=JSON.parse(await fs.readFile('qa/hosting-package-2026-11-18/manifest.json','utf8'));
for (const file of manifest.files) {
 const response=await fetch(`${base}/${file.path}`);
 assert.equal(response.status,200,file.path);
 const data=Buffer.from(await response.arrayBuffer());
 assert.equal(createHash('sha256').update(data).digest('hex'),file.sha256,file.path);
}
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const checks=[];
try {
 for(const width of [1440,390]) {
  const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'});
  const errors=[],missing=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.url().startsWith(base)&&r.status()>=400)missing.push([r.url(),r.status()]);});
  await page.goto(base,{waitUntil:'networkidle'});
  await page.locator('#exchange-button').click();
  await page.waitForFunction(()=>document.querySelector('#exchange').getAttribute('aria-hidden')==='false');
  assert.equal(await page.locator('#send-currency option').count(),49);
  assert.equal(await page.locator('#receive-currency option').count(),49);
  if(width===390){
   await page.locator('#send-picker').click();
   await page.locator('#currency-picker [data-key=BTC]').click();
   assert.equal(await page.locator('#send-currency').inputValue(),'BTC');
   await page.locator('#send-picker').click();
   await page.locator('#currency-picker [data-key=USDT_TRC20]').click();
  }
  await page.locator('#send-amount').fill('2000');
  assert.ok((await page.locator('#receive-amount').inputValue()).length>0);
  await page.locator('[data-city-open="receive"]').click();
  await page.locator('#city-search').fill('Москва');
  await page.locator('.bx-city-option').filter({hasText:'Москва'}).first().click();
  await page.locator('#exchange-form > .desk__submit').click();
  await page.locator('#request-name').fill('Тест');
  await page.locator('#request-telegram').fill('@test_user');
  for(const id of ['consent-rules','consent-privacy','consent-aml'])await page.locator('#'+id).check();
  await page.locator('.bx-request__submit').click();
  await page.locator('#request-success').waitFor({state:'visible'});
  assert.match(await page.locator('.bx-success__notice').innerText(),/не отправляется/);
  await page.locator('#request-success [data-close-dialog]').click();
  await page.screenshot({path:`qa/hosting-package-2026-11-18/${width}.png`});
  await page.locator('.brand').click();
  if(width===390){await page.locator('.menu-toggle').click();assert.equal(await page.locator('.menu-toggle').getAttribute('aria-expanded'),'true');}
  await page.goto('about:blank');
  await page.goto(base+'/#exchange',{waitUntil:'networkidle'});
  assert.equal(await page.locator('#exchange').getAttribute('aria-hidden'),'false');
  assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
  checks.push({width,errors,missing,calculator:true,citySearch:true,demoForm:true,directHash:true});
  await page.close();
 }
 for(const motionWidth of [1440,390]){
 const page=await browser.newPage({viewport:{width:motionWidth,height:900}});
 await page.goto(base);
 await page.waitForFunction(()=>document.querySelector('.hero').dataset.state==='loop',{},{timeout:25000});
 assert.ok((await page.locator('#intro').getAttribute('src')).includes(motionWidth===390?'assets/mobile/intro.mp4':'assets/intro.mp4'));
 await page.locator('#exchange-button').click();
 await page.waitForFunction(()=>document.querySelector('#exchange').getAttribute('aria-hidden')==='false',{},{timeout:25000});
 checks.push({width:motionWidth,normalMotion:true,introAndLoop:true,exchangeTransition:true});
 await page.close();
 }
 await fs.writeFile('qa/hosting-package-2026-11-18/results.json',JSON.stringify({filesVerifiedOverHTTP:manifest.file_count,checks},null,2)+'\n');
 console.log('PASS: all '+manifest.file_count+' packaged files served with matching hashes; desktop/mobile calculator, location search, demo form, direct link and video transition.');
} finally {await browser.close();}
