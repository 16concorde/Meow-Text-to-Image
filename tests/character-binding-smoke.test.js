import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {mkdir} from 'node:fs/promises';
const require=createRequire(import.meta.url);
test('actual binding UI, D0, chat switches and complete ungenerated history on desktop and 390px TT', {timeout:120000},async()=>{
 let runtime;try{runtime=require('playwright');}catch{runtime=require(process.env.MIAO_PLAYWRIGHT_MODULE||`${homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`);}
 const server=spawn(process.execPath,['tests/preview-server.mjs'],{env:{...process.env,MIAO_PREVIEW_PORT:'0'},stdio:['ignore','pipe','pipe']});let browser;
 try{
  const url=await new Promise((resolve,reject)=>{let stderr='';const timer=setTimeout(()=>reject(Error(stderr||'preview timeout')),10000);server.stderr.on('data',d=>stderr+=d);server.stdout.on('data',d=>{const m=String(d).match(/http:\/\/[^\s]+/);if(m){clearTimeout(timer);resolve(m[0]);}});server.on('exit',()=>{clearTimeout(timer);reject(Error(stderr));});});
  browser=await runtime.chromium.launch({channel:process.env.MIAO_BROWSER_CHANNEL||'chrome',headless:true});
  for(const mobile of [false,true]){
   const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1280,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(()=>window.addEventListener('unhandledrejection',e=>(window.bindingRejections??=[]).push(String(e.reason))));
   await page.route('**/thumbnail?**',route=>route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=','base64')}));
   await page.route('**/fixture-nai.zip',route=>route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=','base64')}));
   await page.goto(url+'/?settings-smoke'+(mobile?'&tt':''));await page.locator('#miao-nai-menu').waitFor();
   await page.evaluate(async()=>{
    const p=window.preview,c=p.context;c.characterId=0;c.characters=[{avatar:'fixture-card.png',name:'Fixture Card'}];c.name1='Fixture User';c.chatMetadata={integrity:'fixture-binding-chat'};c.saveMetadataDebounced=()=>{};c.powerUserSettings.personas={'fixture-persona.png':'Fixture User'};c.powerUserSettings.persona_descriptions={'fixture-persona.png':{title:'Fixture Remark'}};c.getThumbnailUrl=(type,file)=>'/thumbnail?type='+type+'&file='+encodeURIComponent(file);c.saveChat=async()=>{if(p.failChatSave)throw Error('mock save failed');(p.bindingDiskChats??={})[JSON.stringify([c.characters[c.characterId].avatar,p.chatId])]=structuredClone([{chat_metadata:c.chatMetadata},...p.chat]);};c.saveMetadata=async()=>{p.metadataSaves=(p.metadataSaves||0)+1;await c.saveChat();return true;};await c.saveChat();
    const personas=await import('/scripts/personas.js');personas.setAvatar('fixture-persona.png');await p.emit('PERSONA_CHANGED');
   });
   await page.locator('#miao-nai-menu').click();
   const go=async label=>{if(mobile){while(await page.locator('.miao-settings').getAttribute('data-section')!=='overview'){await page.locator('.miao-drawer-back').click();await page.waitForTimeout(10);}await page.locator(`.miao-overview-row[aria-label="${label}"]`).click();}else await page.locator('.miao-tabs').getByRole('button',{name:label,exact:true}).click();};
   const view=page.locator('.miao-character-bindings'),button=label=>(label==='角色管理'?view:page).getByRole('button',{name:label,exact:true});
   await go('生成');await page.locator('input[type=password]').fill('fixture-character-binding-key-not-real');await page.locator('.miao-settings').evaluate(n=>n.flush());await page.waitForFunction(()=>window.preview.settings.keyHash?.length===64);
   const home=async()=>{while(!await button('角色管理').isVisible()){const history=await view.evaluate(n=>n.diagnostics().history);assert.ok(history>0,'返回管理首页时仍在绑定页内部');await page.locator('.miao-drawer-back').click();await page.waitForFunction(history=>document.querySelector('.miao-character-bindings')?.diagnostics().history<history,history);}await button('角色管理').waitFor({state:'visible'});};
   const manage=async type=>{await home();await button(type==='card'?'角色管理':'用户设定管理').click();await view.locator('.miao-owner-row').first().click();await view.getByRole('button',{name:'添加绑定角色',exact:true}).waitFor();};
   await go('角色管理');await manage('card');
   await button('添加绑定角色').click();await view.getByRole('textbox',{name:'固定正面',exact:true}).fill('DISCARDED DRAFT');await button('放弃新增').click();assert.ok(!(await page.evaluate(()=>JSON.stringify(window.preview.settings))).includes('DISCARDED DRAFT'));
   for(const [title,name,positive,negative] of [['角色卡绑定','Card Hero','boy, silver hair, blue eyes','black hair'],['用户设定绑定','User Hero','boy, black hair, red eyes','blonde hair']]){
    await manage(title==='角色卡绑定'?'card':'user');await button('添加绑定角色').click();await view.getByRole('textbox',{name:'角色名',exact:true}).fill(name);await view.getByRole('textbox',{name:'别名',exact:true}).fill(name+' Alias');await view.getByRole('textbox',{name:'固定正面',exact:true}).fill(positive);await view.getByRole('textbox',{name:'固定负面',exact:true}).fill(negative);await button('创建角色').click();await view.locator('.miao-binding-editor').waitFor({state:'detached'});
   }
   assert.ok(!(await page.evaluate(()=>JSON.stringify(window.preview.settings))).includes('silver hair'));
   assert.equal(await view.evaluate(n=>n.scrollWidth<=n.clientWidth+1),true);
   await page.locator('.miao-panel-body').evaluate(n=>n.scrollTop=0);
   await mkdir('docs/local',{recursive:true});await page.screenshot({path:`docs/local/character-bindings-${mobile?'mobile':'desktop'}.png`});
   await home();await button('聊天管理').click();await view.getByRole('switch',{name:'聊天启用C01',exact:true}).uncheck();await view.getByText('此聊天开关已保存并读回确认',{exact:true}).waitFor();assert.equal(await view.getByRole('switch',{name:'聊天启用C01',exact:true}).isChecked(),false);
   await button('恢复全局 C01 Card Hero').click();await page.waitForFunction(()=>Object.values(window.preview.vibeFiles).some(file=>file.schemaVersion===1&&file.chatId&&Object.values(file.values||{}).includes('inherit')));
   await go('提示词');await button('展开通用 Tag 规范及补充').click();await page.getByRole('radio',{name:'选择管理角色样貌 Tag',exact:true}).check();
   await page.waitForFunction(()=>window.preview.injections.miao_nai_image_instruction.text.includes('C01 = Card Hero'));
   const injection=await page.evaluate(()=>window.preview.injections.miao_nai_image_instruction.text);assert.ok(injection.includes('U01 = User Hero'));assert.ok(!injection.includes('silver hair'));assert.ok(!injection.includes('blonde hair'));
   await page.locator('.miao-drawer-close').click();await page.locator('.miao-settings').waitFor({state:'detached'});
   await page.evaluate(async()=>{
    const p=window.preview;p.settings.mode='manual';p.settings.profiles[p.settings.active].imageSizeMode='ai';p.settings.cloudQueue=false;p.chat.splice(0);await p.emit('GENERATION_STARTED','normal');await p.emit('GENERATION_AFTER_COMMANDS','normal');
    p.chat.unshift({name:'Loaded History',mes:'image###scene | C01, old history###',swipe_id:0});
    p.chat.push({name:'Fixture',mes:'image###\n@orientation: landscape\n3boys, cafe | U01, smiling | C01, white shirt | boy, brown hair',swipe_id:0});
    const mes=document.createElement('div');mes.className='mes';mes.setAttribute('mesid',String(p.chat.length-1));const body=document.createElement('div');body.className='mes_text';body.textContent=p.chat.at(-1).mes;mes.append(body);document.querySelector('#chat').replaceChildren(mes);await p.emit('MESSAGE_UPDATED',0);
   });
   assert.equal(await page.evaluate(()=>window.preview.chat.at(-1).miaoCharacterSnapshots),undefined);
   await page.evaluate(async()=>{const p=window.preview;p.chat.at(-1).mes+='###';document.querySelector('.mes_text').textContent=p.chat.at(-1).mes;await p.emit('MESSAGE_RECEIVED',0);});
   await page.waitForFunction(()=>Object.keys(window.preview.chat.at(-1).miaoCharacterSnapshots||{}).length===1);await page.evaluate(()=>window.preview.emit('GENERATION_ENDED'));
   assert.equal(await page.evaluate(()=>window.preview.calls.length),0);
   assert.equal(await page.evaluate(()=>window.preview.chat[0].miaoCharacterSnapshots),undefined);
   const snapshot=await page.evaluate(()=>structuredClone(window.preview.chat.at(-1).miaoCharacterSnapshots));
   await button('生成插图').click();await page.waitForFunction(()=>window.preview.calls.length===1);await page.locator('.miao-image-card img').waitFor();
   const payload=await page.evaluate(()=>window.preview.calls[0]);assert.equal(payload.parameters.width,1216);assert.equal(payload.parameters.height,832);assert.equal(payload.input.includes('@orientation'),false);assert.deepEqual(payload.parameters.characterPrompts.map(c=>c.uc),['blonde hair','black hair','']);assert.equal(payload.parameters.characterPrompts[1].prompt,'boy, silver hair, blue eyes, white shirt');assert.ok(!payload.input.includes('silver hair'));assert.deepEqual(await page.evaluate(()=>window.preview.chat.at(-1).miaoCharacterSnapshots),snapshot);
   await page.locator('#miao-nai-menu').click();await go('角色管理');await manage('card');await button('编辑 C01 Card Hero').click();await view.getByRole('textbox',{name:'固定正面',exact:true}).fill('boy, CHANGED APPEARANCE');await view.getByRole('textbox',{name:'固定负面',exact:true}).fill('LATEST CARD UC');await button('完成编辑').click();await view.locator('.miao-binding-editor').waitFor({state:'detached'});await page.locator('.miao-drawer-close').click();await page.locator('.miao-settings').waitFor({state:'detached'});
   await page.evaluate(()=>Object.assign(window.preview.settings.profiles[window.preview.settings.active],{width:640,scale:8,seed:555,positive:'CHANGED GLOBAL'}));
   await page.locator('.miao-image-card img').dblclick();await page.waitForFunction(()=>window.preview.calls.length===2);
   const fixedPayload=await page.evaluate(()=>window.preview.calls[1]);
   assert.equal(fixedPayload.parameters.seed,555);
   const updated=structuredClone(payload);updated.parameters.characterPrompts[1].prompt='boy, CHANGED APPEARANCE, white shirt';updated.parameters.characterPrompts[1].uc='LATEST CARD UC';updated.parameters.v4_prompt.caption.char_captions[1].char_caption='boy, CHANGED APPEARANCE, white shirt';updated.parameters.v4_negative_prompt.caption.char_captions[1].char_caption='LATEST CARD UC';
   assert.deepEqual({...fixedPayload,parameters:{...fixedPayload.parameters,seed:payload.parameters.seed}},updated);
   assert.deepEqual(await page.evaluate(()=>window.preview.calls[0]),payload);assert.deepEqual(await page.evaluate(()=>window.preview.chat.at(-1).miaoCharacterSnapshots),snapshot);assert.equal(await button('重新关联绑定').count(),0);
   await page.waitForFunction(()=>document.querySelector('.miao-version-count')?.textContent==='2 / 2');
   // Keep consecutive user rerolls outside the existing 900ms gesture guard.
   await page.waitForTimeout(950);
   await page.evaluate(()=>{window.preview.settings.profiles[window.preview.settings.active].seed=-1;});
   await page.locator('.miao-image-card img').dblclick();await page.waitForFunction(()=>window.preview.calls.length===3);
   const randomPayload=await page.evaluate(()=>window.preview.calls[2]);
   assert.notEqual(randomPayload.parameters.seed,555);
   assert.deepEqual({...randomPayload,parameters:{...randomPayload.parameters,seed:payload.parameters.seed}},updated);
   await page.waitForFunction(()=>document.querySelector('.miao-version-count')?.textContent==='3 / 3');
   // Both automatic paths must persist the binding snapshot before a single POST.
   for(const mode of ['auto','stream']){
    const expected=mode==='auto'?4:5;
    await page.evaluate(async mode=>{
     const p=window.preview;p.settings.mode=mode;p.chat.splice(0);p.chatId='binding-'+mode;p.context.chatMetadata={integrity:'fixture-'+mode};await p.context.saveChat();await p.emit('CHAT_CHANGED');await p.emit('GENERATION_STARTED','normal');await p.emit('GENERATION_AFTER_COMMANDS','normal');
     p.chat.push({name:'Automatic Fixture',mes:'image###1boy, cafe | U01, smiling'+(mode==='auto'?'###':''),swipe_id:0});
     const mes=document.createElement('div');mes.className='mes';mes.setAttribute('mesid','0');const body=document.createElement('div');body.className='mes_text';body.textContent=p.chat.at(-1).mes;mes.append(body);document.querySelector('#chat').replaceChildren(mes);
     await p.emit(mode==='auto'?'GENERATION_ENDED':'STREAM_TOKEN_RECEIVED');
    },mode);
    if(mode==='stream'){
     assert.equal(await page.evaluate(()=>window.preview.calls.length),4);
     await page.evaluate(async()=>{const p=window.preview;p.chat.at(-1).mes+='###';document.querySelector('.mes_text').textContent=p.chat.at(-1).mes;await p.emit('STREAM_TOKEN_RECEIVED');});
    }
    await page.waitForFunction(expected=>window.preview.calls.length===expected,expected);
    await page.waitForFunction(()=>Object.values(window.preview.chat.at(-1).miao_nai_image_swipes?.[0]||{}).some(r=>!!r.url));
    if(mode==='stream')assert.equal(await page.locator('.miao-image-card img').count(),0);
    assert.equal(await page.evaluate(()=>Object.keys(window.preview.chat.at(-1).miaoCharacterSnapshots||{}).length),1);
    assert.deepEqual(await page.evaluate(()=>window.preview.calls.at(-1).parameters.characterPrompts.map(c=>({prompt:c.prompt,uc:c.uc}))),[{prompt:'boy, black hair, red eyes, smiling',uc:'blonde hair'}]);
    await page.evaluate(()=>window.preview.emit('GENERATION_ENDED'));await page.locator('.miao-image-card img').waitFor();assert.equal(await page.evaluate(()=>window.preview.calls.length),expected);
   }
   if(mobile){assert.equal(await page.locator('.miao-image-card').evaluate(n=>n.scrollWidth<=n.clientWidth+1),true);}
   assert.deepEqual(errors,[]);assert.deepEqual(await page.evaluate(()=>window.bindingRejections||[]),[]);await page.close();
  }
 }finally{await browser?.close();server.kill();}
});
