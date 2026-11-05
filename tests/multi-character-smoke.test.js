import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
const require=createRequire(import.meta.url);
async function runtime(){
 try{return require('playwright');}catch{}
 return require(process.env.MIAO_PLAYWRIGHT_MODULE||`${homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`);
}
test('actual entry preserves character pipes through manual, edit, reroll, auto and favorite generation', {timeout:90000},async()=>{
 const {chromium}=await runtime(),server=spawn(process.execPath,['tests/preview-server.mjs'],{env:{...process.env,MIAO_PREVIEW_PORT:'0'},stdio:['ignore','pipe','pipe']});let browser;
 try{
  const url=await new Promise((resolve,reject)=>{let stderr='';const timer=setTimeout(()=>reject(Error('preview timeout: '+stderr)),10000);server.stderr.on('data',d=>stderr+=d);server.stdout.on('data',d=>{const match=String(d).match(/http:\/\/[^\s]+/);if(match){clearTimeout(timer);resolve(match[0]);}});server.on('exit',()=>{clearTimeout(timer);reject(Error(stderr));});});
  browser=await chromium.launch({channel:process.env.MIAO_BROWSER_CHANNEL||'chrome',headless:true});
  for(const mobile of [false,true]){
   const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1280,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(()=>window.addEventListener('unhandledrejection',e=>(window.rejections??=[]).push(String(e.reason))));
   // The fixture intercepts every NAI POST; ?tt exercises the alternate host.
   await page.route('**/fixture-nai.zip',route=>route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=','base64')}));
   await page.goto(url+'/?settings-smoke'+(mobile?'&tt':''));await page.locator('#miao-nai-menu').click();
   const go=async label=>{
    if(mobile){if(await page.locator('.miao-settings').getAttribute('data-section')!=='overview')await page.locator('.miao-drawer-back').click();await page.locator(`.miao-overview-row[aria-label="${label}"]`).click();}
    else await page.locator('.miao-tabs').getByRole('button',{name:label,exact:true}).click();
   };
   await go('生成');await page.locator('input[type=password]').fill('fixture-multi-character-key-not-real');await page.getByRole('button',{name:'保存密钥',exact:true}).click();await page.waitForFunction(()=>window.preview.settings.keyHash?.length===64);
   await page.locator('.miao-switch-row').filter({hasText:'启用收藏提示词'}).locator('input').check();await page.locator('.miao-drawer-close').click();
   const raw='2boys, night | boy, source#hug | boy, target#hug';
   const setMessage=async(prompt,automatic=false)=>page.evaluate(async({prompt,automatic})=>{
    const p=window.preview;p.settings.mode=automatic?'auto':'manual';p.settings.cloudQueue=false;p.settings.autoRetryEnabled=false;
    Object.assign(p.settings.profiles[p.settings.active],{positive:'FRONT',positiveSuffix:'BACK',qualityPreset:'none',ucPreset:'none'});
    if(automatic){p.chat.splice(0);p.chatId='automatic-fixture';await p.emit('CHAT_CHANGED');await p.emit('GENERATION_STARTED','normal');}
    p.chat.splice(0,p.chat.length,{name:'Fixture',mes:'image###'+prompt+'###',extra:{}});
    const mes=document.createElement('div');mes.className='mes';mes.setAttribute('mesid','0');const body=document.createElement('div');body.className='mes_text';body.textContent=p.chat[0].mes;mes.append(body);document.querySelector('#chat').replaceChildren(mes);
    await p.emit(automatic?'GENERATION_ENDED':'MESSAGE_UPDATED',0);
   },{prompt,automatic});
   const checkPayload=async(count,characters)=>{
    await page.waitForFunction(count=>window.preview.calls.length===count,count);
    const body=await page.evaluate(()=>window.preview.calls.at(-1));assert.equal(body.input,'FRONT,\n2boys, night,\nBACK,');assert.equal(body.parameters.v4_prompt.caption.base_caption,body.input);assert.deepEqual(body.parameters.v4_prompt.caption.char_captions.map(c=>c.char_caption),characters);
   };
   await setMessage(raw);await page.getByRole('button',{name:'生成插图',exact:true}).click();await checkPayload(1,['boy, source#hug','boy, target#hug']);await page.locator('.miao-image-card img').waitFor();
   await page.locator('.miao-image-card img').click();await page.getByRole('button',{name:'查看提示词',exact:true}).click();assert.equal(await page.locator('.miao-prompt-view>pre').first().textContent(),raw);
   await page.getByRole('button',{name:'编辑提示词',exact:true}).click();const editor=page.getByRole('textbox',{name:'编辑本次 tag 提示词',exact:true});
   await editor.fill(raw+' |');await page.getByRole('button',{name:'保存并生成新图',exact:true}).click();await page.locator('.miao-tag-editor [role=alert]').filter({hasText:'不能为空'}).waitFor();assert.equal(await page.evaluate(()=>window.preview.calls.length),1);assert.equal(await page.evaluate(()=>window.preview.chat[0].mes),'image###'+raw+'###');
   const edited='2boys, night | boy, first | boy, last';await editor.fill(edited);await page.getByRole('button',{name:'保存并生成新图',exact:true}).click();await checkPayload(2,['boy, first','boy, last']);await page.locator('.miao-prompt-view').waitFor({state:'detached'});await page.waitForFunction(()=>document.querySelector('.miao-version-count')?.textContent==='2 / 2');
   const record=await page.evaluate(()=>Object.values(window.preview.chat[0].miao_nai_image_swipes[0])[0]);assert.equal(record.tagPrompt,edited);assert.deepEqual(record.request.naiCharacters,['boy, first','boy, last']);assert.equal(record.versions[0].tagPrompt,raw);
   await page.locator('.miao-image-card img').dblclick();await checkPayload(3,['boy, first','boy, last']);await page.waitForFunction(()=>document.querySelector('.miao-version-count')?.textContent==='3 / 3');
   // Automatic generation uses the same single-task request structure.
   await setMessage(raw,true);await checkPayload(4,['boy, source#hug','boy, target#hug']);await page.locator('.miao-image-card img').waitFor();
   await page.evaluate(()=>window.preview.settings.mode='manual');await page.locator('#miao-nai-menu').click();await go('收藏');await page.getByRole('button',{name:'新增收藏',exact:true}).click();await page.getByRole('textbox',{name:'收藏名称',exact:true}).fill('Multi fixture');await page.getByRole('textbox',{name:'场景提示词',exact:true}).fill(raw);await page.getByRole('button',{name:'保存并生成',exact:true}).click();await checkPayload(5,['boy, source#hug','boy, target#hug']);await page.waitForFunction(()=>window.preview.settings.promptFavorites?.[0]?.images.length===1);
   assert.equal(await page.evaluate(()=>window.preview.settings.promptFavorites[0].positive),raw);assert.deepEqual(errors,[]);assert.deepEqual(await page.evaluate(()=>window.rejections||[]),[]);await page.close();
  }
 }finally{await browser?.close();server.kill();}
});
