import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {mkdir} from 'node:fs/promises';
const require=createRequire(import.meta.url);
test('mobile card, persona and chat selectors fill panel and keep paging outside list scroll',{timeout:90000},async()=>{
 let runtime;try{runtime=require('playwright');}catch{runtime=require(process.env.MIAO_PLAYWRIGHT_MODULE||`${homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`);}
 const server=spawn(process.execPath,['tests/preview-server.mjs'],{env:{...process.env,MIAO_PREVIEW_PORT:'0'},stdio:['ignore','pipe','pipe']});let browser;
 try{
  const url=await new Promise((resolve,reject)=>{let stderr='';const timer=setTimeout(()=>reject(Error('preview timeout: '+stderr)),10000);server.stderr.on('data',d=>stderr+=d);server.stdout.on('data',d=>{const match=String(d).match(/http:\/\/[^\s]+/);if(match){clearTimeout(timer);resolve(match[0]);}});server.on('exit',()=>{clearTimeout(timer);reject(Error(stderr));});});
  browser=await runtime.chromium.launch({channel:process.env.MIAO_BROWSER_CHANNEL||'chrome',headless:true});await mkdir('docs/local',{recursive:true});
  for(const [width,height] of [[402,755],[390,844]]){
   const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(url+'/?settings-smoke&tt');await page.locator('#miao-nai-menu').waitFor();
   await page.evaluate(()=>{
    const p=window.preview,c=p.context;
    c.characterId=null;c.characters=Array.from({length:21},(_,i)=>({avatar:`layout-${i}.png`,name:`Card ${String(i).padStart(2,'0')} `+'长角色名称'.repeat(18),data:{extensions:{}}}));
    c.powerUserSettings.personas=Object.fromEntries(Array.from({length:21},(_,i)=>[`layout-user-${i}.png`,`User ${String(i).padStart(2,'0')} `+'长用户名称'.repeat(18)]));
    p.bindingDiskChats=Object.fromEntries(Array.from({length:21},(_,i)=>[JSON.stringify(['layout-0.png',`Chat ${String(i).padStart(2,'0')} `+'LongChatName'.repeat(18)]),[{chat_metadata:{integrity:`fixture-${i}`}}]]));
    p.layoutRefreshes=0;p.beforeRequest=async url=>{if(url==='/api/characters/chats')p.layoutRefreshes++;};
   });
   await page.locator('#miao-nai-menu').click();
   if(await page.locator('.miao-settings').getAttribute('data-section')!=='overview')await page.locator('.miao-drawer-back').click();
   await page.locator('.miao-overview-row[aria-label="角色管理"]').click();
   const view=page.locator('.miao-character-bindings'),back=()=>page.locator('.miao-drawer-back').click();
   const checkLayout=async(rowSelector,label)=>{
    const rows=view.locator(rowSelector),viewport=view.locator('.miao-binding-viewport'),pages=view.locator('.miao-binding-pages');await rows.nth(9).waitFor();assert.equal(await rows.count(),10);
    const measure=()=>view.evaluate(n=>{const body=n.closest('.miao-panel-body'),v=n.querySelector('.miao-binding-viewport'),p=n.querySelector('.miao-binding-pages'),vr=v.getBoundingClientRect(),pr=p.getBoundingClientRect(),br=body.getBoundingClientRect();return {gap:pr.top-vr.bottom,bottom:br.bottom-parseFloat(getComputedStyle(body).paddingBottom)-pr.bottom,height:vr.height,pagerHeight:pr.height,pad:parseFloat(getComputedStyle(body).paddingBottom),overflow:[body,n,v,p].some(el=>el.scrollWidth>el.clientWidth+1),visible:pr.bottom<=innerHeight};});
    let m=await measure();assert.ok(m.height>100,JSON.stringify(m));assert.ok(m.gap>=8&&m.gap<=12,JSON.stringify(m));assert.ok(Math.abs(m.bottom)<2,JSON.stringify(m));assert.ok(m.pagerHeight>=44&&m.pagerHeight<65);assert.ok(m.pad>=16);assert.equal(m.overflow,false);assert.equal(m.visible,true);
    const before=await pages.boundingBox();await viewport.evaluate(n=>n.scrollTop=n.scrollHeight);await rows.last().scrollIntoViewIfNeeded();const last=await rows.last().boundingBox(),box=await viewport.boundingBox();assert.ok(last.y+last.height<=box.y+box.height+1);assert.deepEqual(await pages.boundingBox(),before);
    await view.getByRole('button',{name:'下一页',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.miao-binding-pages span')?.textContent==='2 / 3');assert.equal(await rows.count(),10);await view.getByRole('button',{name:'上一页',exact:true}).click();
    const search=view.getByRole('searchbox');await search.fill('00');await page.waitForFunction(()=>document.querySelector('.miao-binding-pages span')?.textContent==='1 / 1');assert.equal(await rows.count(),1);await search.fill('');await rows.nth(9).waitFor();
    await view.getByRole('button',{name:'刷新列表',exact:true}).click();await rows.nth(9).waitFor();assert.equal(await rows.count(),10);
    await search.focus();await page.setViewportSize({width,height:420});await page.waitForTimeout(100);m=await measure();assert.ok(Math.abs(m.bottom)<2&&m.visible&&!m.overflow,JSON.stringify(m));await page.setViewportSize({width,height});await search.blur();await page.waitForTimeout(100);
    await page.screenshot({path:`docs/local/binding-layout-${label}-${width}x${height}.png`});
   };
   await view.getByRole('button',{name:'角色管理',exact:true}).click();await checkLayout('.miao-owner-row','cards');await back();
   await view.getByRole('button',{name:'用户设定管理',exact:true}).click();await checkLayout('.miao-owner-row','personas');await back();
   await view.getByRole('button',{name:'聊天管理',exact:true}).click();await view.locator('.miao-owner-row').first().click();await checkLayout('.miao-chat-row','chats');assert.ok(await page.evaluate(()=>window.preview.layoutRefreshes)>=2);
   await view.locator('.miao-chat-row').first().click();await page.waitForFunction(()=>!document.querySelector('.miao-binding-selection'));assert.equal(await view.locator('.miao-binding-pages').count(),0);
   assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>window.preview.calls.length),0);await page.close();
  }
 }finally{await browser?.close();server.kill();}
});
