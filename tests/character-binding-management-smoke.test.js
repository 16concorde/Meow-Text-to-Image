import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {mkdir,writeFile,access} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
test('management routes, bounded native selectors, drafts and ST/TT chat scope across mobile widths',{timeout:180000},async()=>{
 let runtime;try{runtime=require('playwright');}catch{runtime=require(process.env.MIAO_PLAYWRIGHT_MODULE||`${homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`);}
 const hostRoot=process.env.MIAO_ST_ROOT||fileURLToPath(new URL('../../../../../',import.meta.url));await access(hostRoot+'/public/css/fontawesome.min.css').catch(()=>{throw Error('需要宿主样式与字体，请设置 MIAO_ST_ROOT 指向 SillyTavern');});
 const server=spawn(process.execPath,['tests/preview-server.mjs'],{env:{...process.env,MIAO_ST_ROOT:hostRoot,MIAO_PREVIEW_PORT:'0'},stdio:['ignore','pipe','pipe']});let browser;
 try{
  const url=await new Promise((resolve,reject)=>{let error='';const timer=setTimeout(()=>reject(Error(error||'preview startup timeout')),10000);server.stderr.on('data',d=>error+=d);server.stdout.on('data',d=>{const match=String(d).match(/http:\/\/[^\s]+/);if(match){clearTimeout(timer);resolve(match[0]);}});server.on('exit',()=>{clearTimeout(timer);reject(Error(error));});});
  browser=await runtime.chromium.launch({channel:process.env.MIAO_BROWSER_CHANNEL||'chrome',headless:true});const metrics=[];
  for(const [width,height] of [[1280,900],[1440,900],[320,740],[360,800],[390,844],[430,900],[844,390]]){
   const mobile=width<700||height<500,page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(()=>{window.addEventListener('unhandledrejection',e=>(window.managementRejections??=[]).push(String(e.reason)));window.managementLongTasks=[];if(PerformanceObserver.supportedEntryTypes?.includes('longtask'))new PerformanceObserver(list=>{for(const e of list.getEntries())window.managementLongTasks.push({start:e.startTime,duration:e.duration});}).observe({type:'longtask'});});
   await page.route('**/thumbnail?**',route=>route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=','base64')}));
   await page.goto(url+'/?settings-smoke&host-css=st'+(mobile?'&tt':''));await page.locator('#miao-nai-menu').waitFor();
   await page.evaluate(async mobile=>{
    const p=window.preview,c=p.context;
    c.characters=Array.from({length:1000},(_,i)=>({avatar:`management-${i}.png`,description:'Synthetic card description '+i,name:i===0?'Current Card':i===1||i===3?'剑抵山河':i===2?'角色a&角色b':'角色卡 '+i,data:{extensions:{}}}));c.characterId=0;c.chatMetadata={integrity:'current-integrity'};
    c.powerUserSettings.personas=Object.fromEntries(Array.from({length:300},(_,i)=>[`user-${i}.png`,i<2?'Traveler':'User '+i]));c.powerUserSettings.persona_descriptions={'user-0.png':{title:'旅行者备注 '.repeat(20),description:'有界描述 '.repeat(20)}};c.getThumbnailUrl=(type,file)=>'/thumbnail?type='+type+'&file='+encodeURIComponent(file);
    const personas=await import('/scripts/personas.js');personas.setAvatar('user-0.png');
    c.saveChat=async()=>{(p.bindingDiskChats??={})[JSON.stringify([c.characters[c.characterId].avatar,p.chatId])]=structuredClone([{chat_metadata:c.chatMetadata},...p.chat]);};c.saveMetadataDebounced=()=>{};c.saveMetadata=c.saveChat;
    c.selectCharacterById=async id=>{c.characterId=id;};c.openCharacterChat=async file=>{p.chatId=file;const data=p.bindingDiskChats[JSON.stringify([c.characters[c.characterId].avatar,file])];c.chatMetadata=structuredClone(data[0].chat_metadata);p.chat.splice(0,p.chat.length,...structuredClone(data.slice(1)));if(c.chatMetadata.persona)personas.setAvatar(c.chatMetadata.persona);await p.emit('CHAT_CHANGED');};await c.saveChat();
    p.bindingDiskChats[JSON.stringify(['management-1.png','聊天 X'])]=[{chat_metadata:{integrity:'chat-x',persona:'user-1.png',unrelated:{keep:true}}}];p.bindingDiskChats[JSON.stringify(['management-1.png','聊天 Y'])]=[{chat_metadata:{integrity:'chat-y'}}];
    if(mobile){window.__TAURITAVERN__.api??={};window.__TAURITAVERN__.api.chat={open(ref){const key=JSON.stringify([ref.characterId+'.png',ref.fileName]);return {metadata:{get:async()=>structuredClone(p.bindingDiskChats[key][0].chat_metadata),setExtension:async({namespace,value})=>{const meta=p.bindingDiskChats[key][0].chat_metadata;meta.extensions??={};meta.extensions[namespace]=structuredClone(value);p.directedMetadataSaves=(p.directedMetadataSaves||0)+1;}}};}};}
    p.managementRequests=[];p.beforeRequest=async(url,options)=>{if(String(url).startsWith('/user/files/')||String(url).startsWith('/api/characters/')||url==='/api/chats/get')p.managementRequests.push({url,body:options?.body?JSON.parse(options.body):null});};await p.emit('PERSONA_CHANGED');
    p.settings.promptConfig.tagMode='binding';await (await import('/script.js')).saveSettings();await p.emit('GENERATION_AFTER_COMMANDS','normal');p.managementRequests=[];
   },mobile);
   await page.evaluate(()=>{window.managementNativeBack=window.__TAURITAVERN_HANDLE_BACK__;window.managementLongTasks=[];});
   await page.locator('#miao-nai-menu').click();const view=page.locator('.miao-character-bindings'),button=name=>(name==='角色管理'?view:page).getByRole('button',{name,exact:true});
   if(mobile){if(await page.locator('.miao-settings').getAttribute('data-section')!=='overview')await page.locator('.miao-drawer-back').click();await page.locator('.miao-overview-row[aria-label="角色管理"]').click();}else await page.locator('.miao-tabs').getByRole('button',{name:'角色管理',exact:true}).click();
   await button('角色管理').waitFor();assert.equal(await view.getByRole('button',{name:'数据管理／资料包',exact:true}).count(),0);
   const before=await page.evaluate(()=>window.preview.injections.miao_nai_image_instruction.text),start=Date.now();await button('角色管理').click();await view.locator('.miao-owner-row').first().waitFor();await page.evaluate(()=>document.fonts.ready);assert.equal(await view.locator('.fa-rotate-right').evaluate(n=>getComputedStyle(n,'::before').content!=='none'),true);const firstMs=Date.now()-start;
   assert.equal(await view.locator('.miao-owner-row').count(),10);assert.equal(await view.locator('img').count(),10);assert.equal(await page.evaluate(()=>window.preview.managementRequests.filter(r=>r.url.startsWith('/user/files/')||r.url==='/api/files/upload').length),0);await view.getByRole('button',{name:'刷新列表',exact:true}).click();assert.equal(await page.evaluate(()=>window.preview.managementRequests.filter(r=>r.url.startsWith('/user/files/')||r.url==='/api/files/upload').length),0);await mkdir('docs/local',{recursive:true});await page.screenshot({path:`docs/local/binding-management-selector-${width}x${height}.png`});assert.equal(await page.evaluate(()=>window.preview.managementRequests.filter(r=>r.url==='/api/chats/get').length),0);
   if(width===1280){
    await page.evaluate(()=>window.preview.paginationCards=window.preview.context.characters);
    for(const count of [0,1,10,11,20,21]){
     await page.evaluate(count=>window.preview.context.characters=window.preview.paginationCards.slice(0,count),count);await button('刷新列表').click();assert.equal(await view.locator('.miao-owner-row').count(),Math.min(10,count));assert.equal(await button('上一页').isDisabled(),true);assert.equal(await button('下一页').isDisabled(),count<=10);
     if(count>10){await button('下一页').click();assert.equal(await view.locator('.miao-owner-row').count(),Math.min(10,count-10));if(count>20){await button('下一页').click();assert.equal(await view.locator('.miao-owner-row').count(),1);}assert.equal(await button('下一页').isDisabled(),true);}
     // Returning to the first page is an explicit navigation, refresh itself retains its page.
     while(!await button('上一页').isDisabled())await button('上一页').click();
    }
    await page.evaluate(()=>{window.preview.context.characters=window.preview.paginationCards;delete window.preview.paginationCards;});await button('刷新列表').click();
   }
   const query=view.getByRole('searchbox',{name:'搜索所属对象',exact:true});await query.fill('角色b');await view.getByText('找到 1 个对象',{exact:true}).waitFor();assert.equal(await view.locator('.miao-owner-row').count(),1);
   await query.fill('剑抵山河');await view.getByText('找到 2 个对象',{exact:true}).waitFor();await view.locator('.miao-owner-row[data-native-locator="management-1.png"]').click();await button('添加绑定角色').click();
   await view.getByRole('textbox',{name:'角色名',exact:true}).fill('角色A');await view.getByRole('textbox',{name:'别名',exact:true}).fill('HeroAlias');await view.getByRole('textbox',{name:'固定正面',exact:true}).fill('boy, fixture appearance');await view.getByRole('textbox',{name:'固定负面',exact:true}).fill('fixture negative');await button('创建角色').click();await view.locator('textarea').first().waitFor({state:'detached'});
   assert.equal(await page.evaluate(()=>window.preview.context.characterId),0);assert.equal(await page.evaluate(()=>window.preview.injections.miao_nai_image_instruction.text),before);
   // Default auto-save must leave an unrelated form draft and its focus intact.
   await button('编辑 C01 角色A').click();const nameField=view.getByRole('textbox',{name:'角色名',exact:true});await nameField.fill('Unsaved isolated form');
   await view.getByRole('switch',{name:'默认启用C01',exact:true}).uncheck();await view.getByText('已保存并读回确认',{exact:true}).waitFor();assert.equal(await nameField.inputValue(),'Unsaved isolated form');
   await nameField.fill('角色A');await button('完成编辑').click();assert.equal(await view.getByRole('switch',{name:'默认启用C01',exact:true}).isChecked(),false);
   await view.getByRole('switch',{name:'默认启用C01',exact:true}).check();await view.getByText('已保存并读回确认',{exact:true}).waitFor();
   assert.equal(await view.getByRole('button',{name:/删除/}).count(),0);

   await page.locator('.miao-drawer-back').click();assert.equal(await query.inputValue(),'剑抵山河');await view.getByText('找到 2 个对象',{exact:true}).waitFor();const requests=await page.evaluate(()=>window.preview.managementRequests.length);await query.fill('HEROALIAS');await view.getByText('搜索没有结果',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.preview.managementRequests.length),requests);await query.fill('剑抵山河');await view.getByText('找到 2 个对象',{exact:true}).waitFor();
   await view.locator('.miao-owner-row[data-native-locator="management-1.png"]').click();await button('添加绑定角色').click();await view.getByRole('textbox',{name:'角色名',exact:true}).fill('Retained Draft');await page.locator('.miao-drawer-back').click();await button('继续编辑').click();assert.equal(await view.getByRole('textbox',{name:'角色名',exact:true}).inputValue(),'Retained Draft');await button('放弃新增').click();
   if(width===1280){
    // Known failure rolls back the visible switch, preserving the exact retry intent.
    await page.evaluate(()=>{const p=window.preview,previous=p.beforeRequest;p.beforeRequest=async(url,options)=>{await previous?.(url,options);if(p.failOwnerWrite&&url==='/api/files/upload')throw Error('fixture owner upload failed');};p.failOwnerWrite=true;});
    await view.getByRole('switch',{name:'默认启用C01',exact:true}).uncheck();await button('重试保存').waitFor();assert.equal(await view.getByRole('switch',{name:'默认启用C01',exact:true}).isChecked(),true);
    await mkdir('docs/local',{recursive:true});await page.screenshot({path:'docs/local/binding-save-failure.png'});await page.evaluate(()=>window.preview.failOwnerWrite=false);await button('重试保存').click();await view.getByText('已保存并读回确认',{exact:true}).waitFor();assert.equal(await view.getByRole('switch',{name:'默认启用C01',exact:true}).isChecked(),false);
    await view.getByRole('switch',{name:'默认启用C01',exact:true}).check();await view.getByText('已保存并读回确认',{exact:true}).waitFor();
    // Upload commits but its read-back is interrupted: verify first, without creating another revision.
    await page.evaluate(()=>{const p=window.preview,previous=p.beforeRequest;p.beforeRequest=async(url,options)=>{await previous?.(url,options);if(p.unknownOwner&&url==='/api/files/upload'){const body=JSON.parse(options.body);if(/^miao-character-card-v2-/.test(body.name))p.unknownPath='/user/files/'+body.name;}if(p.unknownOwner&&url===p.unknownPath)throw Error('fixture readback interrupted');};p.unknownOwner=true;});
    await view.getByRole('switch',{name:'默认启用C01',exact:true}).uncheck();await button('查证保存结果').waitFor();const revision=await page.evaluate(()=>window.preview.vibeFiles[window.preview.unknownPath].revision);await page.screenshot({path:'docs/local/binding-save-unknown.png'});await page.evaluate(()=>window.preview.unknownOwner=false);await button('查证保存结果').click();await view.getByText('已保存并读回确认',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.preview.vibeFiles[window.preview.unknownPath].revision),revision);assert.equal(await view.getByRole('switch',{name:'默认启用C01',exact:true}).isChecked(),false);
    await view.getByRole('switch',{name:'默认启用C01',exact:true}).check();await view.getByText('已保存并读回确认',{exact:true}).waitFor();
    await button('编辑 C01 角色A').click();await view.getByRole('textbox',{name:'固定正面',exact:true}).fill('local conflict appearance');
    await page.evaluate(()=>{const p=window.preview,a=p.vibeFiles[p.unknownPath];a.bindings[0].positive='remote conflict appearance';a.revision++;});await view.getByText('保存冲突比较',{exact:true}).waitFor();assert.equal(await view.getByRole('textbox',{name:'固定正面',exact:true}).inputValue(),'local conflict appearance');await page.screenshot({path:'docs/local/binding-owner-conflict.png'});
    await button('以已保存版本为新基线保留草稿').click();await button('完成编辑').click();await view.locator('textarea').first().waitFor({state:'detached'});assert.equal(await page.evaluate(()=>window.preview.vibeFiles[window.preview.unknownPath].bindings[0].positive),'local conflict appearance');
   }
   await button('管理此卡的聊天记录').click();await button('聊天 X').click();await view.getByText('不是当前酒馆所打开的聊天窗口，注意确认',{exact:true}).waitFor();assert.equal(await view.getByRole('switch',{name:'聊天启用C01',exact:true}).isDisabled(),false);assert.equal(await page.evaluate(()=>window.preview.context.characterId),0);await view.getByRole('switch',{name:'聊天启用C01',exact:true}).uncheck();await view.getByText('此聊天开关已保存并读回确认',{exact:true}).waitFor();await button('编辑此卡角色资料').click();await button('添加绑定角色').click();await view.getByRole('textbox',{name:'角色名',exact:true}).fill('New inherited');await view.getByRole('textbox',{name:'固定正面',exact:true}).fill('boy, second fixture');await button('创建角色').click();await view.locator('textarea').first().waitFor({state:'detached'});await page.locator('.miao-drawer-back').click();
   assert.equal(await view.getByRole('switch',{name:'聊天启用C01',exact:true}).isChecked(),false);assert.equal(await view.getByRole('switch',{name:'聊天启用C02',exact:true}).isChecked(),true);
   assert.equal(await page.evaluate(()=>window.preview.context.characterId),0);
   assert.equal(await page.evaluate(()=>window.preview.bindingDiskChats[JSON.stringify(['management-1.png','聊天 X'])][0].chat_metadata.unrelated.keep),true);
   if(width===1280){
    await button('编辑此用户设定').click();await button('添加绑定角色').click();await view.getByRole('textbox',{name:'角色名',exact:true}).fill('Synthetic User');await view.getByRole('textbox',{name:'固定正面',exact:true}).fill('synthetic user appearance');await button('创建角色').click();await view.locator('textarea').first().waitFor({state:'detached'});await page.locator('.miao-drawer-back').click();
    await view.getByRole('switch',{name:'聊天启用U01',exact:true}).waitFor();
    await page.evaluate(()=>{const p=window.preview,data=Object.values(p.vibeFiles).find(v=>v.schemaVersion===1&&v.chatId&&v.values);for(const key of Object.keys(data.values))data.values[key]=true;data.revision++;});
    await view.getByRole('switch',{name:'聊天启用U01',exact:true}).uncheck();await view.getByText('聊天开关冲突比较',{exact:true}).waitFor();assert.equal(await view.getByRole('switch',{name:'聊天启用U01',exact:true}).isChecked(),true);await page.screenshot({path:'docs/local/binding-chat-conflict.png'});await button('读取当前版本并保留开关意图').click();await button('重试／查证保存').click();await view.getByText('此聊天开关已保存并读回确认',{exact:true}).waitFor();assert.equal(await view.getByRole('switch',{name:'聊天启用C01',exact:true}).isChecked(),true);
    await view.getByRole('switch',{name:'聊天启用C01',exact:true}).uncheck();await view.getByText('此聊天开关已保存并读回确认',{exact:true}).waitFor();

    const defaults=()=>page.evaluate(()=>Object.fromEntries(Object.values(window.preview.vibeFiles).filter(v=>v.schemaVersion===2&&v.owner&&v.bindings).map(v=>[v.owner.type,v.bindings.map(b=>b.defaultEnabled)])));
    const beforeGlobal=await defaults();page.once('dialog',d=>d.accept());await button('将此开关设置至剑抵山河全局').click();await view.getByText('此聊天开关已保存并读回确认',{exact:true}).waitFor();const afterCardGlobal=await defaults();assert.equal(afterCardGlobal.card[0],false);assert.deepEqual(afterCardGlobal.user,beforeGlobal.user);
    page.once('dialog',d=>d.accept());await button('将此开关设置至Traveler全局').click();await view.getByText('此聊天开关已保存并读回确认',{exact:true}).waitFor();const afterUserGlobal=await defaults();assert.deepEqual(afterUserGlobal.card,afterCardGlobal.card);assert.equal(afterUserGlobal.user[0],false);
    await button('全部恢复全局').click();await view.getByText('此聊天开关已保存并读回确认',{exact:true}).waitFor();assert.deepEqual(await page.evaluate(()=>Object.values(Object.values(window.preview.vibeFiles).find(v=>v.schemaVersion===1&&v.chatId&&v.values).values)),['inherit','inherit','inherit']);
   }
   const diagnostics=await view.evaluate(n=>n.diagnostics()),nodes=await view.locator('*').count();
   for(let i=0;i<20;i++){await button('编辑此卡角色资料').click();await button('添加绑定角色').waitFor();await page.locator('.miao-drawer-back').click();await view.getByRole('switch',{name:'聊天启用C01',exact:true}).waitFor();}
   const after=await view.evaluate(n=>n.diagnostics());assert.equal(after.listeners,diagnostics.listeners);assert.equal(after.history,diagnostics.history);assert.ok(after.cache.bytes<=8*1024*1024);assert.ok(after.cache.entries<=8);assert.ok(await view.locator('*').count()<=nodes+5);
   assert.equal(await view.evaluate(n=>n.scrollWidth<=n.clientWidth+1),true);await mkdir('docs/local',{recursive:true});await page.screenshot({path:`docs/local/binding-management-${width}x${height}.png`});
   if(width===1280){
    await page.evaluate(async()=>{const {editBinding}=await import('/scripts/extensions/third-party/test/src/profiles/character-bindings.js'),p=window.preview,ownerId=p.bindingCards['management-1.png'].data.extensions.meow_t2i.ownerId,path='/user/files/miao-character-card-v2-'+ownerId+'.json';let archive=p.vibeFiles[path];while(archive.bindings.length<100)archive=editBinding(archive,{name:'长名称连续英文LongName'.repeat(5)+' <b>synthetic</b> '+archive.nextSequence,aliases:[],positive:'synthetic appearance',negative:''});for(const b of archive.bindings.slice(-10))archive=editBinding(archive,{archived:true},b.uuid);p.vibeFiles[path]=archive;});
    await button('编辑此卡角色资料').click();await view.locator('.miao-binding-owner').waitFor();await view.locator('summary').waitFor();assert.equal(await view.locator('details').evaluate(n=>n.open),false);assert.equal(await view.locator('.miao-binding-row:visible').count(),90);assert.equal(await view.locator('.miao-binding-viewport').evaluate(n=>n.scrollHeight>n.clientHeight),true);
    for(const theme of ['light','dark','transparent']){
     await page.evaluate(theme=>{const p=document.documentElement;p.style.setProperty('--SmartThemeBlurTintColor',theme==='light'?'#ffffff':theme==='dark'?'#20232a':'rgba(32,35,42,.75)');p.style.setProperty('--SmartThemeBodyColor',theme==='light'?'#172033':'#f4f5f8');p.style.setProperty('--SmartThemeBorderColor',theme==='light'?'#b6bdc9':'#697282');},theme);
     for(const [w,h] of [[1280,900],[1440,900],[320,740],[360,800],[390,844],[430,900],[844,390]]){
      await page.setViewportSize({width:w,height:h});assert.equal(await view.evaluate(n=>n.scrollWidth<=n.clientWidth+1),true);assert.equal(await view.locator('.miao-binding-row-actions').first().evaluate(n=>[...n.querySelectorAll('button,label')].every(el=>{const r=el.getBoundingClientRect();return r.width>=43.5&&r.height>=43.5;})),true);await page.screenshot({path:`docs/local/binding-owner-${theme}-${w}x${h}.png`});
     }
    }
    await page.setViewportSize({width,height});await view.locator('summary').click();assert.equal(await view.locator('.miao-binding-row:visible').count(),100);await page.screenshot({path:'docs/local/binding-owner-archived-expanded.png'});await view.locator('summary').click();await page.locator('.miao-drawer-back').click();await button('编辑此卡角色资料').waitFor();
   }
   if(!mobile){
    await button('编辑此卡角色资料').click();await button('添加绑定角色').click();await view.getByRole('textbox',{name:'角色名',exact:true}).fill('Persistent device draft');await view.getByRole('textbox',{name:'固定正面',exact:true}).fill('boy, local recovery draft');await page.waitForTimeout(500);
    const persisted=await page.evaluate(async()=>{const {createBindingDraftStore}=await import('/scripts/extensions/third-party/test/src/platform/character-binding-drafts.js'),scope=JSON.stringify([location.origin,'miao-preview-user',null]);const store=createBindingDraftStore({scope:()=>scope});const restored=await store.load(),other=await createBindingDraftStore({scope:()=>scope+'other-account'}).load();return {restored:restored.some(([,value])=>value.form?.name==='Persistent device draft'),other:other.length};});assert.equal(persisted.restored,true);assert.equal(persisted.other,0);await button('放弃新增').click();
   }else{
    await button('编辑此卡角色资料').click();await button('添加绑定角色').click();await view.getByRole('textbox',{name:'固定正面',exact:true}).focus();await page.setViewportSize({width,height:420});await button('创建角色').scrollIntoViewIfNeeded();assert.equal(await view.evaluate(n=>n.scrollWidth<=n.clientWidth+1),true);await button('放弃新增').click();await page.setViewportSize({width,height});const depth=await view.evaluate(n=>n.diagnostics().history);assert.equal(await page.evaluate(()=>window.__TAURITAVERN_HANDLE_BACK__()),true);assert.equal(await view.evaluate(n=>n.diagnostics().history),depth-1);
   }
   await view.evaluate(n=>window.managementDisposedDiagnostics=n.diagnostics);await page.locator('.miao-drawer-close').click();await view.waitFor({state:'detached'});if(mobile)await page.waitForFunction(()=>window.__TAURITAVERN_HANDLE_BACK__===window.managementNativeBack);assert.equal(await page.evaluate(()=>window.managementDisposedDiagnostics().listeners),1);await page.evaluate(()=>delete window.managementDisposedDiagnostics);
   assert.equal(await page.evaluate(()=>window.preview.calls.length),0);assert.deepEqual(errors,[]);assert.deepEqual(await page.evaluate(()=>window.managementRejections||[]),[]);const performance=await page.evaluate(()=>({longTasks:window.managementLongTasks,heapBytes:window.performance.memory?.usedJSHeapSize??null,requests:window.preview.managementRequests.length}));metrics.push({width,height,firstMs,rows:10,navigationCycles:20,listeners:after.listeners,cache:after.cache,performance});await page.close();
  }
  await writeFile('docs/local/binding-management-browser-metrics.json',JSON.stringify(metrics,null,2));
 }finally{await browser?.close();server.kill();}
});
