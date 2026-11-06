import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {mkdir} from 'node:fs/promises';
const require=createRequire(import.meta.url);
async function browserRuntime(){
 try{return require('playwright');}catch{}
 const path=process.env.MIAO_PLAYWRIGHT_MODULE||`${homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`;
 try{return require(path);}catch{throw Error('面板冒烟测试需要现有 Playwright；设置 MIAO_PLAYWRIGHT_MODULE 指向其安装目录');}
}
test('actual extension startup, fixed prompt tree, drafts, rollback, modes and narrow editor', {timeout:90000},async()=>{
 const {chromium}=await browserRuntime();
 const server=spawn(process.execPath,['tests/preview-server.mjs'],{env:{...process.env,MIAO_PREVIEW_PORT:'0'},stdio:['ignore','pipe','pipe']});
 let browser;
 try{
 const url=await new Promise((resolve,reject)=>{let stderr='';const timer=setTimeout(()=>reject(Error('预览启动超时：'+stderr)),10000);server.stderr.on('data',d=>stderr+=String(d));server.stdout.on('data',d=>{const match=String(d).match(/http:\/\/[^\s]+/);if(match){clearTimeout(timer);resolve(match[0]);}});server.on('exit',()=>{clearTimeout(timer);reject(Error('预览启动失败：'+stderr));});});
 browser=await chromium.launch({channel:process.env.MIAO_BROWSER_CHANNEL||'chrome',headless:true});
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.name+': '+e.message));
 await page.addInitScript(()=>window.addEventListener('unhandledrejection',e=>{(window.smokeRejections??=[]).push(String(e.reason));}));
 await page.goto(url+'/?settings-smoke');await page.locator('#miao-nai-menu').waitFor();await page.locator('#miao-nai-menu').click();await page.locator('.miao-settings').waitFor();
 const nav=page.locator('.miao-tabs');
 const singleRow=()=>nav.evaluate(n=>{const buttons=[...n.querySelectorAll('button')];return buttons.every(b=>Math.abs(b.getBoundingClientRect().top-buttons[0].getBoundingClientRect().top)<1)&&buttons.every(b=>b.getBoundingClientRect().bottom<=n.getBoundingClientRect().bottom+1);});
 assert.equal(await singleRow(),true);
 for(const label of ['生成','配置','Vibe','生图指令','角色绑定','图库']){await nav.getByRole('button',{name:label,exact:true}).click();assert.ok(await page.locator('.miao-panel-body').isVisible());}
 await nav.getByRole('button',{name:'生成',exact:true}).click();await page.getByRole('checkbox',{name:'启用收藏提示词',exact:true}).check();await nav.getByRole('button',{name:'收藏',exact:true}).click();
 assert.equal(await singleRow(),true);
 await nav.getByRole('button',{name:'生图指令',exact:true}).click();
 const source=page.getByRole('combobox',{name:'来源',exact:true}),injection=()=>page.evaluate(()=>window.preview.injections.miao_nai_image_instruction.text);
 await source.selectOption('external');await page.waitForFunction(()=>window.preview.injections?.miao_nai_image_instruction?.text==='');await page.locator('.miao-prompt-tree').waitFor({state:'detached'});
 assert.deepEqual(await page.locator('.miao-panel-body h3').allTextContents(),['提示词来源','捕捉标签']);assert.equal(await page.locator('.miao-prompt-tree').count(),0);
 // Switching source must commit the pending capture fields, including on failure.
 await page.getByRole('textbox',{name:'起始标签',exact:true}).fill('custom###');
 await source.selectOption('builtin');await page.waitForFunction(()=>window.preview.settings.promptConfig.mode==='builtin');await page.locator('.miao-prompt-tree').waitFor();
 assert.equal(await page.evaluate(()=>window.preview.settings.startTag),'custom###');await page.getByText('当前捕捉标签与内置 image### / ### 格式不一致，可能无法识别图片；请核对捕捉标签和输出正文。',{exact:true}).waitFor();
 await page.getByRole('textbox',{name:'起始标签',exact:true}).fill('image###');
 assert.deepEqual(await page.locator('.miao-prompt-tree > .miao-tree-node').evaluateAll(nodes=>nodes.map(n=>n.dataset.displayId)),['00','01','02','03','04','05']);
 const branch=id=>page.locator(`[data-node-id="${id}"]`),button=(name)=>page.getByRole('button',{name,exact:true});
 // Keywords belong to the 03 card and remain editable while disabled/collapsed.
 const keywords=page.getByRole('region',{name:'NSFW 触发关键词',exact:true});
 assert.equal(await keywords.getByRole('button',{name:/^删除触发关键词：/}).count(),10);
 assert.equal(await keywords.locator('..').getAttribute('data-node-id'),'nsfw');
 const addWord=async word=>{await keywords.getByRole('button',{name:'添加触发关键词',exact:true}).click();await keywords.getByRole('textbox',{name:'触发关键词文本',exact:true}).fill(word);await keywords.getByRole('textbox',{name:'触发关键词文本',exact:true}).press('Enter');};
 await addWord('FIXTUREKEY');await keywords.getByRole('button',{name:'编辑触发关键词：FIXTUREKEY',exact:true}).waitFor();
 await keywords.getByRole('button',{name:'编辑触发关键词：FIXTUREKEY',exact:true}).click();await keywords.getByRole('textbox').fill('CANCELED');await keywords.getByRole('textbox').press('Escape');assert.equal(await keywords.getByRole('textbox').count(),0);assert.equal(await keywords.getByRole('button',{name:'编辑触发关键词：FIXTUREKEY',exact:true}).count(),1);
 const keywordSaves=await page.evaluate(()=>window.preview.settingsSaves);await addWord('nsfw');await keywords.getByText('触发关键词重复（不区分大小写）',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.preview.settingsSaves),keywordSaves);await keywords.getByRole('button',{name:'取消关键词编辑',exact:true}).click();
 await page.evaluate(()=>window.preview.failSettingsSave=true);await keywords.getByRole('button',{name:'删除触发关键词：FIXTUREKEY',exact:true}).click();await keywords.getByText('保存失败，请重试',{exact:true}).waitFor();assert.equal(await keywords.getByRole('button',{name:'编辑触发关键词：FIXTUREKEY',exact:true}).count(),1);await page.evaluate(()=>window.preview.failSettingsSave=false);
 await keywords.getByRole('button',{name:'编辑触发关键词：FIXTUREKEY',exact:true}).click();await keywords.getByRole('textbox').fill('UPDATEDKEY');await keywords.getByRole('button',{name:'保存触发关键词',exact:true}).click();await keywords.getByRole('button',{name:'编辑触发关键词：UPDATEDKEY',exact:true}).waitFor();
 // A synthetic send goes through the same event ordering as the host. No generation API.
 await page.getByRole('switch',{name:'启用NSFW 扩展',exact:true}).check();
 assert.ok(!(await injection()).includes('15.NSFW:'));
 await page.evaluate(()=>{
  const input=document.createElement('input');input.id='fixture-chat-input';input.setAttribute('aria-label','模拟聊天输入');const send=document.createElement('button');send.id='fixture-chat-send';send.textContent='模拟发送';document.querySelector('.miao-panel-body').prepend(input,send);
  send.onclick=async()=>{const p=window.preview;await p.emit('GENERATION_AFTER_COMMANDS','normal');p.chat.push({is_user:true,mes:input.value,extra:{}});await p.emit('MESSAGE_SENT',p.chat.length-1);await p.emit('USER_MESSAGE_RENDERED',p.chat.length-1);p.fixturePrompt=p.injections.miao_nai_image_instruction.text;};
 });
 await page.getByRole('textbox',{name:'模拟聊天输入',exact:true}).fill('UPDATEDKEY input');await page.getByRole('button',{name:'模拟发送',exact:true}).click();await page.waitForFunction(()=>window.preview.fixturePrompt?.includes('15.NSFW:'));assert.ok((await injection()).includes('11.NSFW环节要求'));
 await page.evaluate(async()=>{const p=window.preview;p.chat.push({mes:'safe stream',extra:{}});await p.emit('STREAM_TOKEN_RECEIVED');await p.emit('MESSAGE_UPDATED',p.chat.length-1);});assert.ok((await injection()).includes('15.NSFW:'));
 await page.evaluate(async()=>{const p=window.preview;await p.emit('GENERATION_ENDED');p.chat.splice(0,p.chat.length,{is_user:true,mes:'safe user'},{mes:'UPDATEDKEY old reply'});await p.emit('GENERATION_AFTER_COMMANDS','regenerate');p.chat.pop();await p.emit('MESSAGE_DELETED',p.chat.length);p.fixturePrompt=p.injections.miao_nai_image_instruction.text;});assert.ok(!(await injection()).includes('15.NSFW:'));
 for(const [type,expected] of [['swipe',false],['continue',true]]){
  await page.evaluate(async type=>{const p=window.preview;p.chat.splice(0,p.chat.length,{is_user:true,mes:'safe user'},{mes:'UPDATEDKEY old reply'});await p.emit('GENERATION_AFTER_COMMANDS',type);},type);assert.equal((await injection()).includes('15.NSFW:'),expected);
 }
 await page.evaluate(async()=>{const p=window.preview;p.chat.splice(0,p.chat.length,{mes:'safe in chat B'});await p.emit('CHAT_CHANGED');document.getElementById('fixture-chat-input').remove();document.getElementById('fixture-chat-send').remove();});assert.ok(!(await injection()).includes('15.NSFW:'));
 // Empty is an intentional saved list, including after re-arming 03.
 while(await keywords.getByRole('button',{name:/^删除触发关键词：/}).count()){
  const count=await keywords.getByRole('button',{name:/^删除触发关键词：/}).count();await keywords.getByRole('button',{name:/^删除触发关键词：/}).first().click();await page.waitForFunction(count=>document.querySelectorAll('.miao-keyword-chip').length<count,count);
 }
 await keywords.getByText('暂无触发关键词，03 不会自动激活',{exact:true}).waitFor();await page.getByRole('switch',{name:'启用NSFW 扩展',exact:true}).uncheck();await page.getByRole('switch',{name:'启用NSFW 扩展',exact:true}).check();assert.deepEqual(await page.evaluate(()=>window.preview.settings.promptConfig.nsfwTrigger.keywords),[]);
 page.once('dialog',d=>d.dismiss());await keywords.getByRole('button',{name:'恢复默认触发关键词',exact:true}).click();assert.deepEqual(await page.evaluate(()=>window.preview.settings.promptConfig.nsfwTrigger.keywords),[]);
 page.once('dialog',d=>d.accept());await keywords.getByRole('button',{name:'恢复默认触发关键词',exact:true}).click();await page.waitForFunction(()=>window.preview.settings.promptConfig.nsfwTrigger.keywords.length===10);await page.getByRole('switch',{name:'启用NSFW 扩展',exact:true}).uncheck();

 await page.getByRole('switch',{name:'启用NSFW 扩展',exact:true}).click({trial:true});
 const before=await injection(),saves=await page.evaluate(()=>window.preview.settingsSaves);
 await button('展开通用 Tag 规范及补充').click();
 for(const name of ['任务与参数','画面组成','自检','输出要求'])await button('展开'+name).click();
 await button('展开彩蛋任务').click();
 assert.ok(await branch('egg').locator(':scope > .miao-tree-children > [data-node-id="egg.description"]').isVisible());
 assert.equal(await branch('selfcheck').locator(':scope > .miao-tree-children > [data-node-id="selfcheck.egg"]').count(),1);
 assert.equal(await branch('selfcheck.item10').locator('[data-node-id="selfcheck.egg"]').count(),0);
 await button('收起画面组成').click();await button('展开画面组成').click();assert.ok(await branch('egg.description').isVisible());
 assert.equal(await injection(),before);assert.equal(await page.evaluate(()=>window.preview.settingsSaves),saves);
 assert.equal(await branch('composition').locator(':scope > .miao-prompt-module .miao-tree-expand').count(),1);assert.equal(await branch('tags').locator(':scope > .miao-prompt-module .miao-tree-expand').count(),1);assert.equal(await branch('tags').locator(':scope > .miao-prompt-module .miao-tree-edit').count(),0);assert.equal(await branch('egg').getAttribute('data-display-id'),'01.01');
 for(const id of ['task','composition','tags','egg','nsfw','selfcheck','orientation','output.format']){
  assert.ok(await branch(id).evaluate(n=>parseFloat(getComputedStyle(n).borderTopWidth)>0));
  assert.ok(await branch(id).evaluate(n=>{const title=n.querySelector(':scope > .miao-prompt-module .miao-tree-title'),arrow=title.querySelector('button'),edit=n.querySelector(':scope > .miao-prompt-module .miao-tree-edit'),sw=n.querySelector(':scope > .miao-prompt-module .miao-prompt-switch');return (!arrow||!!(title.querySelector('strong').compareDocumentPosition(arrow)&Node.DOCUMENT_POSITION_FOLLOWING))&&(!edit||!sw||!!(edit.compareDocumentPosition(sw)&Node.DOCUMENT_POSITION_FOLLOWING));}));
 }

 assert.equal(await page.getByText('最终 D0 提示词预览',{exact:true}).count(),0);
 assert.equal(await page.locator('.miao-prompt-tree [draggable="true"],.miao-prompt-tree [contenteditable]').count(),0);
 assert.equal(await page.locator('.miao-prompt-module').getByRole('button',{name:/新增|删除|拖拽|改名|排序/}).count(),0);
 for(const name of ['任务与参数','重要步骤与绘图数量','同人角色','画面组成','完整 Tag（主 API 输出）','角色绑定 Tag 规则','彩蛋任务','彩蛋解析','自检','彩蛋额外检查','小标题','图片标签结构']){
  await button('编辑'+name).click();const dlg=page.getByRole('dialog',{name:'编辑 · '+name,exact:true});assert.equal(await dlg.locator('textarea').count(),name==='自检'?2:1);await dlg.getByRole('button',{name:'取消',exact:true}).click();await dlg.waitFor({state:'detached'});
 }
 // Ordinary parameters are emitted once, with no internal setvar assignments.
 const fixed=page.getByRole('textbox',{name:'人格',exact:true});await fixed.fill('FIXTURE_PERSONA');await fixed.press('Tab');await page.waitForFunction(()=>window.preview.injections.miao_nai_image_instruction.text.includes('User：FIXTURE_PERSONA'));
 assert.ok(!(await injection()).includes('{{setvar'));
 await button('编辑画面组成').click();
 const editor=page.getByRole('dialog',{name:'编辑 · 画面组成',exact:true}),text=editor.getByRole('textbox',{name:'正文',exact:true}),base=await text.inputValue();
 await text.fill(base+'\nSMOKE_CUSTOM');await editor.getByRole('button',{name:'保存',exact:true}).click();await editor.waitFor({state:'detached'});assert.ok((await injection()).includes('SMOKE_CUSTOM'));
 await button('编辑画面组成').click();await text.fill('discard draft');page.once('dialog',d=>d.accept());await editor.getByRole('button',{name:'取消',exact:true}).click();await editor.waitFor({state:'detached'});assert.ok((await injection()).includes('SMOKE_CUSTOM'));
 await button('编辑画面组成').click();await editor.getByRole('button',{name:'恢复默认',exact:true}).click();assert.equal(await text.inputValue(),base);await editor.getByRole('button',{name:'保存',exact:true}).click();await editor.waitFor({state:'detached'});assert.equal(await page.evaluate(()=>window.preview.settings.promptConfig.textOverridesById.composition),undefined);
 await button('编辑画面组成').click();await text.fill(base+'\nRETRY_DRAFT');await page.evaluate(()=>window.preview.failSettingsSave=true);const oldInjection=await injection();await editor.getByRole('button',{name:'保存',exact:true}).click();await editor.getByText('保存失败，请重试',{exact:true}).waitFor();assert.ok((await text.inputValue()).endsWith('RETRY_DRAFT'));assert.equal(await injection(),oldInjection);await page.evaluate(()=>window.preview.failSettingsSave=false);await editor.getByRole('button',{name:'保存',exact:true}).click();await editor.waitFor({state:'detached'});
 const sw=name=>{const locator=page.getByRole('switch',{name:'启用'+name,exact:true});for(const method of ['check','uncheck']){const original=locator[method].bind(locator);locator[method]=async(...args)=>{await original(...args);await page.waitForFunction(()=>!document.querySelector('.miao-prompt-tree')?.hasAttribute('aria-busy'));};}return locator;};
 const savedEgg=await page.evaluate(()=>structuredClone(window.preview.settings.promptConfig));
 await sw('画面组成').uncheck();assert.equal(await branch('egg').isVisible(),false);assert.equal(await branch('composition').isVisible(),true);
 await branch('egg.description').locator('input').evaluate(n=>n.focus());assert.equal(await branch('egg.description').locator('input').evaluate(n=>n===document.activeElement),false);
 await sw('画面组成').check();assert.ok(await branch('egg.description').isVisible());assert.deepEqual(await page.evaluate(()=>window.preview.settings.promptConfig),savedEgg);

 await sw('彩蛋解析').uncheck();assert.ok(!(await injection()).includes('<easter_egg>'));await sw('彩蛋任务').uncheck();assert.equal(await branch('egg.description').isVisible(),false);assert.equal(await branch('selfcheck.egg').isVisible(),false);assert.ok(!(await injection()).includes('是否记得在彩蛋标记之后输出彩蛋'));await sw('彩蛋任务').check();assert.equal(await sw('彩蛋解析').isChecked(),false);await sw('彩蛋解析').check();
 await sw('自检').uncheck();assert.equal(await branch('selfcheck.item1').isVisible(),false);assert.equal(await branch('output.selfcheck').isVisible(),false);assert.ok(!(await injection()).includes('## 自检'));assert.ok(!(await injection()).includes('如启用自检：'));await sw('自检').check();
 assert.equal(await branch('selfcheck.nsfw').isVisible(),false);await page.evaluate(async()=>{window.preview.chat.push({is_user:true,mes:'NSFW fixture',extra:{}});await window.preview.emit('MESSAGE_SENT',window.preview.chat.length-1);});await sw('NSFW 扩展').check();await button('展开NSFW 扩展').click();assert.ok(await branch('selfcheck.nsfw').isVisible());assert.equal(await branch('selfcheck.nsfw').getByRole('switch').count(),0);await sw('自检').uncheck();assert.equal(await branch('selfcheck.nsfw').isVisible(),false);await sw('自检').check();assert.ok(await branch('selfcheck.nsfw').isVisible());assert.ok((await injection()).includes('15.NSFW:'));
 await button('展开性向补充').click();await page.getByRole('combobox',{name:'发送的性向',exact:true}).selectOption('BL');await page.waitForFunction(()=>!document.querySelector('.miao-prompt-tree')?.hasAttribute('aria-busy'));assert.ok((await injection()).includes('[bl]'));assert.ok(!(await injection()).includes('[bg]'));
 // Editing an unselected candidate must not select it.
 await button('编辑BG').click();const bg=page.getByRole('dialog',{name:'编辑 · BG',exact:true});await bg.getByRole('textbox').fill('UNSELECTED_BG');await bg.getByRole('button',{name:'保存',exact:true}).click();await bg.waitFor({state:'detached'});assert.ok(!(await injection()).includes('UNSELECTED_BG'));
 await sw('NSFW 扩展').uncheck();assert.equal(await branch('selfcheck.nsfw').isVisible(),false);assert.equal(await branch('orientation').isVisible(),false);assert.equal(await branch('orientation').locator('select').inputValue(),'BL');assert.ok(!(await injection()).includes('[bl]'));
 await sw('小标题').click({trial:true});await button('编辑小标题').focus();await page.keyboard.press('Tab');assert.equal(await sw('小标题').evaluate(n=>n===document.activeElement),true);await page.keyboard.press('Space');await sw('小标题').click({trial:true});assert.equal(await sw('小标题').isChecked(),true);assert.ok((await injection()).includes('胡里花哨'));
 // Source save failure keeps the old UI and D0.
 await page.evaluate(()=>window.preview.failSettingsSave=true);await source.selectOption('external');await page.waitForFunction(e=>e.value==='builtin'&&!e.disabled,await source.elementHandle());assert.ok(await page.evaluate(()=>window.miaoTestToasts.some(n=>n.type==='error'&&n.message.includes('prompt-config:save'))));assert.equal(await page.locator('.miao-error-view').count(),0);assert.equal(await source.inputValue(),'builtin');assert.ok(await page.locator('.miao-prompt-tree').isVisible());await page.evaluate(()=>window.preview.failSettingsSave=false);
 await source.selectOption('external');await page.waitForFunction(()=>window.preview.injections.miao_nai_image_instruction.text==='');await page.locator('.miao-prompt-tree').waitFor({state:'detached'});assert.deepEqual(await page.locator('.miao-panel-body h3').allTextContents(),['提示词来源','捕捉标签']);
 await page.getByRole('textbox',{name:'结束标签',exact:true}).fill('END');await button('保存').click();await page.waitForFunction(()=>window.preview.settings.endTag==='END');
 await button('关闭设置').click();await page.locator('#miao-nai-menu').click();await page.locator('.miao-settings').waitFor();await nav.getByRole('button',{name:'生图指令',exact:true}).click();assert.equal(await page.getByRole('textbox',{name:'结束标签',exact:true}).inputValue(),'END');assert.equal(await page.locator('.miao-prompt-tree').count(),0);
 await source.selectOption('builtin');await page.locator('.miao-prompt-tree').waitFor();await button('编辑画面组成').click();assert.ok((await text.inputValue()).endsWith('RETRY_DRAFT'));
 const longText='a'.repeat(1800)+'\n'+'连续中文'.repeat(400)+'\nhttps://example.invalid/'+'url'.repeat(600)+'\n<imgthink> {{user}}  spaces';
 for(const size of [{width:1280,height:800},{width:390,height:844},{width:320,height:430}]){
  await page.setViewportSize(size);await text.fill(longText);
  await page.waitForFunction(()=>{const t=document.querySelector('.miao-prompt-editor textarea');return t&&t.clientWidth>0&&t.scrollWidth<=t.clientWidth+2;});
  assert.equal(await text.inputValue(),longText);assert.ok(await text.evaluate(n=>{n.scrollTop=100;return n.scrollTop>0;}));
  assert.ok(await editor.evaluate(n=>n.scrollWidth<=n.clientWidth+2));
 }
 await editor.getByRole('button',{name:'保存',exact:true}).click();await editor.waitFor({state:'detached'});
 assert.equal(await page.evaluate(()=>window.preview.settings.promptConfig.textOverridesById.composition.body),longText);assert.ok((await injection()).includes(longText));
 for(const theme of ['light','dark']){
  await page.locator('.miao-settings').evaluate((n,theme)=>{n.style.setProperty('--mi-bg',theme==='dark'?'#202124':'#ffffff');n.style.setProperty('--mi-ink',theme==='dark'?'#eeeeee':'#222222');},theme);
  for(const width of [390,320]){
   await page.setViewportSize({width,height:844});
   await page.waitForFunction(()=>{const n=document.querySelector('.miao-panel-body'),leaf=document.querySelector('[data-node-id="egg.description"]');return n.scrollWidth<=n.clientWidth+2&&n.getBoundingClientRect().width<=innerWidth&&leaf.getBoundingClientRect().right<=innerWidth;});
   assert.ok(await branch('egg.description').evaluate(n=>n.getBoundingClientRect().right<=innerWidth));
  }
  await page.locator('.miao-prompt-tree').screenshot({path:'docs/local/prompt-tree-'+theme+'-320.png'});
 }
 await page.locator('.miao-settings').evaluate(n=>{n.style.removeProperty('--mi-bg');n.style.removeProperty('--mi-ink');});

 await button('编辑画面组成').click();await text.fill(base+'\nRETRY_DRAFT');await editor.getByRole('button',{name:'保存',exact:true}).click();await editor.waitFor({state:'detached'});await button('编辑画面组成').click();
 await mkdir('docs/local',{recursive:true});await page.screenshot({path:'docs/local/settings-editor-desktop.png'});
 for(const size of [{width:390,height:844},{width:390,height:430}]){
  await page.setViewportSize(size);await page.waitForFunction(({width,height})=>{const b=[...document.querySelectorAll('.miao-prompt-editor button')].find(n=>n.textContent==='保存')?.getBoundingClientRect(),card=document.querySelector('.miao-prompt-editor-card')?.getBoundingClientRect();return b&&b.bottom<=height&&card&&card.width<=width;},size);assert.ok(await editor.isVisible());const box=await editor.boundingBox();assert.ok(box.width<=size.width);const cancel=await editor.getByRole('button',{name:'取消',exact:true}).boundingBox();assert.ok(cancel.y+cancel.height<=size.height);
 }
 await page.screenshot({path:'docs/local/settings-editor-mobile.png'});await editor.getByRole('button',{name:'取消',exact:true}).click();
 assert.deepEqual(errors,[]);assert.deepEqual(await page.evaluate(()=>window.smokeRejections||[]),[]);assert.equal(await page.evaluate(()=>window.preview.calls.length),0,'No generation API calls');
 // Real entry initialization with synthetic historical settings, including failed persistence.
 for(const variant of ['normal','external','custom','save-fail','tree-old','tree-old-fail']){
  const historical=await browser.newPage();historical.on('pageerror',e=>errors.push(variant+': '+e.message));
  await historical.goto(url+'/?settings-smoke&prompt-v1='+variant);await historical.locator('#miao-nai-menu').waitFor();
  await historical.waitForFunction(()=>window.preview.injections?.miao_nai_image_instruction!==undefined);
  const blocked=['custom','save-fail','tree-old-fail'].includes(variant);
  if(blocked){await historical.waitForFunction(()=>window.miaoTestToasts.some(n=>n.message.includes('prompt-config:')));assert.deepEqual(await historical.evaluate(()=>window.preview.settings.promptConfig),await historical.evaluate(()=>window.preview.originalPromptConfig));assert.equal(await historical.evaluate(()=>window.preview.injections.miao_nai_image_instruction.text),'');assert.equal(await historical.locator('.miao-error-view').count(),0);await historical.close();continue;}
  await historical.waitForFunction(()=>window.preview.settings.promptConfig.treeRevision===4);
  await historical.locator('#miao-nai-menu').click();await historical.locator('.miao-tabs').getByRole('button',{name:'生图指令',exact:true}).click();
  assert.equal(await historical.getByRole('button',{name:'恢复旧版配置备份',exact:true}).count(),0);
  if(variant==='tree-old'){assert.equal(await historical.evaluate(()=>window.preview.settings.promptConfig.textOverridesById['tags.full'].body),'OLD_CUSTOM_TAGS');assert.ok(await historical.evaluate(()=>window.preview.settings.promptConfig.textOverridesById.egg.body.endsWith('OLD_CUSTOM_END')));}
  if(variant==='external'){assert.equal(await historical.locator('.miao-prompt-tree').count(),0);assert.equal(await historical.evaluate(()=>window.preview.injections.miao_nai_image_instruction.text),'');}
  // Persist a tree edit, then reload the actual entry; migration must be idempotent.
  if(variant!=='external'){
   await historical.getByRole('button',{name:'编辑画面组成',exact:true}).click();const dlg=historical.getByRole('dialog',{name:'编辑 · 画面组成',exact:true});await dlg.getByRole('textbox',{name:'正文',exact:true}).fill('PERSISTED_TREE_FIXTURE');await dlg.getByRole('button',{name:'保存',exact:true}).click();await dlg.waitFor({state:'detached'});
   const saved=await historical.evaluate(()=>structuredClone(window.preview.settings.promptConfig));
   await historical.reload();await historical.waitForFunction(()=>window.preview.injections?.miao_nai_image_instruction?.text.includes('PERSISTED_TREE_FIXTURE'));
   assert.deepEqual(await historical.evaluate(()=>window.preview.settings.promptConfig),saved);
  }
  assert.equal(await historical.evaluate(()=>window.preview.calls.length),0);await historical.close();
 }
 assert.deepEqual(errors,[]);
 }finally{await browser?.close();server.kill();}
});
