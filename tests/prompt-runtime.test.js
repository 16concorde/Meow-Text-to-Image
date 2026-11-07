import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCaptureProtocol,renderPromptSlot} from '../src/prompts/prompt-runtime-renderer.js';
import {composePrompt} from '../src/prompts/prompt-composer.js';
import {defaultTreeSettings,withTreeText} from '../src/prompts/tree-settings.js';
import {delimiterPattern,parseBodyBlocks,renderedBlockRange} from '../src/core/core.js';
import {configPatch,applyConfigPatch,mergePromptChanges,intendedConfigPatch} from '../src/prompts/prompt-patches.js';
import {createPromptAutosave} from '../src/ui/prompt-autosave.js';
import {publishPrompt,promptPlacementCapabilities} from '../src/platform/prompt-placement.js';
import {createPromptInjection} from '../src/platform/prompt-injection.js';
test('literal runtime protocol rendering changes both ends exactly once and preserves source and nested macros',()=>{
 for(const capture of [{start:'image###',end:'###'},{start:'<pic>',end:'</pic>'},{start:'[绘$&\\1]',end:'[闭$1]'},{start:'image###NEW',end:'END###'}]){
  const c=defaultTreeSettings();c.capture=capture;c.tagMode='binding';const before=structuredClone(c),text=composePrompt(c,{bindingRoster:'C01 = Fixture'});
  assert.ok(text.includes(capture.start+'...'+capture.end));assert.ok(text.includes(capture.start+'\n[图片tag]\n'+capture.end));assert.equal(text.split('【可用绑定 ID 对照表】').length,2);assert.ok(!text.includes('当前无可用绑定'));assert.deepEqual(c,before);
  const raw=capture.start+'first | C01, source#hugging'+capture.end;assert.equal(parseBodyBlocks(raw,delimiterPattern(capture.start,capture.end))[0].prompt,'first | C01, source#hugging');
  const macro='{{outer::{{inner::image###}}::image###}}';assert.equal(renderPromptSlot(macro+' image###...###','tags.full','body',c),macro+' '+capture.start+'...'+capture.end);
  const template=withTreeText(c,'tags.full',{body:'CUSTOM image###...### {{opaque::image###}}'});const original=structuredClone(template.textOverridesById);composePrompt(template);assert.deepEqual(template.textOverridesById,original);
 }
});
test('capture rejects ambiguous and reserved boundaries while allowing the legal default suffix',()=>{
 for(const capture of [{start:'',end:'END'},{start:'\n',end:'END'},{start:'S',end:'S'},{start:'{{tag}}',end:'END'},{start:'START',end:'STARTend'},{start:'<imgthink>',end:'END'},{start:'<imageTag>',end:'END'},{start:'/FIXTURE',end:'END'}])assert.throws(()=>validateCaptureProtocol(capture,'/FIXTURE'));
 assert.throws(()=>validateCaptureProtocol({start:'<customthink>',end:'END'},'',{prefix:'<customthink>'}));assert.doesNotThrow(()=>validateCaptureProtocol({start:'image###',end:'###'}));assert.doesNotThrow(()=>validateCaptureProtocol({start:'<pic>',end:'</pic>'}));
});
test('XML stream fragments wait for full closure, mask thoughts, keep offsets and reject ambiguous rendered text',()=>{
 const p=delimiterPattern('<pic>','</pic>'),text='<imgthink><pic>thought</pic></imgthink>\n<pic>actual</pic>',start=text.indexOf('<pic>actual');
 for(let i=start;i<text.length;i++)assert.equal(parseBodyBlocks(text.slice(0,i),p).length,0);
 assert.equal(parseBodyBlocks(text,p)[0].start,start);assert.equal(parseBodyBlocks('<pic>unfinished<pic>closed</pic>',p)[0].prompt,'closed');
 assert.deepEqual(renderedBlockRange('before actual after','<pic>actual</pic>','<pic>','</pic>'),{start:7,end:13});assert.equal(renderedBlockRange('actual before actual','<pic>actual</pic>','<pic>','</pic>'),null);
});
test('leaf patches keep interleaved controls and deletions independent',()=>{
 const c=defaultTreeSettings(),count={...c,params:{...c.params,count:'4'}},choice={...c,tagMode:'binding'},capture={...c,capture:{start:'<pic>',end:'</pic>'}};
 const result=applyConfigPatch(applyConfigPatch(applyConfigPatch(c,configPatch(c,count)),configPatch(c,choice)),configPatch(c,capture));assert.equal(result.params.count,'4');assert.equal(result.tagMode,'binding');assert.deepEqual(result.capture,capture.capture);assert.deepEqual(c,defaultTreeSettings());
 assert.equal(mergePromptChanges(c,count,choice).params.count,'4');assert.equal(mergePromptChanges(c,count,choice).tagMode,'binding');assert.throws(()=>mergePromptChanges(c,count,{...c,params:{...c.params,count:'5'}}),e=>e.status==='conflicted');
});
test('IME drafts flush on demand, retain failures and serialize later edits',async()=>{
 let value='one',seen=[],release;const autosave=createPromptAutosave({delay:10000,maxWait:20000,run:async()=>{const snapshot=value;await new Promise(r=>release=r);seen.push(snapshot);}});
 autosave.compositionStart();autosave.schedule();await assert.rejects(autosave.flush(),/输入法/);autosave.compositionEnd();const first=autosave.flush();await new Promise(setImmediate);release();await first;value='two';autosave.schedule();const second=autosave.flush();await new Promise(setImmediate);release();await second;assert.deepEqual(seen,['one','two']);autosave.dispose();
 const error=Error('fixture failed'),failed=createPromptAutosave({run:async()=>{throw error;}});failed.schedule();await assert.rejects(failed.flush(),/fixture/);await assert.rejects(failed.flush(),/fixture/);failed.dispose();
});
test('placement uses real depth, explicitly lacks numeric order and checks host readback',async()=>{
 assert.equal(Object.hasOwn(promptPlacementCapabilities,'supportsNumericOrder'),false);const host={extensionPrompts:{},setExtensionPrompt(id,value,position,depth,scan,role){this.extensionPrompts[id]={value,position,depth,scan,role};}};publishPrompt(host,'fixture','BODY',{depth:2,order:888});assert.equal(host.extensionPrompts.fixture.depth,2);assert.equal(host.extensionPrompts.fixture.role,0);
 assert.throws(()=>publishPrompt({...host,setExtensionPrompt(){}},'fixture','NEW',{depth:3}),/核验失败/);
 let release,called=false;const injection=createPromptInjection({settings:{enabled:true,promptConfig:defaultTreeSettings()},context:()=>({setExtensionPrompt(){called=true;}}),flush:()=>new Promise(r=>release=r),onError:()=>{}});const pending=injection.begin();assert.equal(called,false);release();await pending;assert.equal(called,true);
});

test('continuation keeps its historical protocol while new replies adopt the latest confirmed protocol',async()=>{
 const c=defaultTreeSettings();c.capture={start:'<pic>',end:'</pic>'};let text='';const injection=createPromptInjection({settings:{enabled:true,promptConfig:c},context:()=>({chat:[],setExtensionPrompt:(_id,value)=>text=value}),captureProtocol:type=>type==='continue'?{start:'image###',end:'###'}:c.capture,onError:()=>{}});
 await injection.begin('continue');assert.ok(text.includes('image###...###'));assert.ok(!text.includes('<pic>'));
 await injection.begin('normal');assert.ok(text.includes('<pic>...</pic>'));assert.ok(!text.includes('image###'));assert.deepEqual(c.capture,{start:'<pic>',end:'</pic>'});
});

test('a rapid switch back to the confirmed value still overrides a queued opposite intent',()=>{const initial=defaultTreeSettings(),off={...initial,flags:{fan:false}};const queuedOff=intendedConfigPatch(initial,off,[['flags','fan']]),queuedOn=intendedConfigPatch(initial,initial,[['flags','fan']]);assert.equal(applyConfigPatch(applyConfigPatch(initial,queuedOff),queuedOn).flags.fan,true);});
