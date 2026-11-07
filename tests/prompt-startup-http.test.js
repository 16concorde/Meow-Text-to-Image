import {revision4Settings} from './support/revision4-settings.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {defaultTreeSettings,migrateTreeSettings} from '../src/prompts/tree-settings.js';
const require=createRequire(import.meta.url);
async function runtime(){try{return require('playwright');}catch{return require(process.env.MIAO_PLAYWRIGHT_MODULE||`${homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`);}}
test('actual entry waits without blocking module load, then persists once across three server-backed boots',{timeout:90000},async()=>{
 const {chromium}=await runtime();const server=spawn(process.execPath,['tests/preview-server.mjs'],{env:{...process.env,MIAO_PREVIEW_PORT:'0'},stdio:['ignore','pipe','pipe']});let browser;
 try{
 const url=await new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(Error(output||'server timeout')),10000);server.stderr.on('data',d=>output+=d);server.stdout.on('data',d=>{const match=String(d).match(/http:\/\/[^\s]+/);if(match){clearTimeout(timer);resolve(match[0]);}});server.on('exit',()=>{clearTimeout(timer);reject(Error(output));});});
 const control=async(id,data)=>{const res=await fetch(url+'/fixture-settings/'+id,data?{method:'POST',body:JSON.stringify(data)}:{});return res.json();};
 browser=await chromium.launch({channel:process.env.MIAO_BROWSER_CHANNEL||'chrome',headless:true});
 const old=revision4Settings();old.treeRevision=3;old.params.count='3';old.textOverridesById={composition:{body:'SERVER_BODY'},selfcheck:{prefix:'CUSTOM\n<imgthink>',suffix:'</imgthink>\nEND'}};old.enabledById.nsfw=true;old.nsfwTrigger.keywords=['SYNTHETIC'];old.orientation='GL';
 const expected=migrateTreeSettings(old);
 await control('cycles',{settings:{extension_settings:{miao_nai_image:{promptConfig:old}}},reset:true});
 const errors=[];
 const open=async id=>{const context=await browser.newContext();const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(url+'/?settings-http='+id);await page.waitForFunction(()=>window.preview?.moduleLoaded);return {page,context};};
 for(let cycle=0;cycle<3;cycle++){
  const {page,context}=await open('cycles');
  assert.equal(await page.evaluate(()=>window.preview.saveCalls||0),0);assert.equal(await page.locator('#miao-nai-menu').count(),0);
  await page.evaluate(()=>window.preview.completeSettings());await page.locator('#miao-nai-menu').waitFor();
  await page.waitForFunction(()=>window.preview.injections?.miao_nai_image_instruction?.text.includes('SERVER_BODY'));
  if(cycle>0)assert.equal(await page.evaluate(()=>window.preview.saveCalls||0),0);
  if(cycle===0)assert.deepEqual((await control('cycles')).settings.extension_settings.miao_nai_image.promptConfig,expected);
  if(cycle===1){
   await page.locator('#miao-nai-menu').click();await page.locator('.miao-tabs').getByRole('button',{name:'提示词',exact:true}).click();await page.getByRole('button',{name:'编辑画面组成',exact:true}).click();
   const editor=page.locator('.miao-prompt-editor');await editor.getByRole('textbox').fill('SERVER_BODY_EDITED');await editor.getByRole('button',{name:'完成',exact:true}).click();await editor.waitFor({state:'detached'});
  }
  if(cycle===2)assert.ok(await page.evaluate(()=>window.preview.injections.miao_nai_image_instruction.text.includes('SERVER_BODY_EDITED')));
  await context.close();
 }
 assert.deepEqual(errors,[]);
 // Genuine HTTP faults; the host catches these instead of returning false.
 for(const [id,options,written] of [['403',{status:403},false],['500',{status:500},false],['no-write',{noWrite:true},false],['lost-before',{disconnect:'before'},false],['lost-after',{disconnect:'after'},true],['get-500',{getStatus:500},false],['get-json',{badJSON:true},false],['get-delayed',{readDelay:800},true],['save-delayed',{delay:800},true]]){
  await control(id,{settings:{extension_settings:{miao_nai_image:{promptConfig:old}}},options,reset:true});
  const {page,context}=await open(id);await page.evaluate(()=>window.preview.completeSettings());await page.locator('#miao-nai-menu').waitFor();
  await page.waitForFunction(()=>window.preview.saveCalls>0);
  if(written)await page.waitForFunction(()=>window.preview.settings.promptConfig.treeRevision===5);
  else{
   await page.waitForFunction(()=>window.miaoTestToasts.some(t=>t.message.includes('尚未确认')),{},{timeout:40000});
   assert.equal(await page.evaluate(()=>window.preview.settings.promptConfig.treeRevision),3);
   assert.deepEqual((await control(id)).settings.extension_settings.miao_nai_image.promptConfig,id.startsWith('get-')?expected:old);
   if(options.status||options.disconnect)assert.ok(await page.evaluate(()=>window.miaoTestToasts.some(t=>t.message==='宿主设置保存出错')));
   await control(id,{options:{}});
   // A late successful debounced save confirms the owned dirty candidate.
   await page.evaluate(async()=>{const host=await import('/script.js');await host.saveSettings();});
   await page.waitForFunction(()=>window.preview.settings.promptConfig.treeRevision===5);
  }
  assert.deepEqual((await control(id)).settings.extension_settings.miao_nai_image.promptConfig,expected);
  await context.close();
  // A fresh JS and browser context must derive only from the independent server store.
  await control(id,{options:{}});
  const restarted=await open(id);await restarted.page.evaluate(()=>window.preview.completeSettings());
  await restarted.page.waitForFunction(()=>window.preview.injections?.miao_nai_image_instruction?.text.includes('SERVER_BODY'));
  assert.equal(await restarted.page.evaluate(()=>window.preview.saveCalls||0),0);await restarted.context.close();
 }
 // Failed first boot closes without retry: next context retains the original source and migrates once.
 await control('failed-restart',{settings:{extension_settings:{miao_nai_image:{promptConfig:old}}},options:{status:500},reset:true});
 const failed=await open('failed-restart');await failed.page.evaluate(()=>window.preview.completeSettings());await failed.page.waitForFunction(()=>window.miaoTestToasts.some(t=>t.message.includes('尚未确认')));await failed.context.close();
 assert.deepEqual((await control('failed-restart')).settings.extension_settings.miao_nai_image.promptConfig,old);await control('failed-restart',{options:{}});
 const recovered=await open('failed-restart');await recovered.page.evaluate(()=>window.preview.completeSettings());await recovered.page.waitForFunction(()=>window.preview.settings.promptConfig.treeRevision===5);assert.deepEqual((await control('failed-restart')).settings.extension_settings.miao_nai_image.promptConfig,expected);await recovered.context.close();
 // Ready host still queues a temporary response-length override. The eventual payload must retain the candidate.
 await control('queued',{settings:{extension_settings:{miao_nai_image:{promptConfig:old}}},reset:true});
 const queued=await open('queued');await queued.page.evaluate(()=>{window.preview.temporaryOverride=true;void window.preview.completeSettings();});
 await queued.page.waitForFunction(()=>window.preview.saveCalls>0);assert.equal((await control('queued')).saves.length,0);
 await queued.page.evaluate(()=>window.preview.temporaryOverride=false);await queued.page.waitForFunction(()=>window.preview.settings.promptConfig.treeRevision===5);assert.deepEqual((await control('queued')).settings.extension_settings.miao_nai_image.promptConfig,expected);assert.equal(await queued.page.evaluate(()=>window.preview.calls.length),0);await queued.context.close();
 assert.deepEqual(errors,[]);
 }finally{await browser?.close();server.kill();}
});
