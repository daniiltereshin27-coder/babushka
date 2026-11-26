import { chromium } from '/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const results=[];
for(const [name,width,height] of [['mobile',440,956],['small',320,640],['phone',390,844],['tablet',768,1024],['desktop',1440,900]]) {
 const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8080/');await page.waitForTimeout(1200);await page.evaluate(()=>document.fonts.ready);
 const layout=await page.evaluate(()=>{
  const sound=document.querySelector('.sound-toggle'),menu=document.querySelector('.menu-toggle'),brand=document.querySelector('.brand');
  return {sound:sound.getBoundingClientRect().toJSON(),menu:menu.getBoundingClientRect().toJSON(),brand:brand.getBoundingClientRect().toJSON(),inHeader:!!sound.closest('.header'),overflow:document.documentElement.scrollWidth>innerWidth,shift:getComputedStyle(document.querySelector('.poster')).transform};
 });
 assert.equal(layout.overflow,false);
 await page.screenshot({path:`qa/mobile-header-2026-11-17/${name}-after.png`});
 if(width<=900){
  assert.equal(layout.inHeader,true);assert.equal(layout.sound.width,44);assert.equal(layout.sound.height,44);assert.equal(layout.menu.width,44);assert.equal(layout.sound.y,layout.menu.y);assert(layout.brand.right<=layout.sound.x);assert(layout.sound.right<layout.menu.x);
  await page.locator('.sound-toggle').click();await page.waitForTimeout(250);
  const state1=await page.locator('.sound-toggle').getAttribute('aria-pressed');
  await page.locator('.sound-toggle').click();await page.waitForTimeout(250);
  const state2=await page.locator('.sound-toggle').getAttribute('aria-pressed');assert.notEqual(state1,state2);
  await page.locator('.menu-toggle').click();assert.equal(await page.locator('.menu-toggle').getAttribute('aria-expanded'),'true');await page.keyboard.press('Escape');
  await page.locator('#exchange-button').click();await page.waitForTimeout(300);
  assert.equal(await page.locator('.desk .header .sound-toggle').count(),1);assert(await page.locator('.sound-toggle').isVisible());
  await page.screenshot({path:`qa/mobile-header-2026-11-17/${name}-calculator.png`});
  await page.locator('.brand').click();await page.waitForTimeout(300);assert.equal(await page.locator('.hero .header .sound-toggle').count(),1);
  await page.setViewportSize({width:1440,height:900});await page.waitForTimeout(150);assert.equal(await page.locator('body > .sound-toggle').count(),1);
  await page.setViewportSize({width,height});await page.waitForTimeout(150);assert.equal(await page.locator('.header .sound-toggle').count(),1);
 }else{assert.equal(layout.inHeader,false);assert.equal(layout.sound.width,64);}
 assert.deepEqual(errors,[]);results.push({name,width,height,layout,errors});await page.close();
}
// Check live animation uses the same mobile offset for all scene layers and the camera flight.
const live=await browser.newPage({viewport:{width:390,height:844}});await live.goto('http://127.0.0.1:8080/');await live.waitForTimeout(6500);
await live.screenshot({path:'qa/mobile-header-2026-11-17/phone-live.png'});
await live.evaluate(()=>{const video=document.querySelector('.desk-flight video');video.hidden=false;video.style.transition='none';});
const liveState=await live.evaluate(()=>({state:document.querySelector('.hero').dataset.state,scene:getComputedStyle(document.querySelector('#loop')).transform,flight:getComputedStyle(document.querySelector('.desk-flight video')).transform}));assert.equal(liveState.scene,liveState.flight);results.push({liveState});
await live.screenshot({path:'qa/mobile-header-2026-11-17/phone-live.png'});
await fs.writeFile('qa/mobile-header-2026-11-17/results.json',JSON.stringify(results,null,2));
console.log(JSON.stringify(results.map(x=>({name:x.name,width:x.width,shift:x.layout?.shift,liveState:x.liveState})),null,2));await browser.close();
