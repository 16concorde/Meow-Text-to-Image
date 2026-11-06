import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {mkdir} from 'node:fs/promises';
const require=createRequire(import.meta.url);
test('native error toasts stay clickable above desktop modal and TT layers without error panels',{timeout:60000},async()=>{
 let runtime;try{runtime=require('playwright');}catch{runtime=require(process.env.MIAO_PLAYWRIGHT_MODULE||`${homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`);}
 const server=spawn(process.execPath,['tests/preview-server.mjs'],{env:{...process.env,MIAO_PREVIEW_PORT:'0'},stdio:['ignore','pipe','pipe']});let browser;
 try{
  const url=await new Promise((resolve,reject)=>{let error='';const timer=setTimeout(()=>reject(Error(error||'preview startup timeout')),10000);server.stderr.on('data',d=>error+=d);server.stdout.on('data',d=>{const match=String(d).match(/http:\/\/[^\s]+/);if(match){clearTimeout(timer);resolve(match[0]);}});});
  browser=await runtime.chromium.launch({channel:process.env.MIAO_BROWSER_CHANNEL||'chrome',headless:true});
  for(const [width,height] of [[1280,900],[390,844],[844,390]]){
   const mobile=width<700||height<500,page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(url+'/?settings-smoke'+(mobile?'&tt':''));await page.locator('#miao-nai-menu').click();
   if(mobile){if(await page.locator('.miao-drawer-back').isVisible())await page.locator('.miao-drawer-back').click();await page.getByRole('button',{name:'生图指令',exact:true}).click();}else await page.locator('.miao-tabs').getByRole('button',{name:'生图指令',exact:true}).click();
   await page.evaluate(()=>{
    const original=toastr.error;toastr.error=(message,title,options)=>{original(message,title,options);const box=document.createElement('button');box.className='toast toast-error';box.style.cssText='display:block;background:#b22;color:white;padding:16px;max-width:280px;white-space:pre-wrap';const body=document.createElement('span');body.className='toast-message';body.textContent=message;box.append(body);box.onclick=()=>box.remove();document.getElementById('toast-container').append(box);return {addClass:name=>box.classList.add(name)};};window.preview.failSettingsSave=true;
   });
   await page.getByRole('combobox',{name:'来源',exact:true}).selectOption('external');const toast=page.locator('#toast-container .toast-error');await toast.waitFor();assert.equal(await page.locator('.miao-error-view').count(),0);
   assert.equal(await page.evaluate(()=>{const t=document.querySelector('.toast-error'),b=t.getBoundingClientRect();return t.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2))&&!t.closest('[inert]');}),true);
   assert.equal(await page.evaluate(()=>typeof window.miaoTestToasts.at(-1).options.onclick),'undefined');await mkdir('docs/local',{recursive:true});await page.screenshot({path:`docs/local/native-toast-${width}x${height}.png`});await toast.click();await toast.waitFor({state:'detached'});assert.equal(await page.locator('.miao-error-view').count(),0);
   await page.evaluate(()=>window.preview.failSettingsSave=false);await page.getByRole('button',{name:'关闭设置',exact:true}).click();assert.equal(await page.locator('.miao-page-overlay').count(),0);assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>window.preview.calls.length),0);await page.close();
  }
 }finally{await browser?.close();server.kill();}
});
