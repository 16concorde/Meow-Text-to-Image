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
test('actual extension panel startup, all tabs and prompt editor interactions', {timeout:90000},async()=>{
 const {chromium}=await browserRuntime();
 const server=spawn(process.execPath,['tests/preview-server.mjs'],{env:{...process.env,MIAO_PREVIEW_PORT:'0'},stdio:['ignore','pipe','pipe']});
 let browser;
 try{
 const url=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('预览启动超时')),10000);server.stdout.on('data',d=>{const match=String(d).match(/http:\/\/[^\s]+/);if(match){clearTimeout(timer);resolve(match[0]);}});server.on('exit',()=>reject(Error('预览启动失败')));});
 browser=await chromium.launch({channel:process.env.MIAO_BROWSER_CHANNEL||'chrome',headless:true});
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.name+': '+e.message));
 await page.goto(url+'/?settings-smoke');await page.locator('#miao-nai-menu').waitFor();await page.locator('#miao-nai-menu').click();
 await page.locator('.miao-settings').waitFor();
 const nav=page.locator('.miao-tabs');
 for(const label of ['生成','配置','Vibe','生图指令','图库']){await nav.getByRole('button',{name:label,exact:true}).click();assert.ok(await page.locator('.miao-panel-body').isVisible());}
 // Favorites is optional; enable only the synthetic fixture setting via its real UI.
 await nav.getByRole('button',{name:'生成',exact:true}).click();await page.getByRole('checkbox',{name:'启用收藏提示词',exact:true}).check();await nav.getByRole('button',{name:'收藏',exact:true}).click();
 await nav.getByRole('button',{name:'生图指令',exact:true}).click();
 for(const name of ['主体','指令头','指令尾','自检','彩蛋','小标题','彩蛋解析','NSFW 提示词']){await page.getByRole('button',{name:'编辑'+name,exact:true}).click();const dlg=page.getByRole('dialog',{name:'编辑 · '+name,exact:true});await dlg.getByRole('button',{name:'取消',exact:true}).click();await dlg.waitFor({state:'detached'});}
 assert.equal(await page.getByText('最终 D0 提示词预览',{exact:true}).count(),0);
 await page.getByRole('combobox',{name:'来源',exact:true}).selectOption('builtin');
 await page.waitForFunction(()=>window.preview.injections?.miao_nai_image_instruction?.text.includes('<imageTag>'));
 const original=await page.evaluate(()=>window.preview.settings.promptConfig.overrides?.main);
 const fixed=page.getByRole('textbox',{name:'人格（setvar）',exact:true});await fixed.fill('{{user}}');await fixed.press('Tab');await page.waitForFunction(()=>window.preview.injections.miao_nai_image_instruction.text.includes('{{setvar::人格::{{user}}}}'));
 await page.getByRole('button',{name:'编辑主体',exact:true}).click();
 const editor=page.getByRole('dialog',{name:'编辑 · 主体',exact:true}),text=editor.getByRole('textbox',{name:'模块原文'});
 const base=await text.inputValue();await text.fill(base+'\nSMOKE_CUSTOM');await editor.getByRole('button',{name:'保存',exact:true}).click();await editor.waitFor({state:'detached'});
 assert.ok(await page.evaluate(()=>window.preview.injections.miao_nai_image_instruction.text.includes('SMOKE_CUSTOM')));
 await page.getByRole('button',{name:'编辑主体',exact:true}).click();await text.fill('discard draft');page.once('dialog',d=>d.accept());await editor.getByRole('button',{name:'取消',exact:true}).click();await editor.waitFor({state:'detached'});
 assert.ok(await page.evaluate(()=>window.preview.settings.promptConfig.overrides.main.endsWith('SMOKE_CUSTOM')));
 await page.getByRole('button',{name:'编辑主体',exact:true}).click();await editor.getByRole('button',{name:'恢复默认',exact:true}).click();assert.equal(await text.inputValue(),base);await editor.getByRole('button',{name:'保存',exact:true}).click();await editor.waitFor({state:'detached'});assert.equal(await page.evaluate(()=>window.preview.settings.promptConfig.overrides.main),original);
 await page.getByRole('checkbox',{name:'启用自检',exact:true}).uncheck();await page.waitForFunction(()=>!window.preview.injections.miao_nai_image_instruction.text.includes('## 自检'));
 await page.getByRole('button',{name:'编辑主体',exact:true}).click();await text.fill(base+'\nRETRY_DRAFT');await page.evaluate(()=>window.preview.failSettingsSave=true);await editor.getByRole('button',{name:'保存',exact:true}).click();await editor.getByText('保存失败，请重试',{exact:true}).waitFor();assert.ok((await text.inputValue()).endsWith('RETRY_DRAFT'));await page.evaluate(()=>window.preview.failSettingsSave=false);await editor.getByRole('button',{name:'保存',exact:true}).click();await editor.waitFor({state:'detached'});
 await page.getByRole('combobox',{name:'来源',exact:true}).selectOption('external');await page.waitForFunction(()=>window.preview.injections.miao_nai_image_instruction.text==='');
 await page.getByRole('button',{name:'关闭设置',exact:true}).click();await page.locator('#miao-nai-menu').click();await page.locator('.miao-settings').waitFor();await nav.getByRole('button',{name:'生图指令',exact:true}).click();await page.getByRole('button',{name:'编辑主体',exact:true}).click();assert.ok((await text.inputValue()).endsWith('RETRY_DRAFT'));
 await mkdir('docs/local',{recursive:true});await page.screenshot({path:'docs/local/settings-editor-desktop.png'});
 await page.setViewportSize({width:390,height:844});assert.ok(await editor.isVisible());assert.ok(await editor.getByRole('button',{name:'保存',exact:true}).isVisible());
 await page.waitForFunction(()=>document.querySelector('.miao-prompt-editor-card').getBoundingClientRect().width<=390);const box=await editor.boundingBox();assert.ok(box.width<=390);await mkdir('docs/local',{recursive:true});await page.screenshot({path:'docs/local/settings-editor-mobile.png'});
 await page.setViewportSize({width:390,height:430});await page.waitForFunction(()=>{const buttons=[...document.querySelectorAll('.miao-prompt-editor button')],b=buttons.find(n=>n.textContent==='保存')?.getBoundingClientRect();return b&&b.bottom<=430;});const saveBox=await editor.getByRole('button',{name:'保存',exact:true}).boundingBox();assert.ok(saveBox.y+saveBox.height<=430,'Save stays reachable with reduced viewport');
 await editor.getByRole('button',{name:'取消',exact:true}).click();assert.deepEqual(errors,[]);
 assert.equal(await page.evaluate(()=>window.preview.calls.length),0,'No generation API calls');
 }finally{await browser?.close();server.kill();}
});
