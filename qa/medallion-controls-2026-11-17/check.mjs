import {chromium} from '/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const results=[];
for(const width of [320,390,768,901,1440]){
 const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8080/');await page.evaluate(()=>document.fonts.ready);
 const layout=await page.evaluate(()=>{
  const rect=s=>document.querySelector(s).getBoundingClientRect().toJSON();const icon=document.querySelector('.header-telegram');
  return {icon:rect('.header-telegram'),sound:rect('.sound-toggle'),menu:rect('.menu-toggle'),brand:rect('.brand'),contacts:rect('a[href="#contacts"]'),cta:rect('.navigation .button'),prev:icon.previousElementSibling?.className,next:icon.nextElementSibling?.className,overflow:document.documentElement.scrollWidth>innerWidth,loaded:icon.firstElementChild.naturalWidth>0};
 });
 assert.equal(await page.locator('.header-telegram').getAttribute('href'),'https://t.me/baulsk');assert.equal(await page.locator('.header-telegram').getAttribute('target'),'_blank');assert(layout.loaded);assert(!layout.overflow);assert.equal(await page.locator('.header-telegram').count(),1);
 if(width<=900){assert.equal(layout.prev,'sound-toggle');assert.equal(layout.next,'menu-toggle');assert(layout.brand.right<=layout.sound.x);assert(layout.sound.right<layout.icon.x);assert(layout.icon.right<layout.menu.x);assert(layout.menu.right<=width);assert.equal(layout.icon.y,layout.sound.y);}
 else{assert(layout.contacts.right<layout.icon.x);assert(layout.icon.right<layout.cta.x);assert(layout.cta.right<=width);assert(layout.brand.right<layout.contacts.x);}
 if([320,390,901,1151,1440].includes(width))await page.screenshot({path:`qa/medallion-controls-2026-11-17/${width}.png`});
 if(width===390){
  for(const img of await page.locator('.control-icon').all())assert(await img.evaluate(el=>el.complete&&el.naturalWidth>0));
  await page.context().route('https://t.me/baulsk',route=>route.fulfill({status:200,contentType:'text/html',body:'<title>Telegram link check</title>'}));
  const popupPromise=page.waitForEvent('popup');await page.locator('.header-telegram').click();const popup=await popupPromise;await popup.waitForLoadState();assert.equal(popup.url(),'https://t.me/baulsk');await popup.close();
  const sound=page.locator('.sound-toggle');
  for(let i=0;i<2;i++){
    await sound.click();await page.waitForTimeout(250);
    const on=await sound.getAttribute('aria-pressed')==='true';
    assert.equal(await page.locator('.control-icon--sound-on').isVisible(),on);
    assert.equal(await page.locator('.control-icon--sound-off').isVisible(),!on);
    await page.screenshot({path:`qa/medallion-controls-2026-11-17/sound-${on?'on':'off'}.png`});
  }
  await page.locator('.menu-toggle').click();
  assert(await page.locator('.control-icon--close').isVisible());
  assert(!(await page.locator('.control-icon--menu').isVisible()));
  await page.screenshot({path:'qa/medallion-controls-2026-11-17/menu-open.png'});
  assert.equal(await page.locator('.menu-toggle').getAttribute('aria-expanded'),'true');await page.keyboard.press('Escape');await page.locator('#exchange-button').click();await page.waitForTimeout(250);assert.equal(await page.locator('.desk .header-telegram').count(),1);await page.screenshot({path:'qa/medallion-controls-2026-11-17/calculator-mobile.png'});await page.locator('.brand').click();await page.waitForTimeout(250);assert.equal(await page.locator('.hero .header-telegram').count(),1);await page.setViewportSize({width:1440,height:900});await page.waitForTimeout(150);assert.equal(await page.locator('.navigation .header-telegram').count(),1);await page.setViewportSize({width,height:900});await page.waitForTimeout(150);assert.equal(await page.locator('.header > .header-telegram').count(),1);}
 if(width>900){assert(await page.locator('.sound-toggle svg').isVisible());assert(!(await page.locator('.control-icon--sound-on').isVisible()));assert(!(await page.locator('.menu-toggle').isVisible()));}
 assert.deepEqual(errors,[]);results.push({width,layout,errors});await page.close();
}
await fs.writeFile('qa/medallion-controls-2026-11-17/results.json',JSON.stringify(results,null,2));console.log('PASS: '+results.map(r=>r.width).join(', '));await browser.close();
