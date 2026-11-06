import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {defaultTreeSettings,migrateTreeSettings} from '../src/prompts/tree-settings.js';
import {composePrompt} from '../src/prompts/prompt-composer.js';
import {savePromptCandidate} from '../src/prompts/prompt-config-save.js';
import {createPromptInjection} from '../src/platform/prompt-injection.js';
const history=JSON.parse(readFileSync(new URL('./support/prompt-history-fixtures.json',import.meta.url)));
test('real historical default shapes upgrade once and retain custom current slots over three restarts',()=>{
 for(const {config} of history){const before=structuredClone(config),next=migrateTreeSettings(config);assert.deepEqual(config,before);assert.equal(next.treeRevision,4);for(let i=0;i<3;i++)assert.deepEqual(migrateTreeSettings(JSON.parse(JSON.stringify(next))),next);}
 for(const revision of [undefined,1,2,3,4]){
  const c=defaultTreeSettings();c.treeRevision=revision;c.orientation='GL';c.params.persona='{{user}}';c.nsfwTrigger.keywords=['Fixture'];c.tagMode='binding';c.enabledById.nsfw=true;c.textOverridesById={composition:{body:'CUSTOM'},selfcheck:{prefix:'CUSTOM CHECK\n<imgthink>',suffix:'</imgthink>\nEND'}};
  const next=migrateTreeSettings(c);assert.deepEqual(next.textOverridesById,c.textOverridesById);assert.equal(next.tagMode,'binding');assert.deepEqual(next.nsfwTrigger,c.nsfwTrigger);assert.equal(next.orientation,'GL');assert.equal(migrateTreeSettings(next),next);
 }
});
test('config failure stages retain live config and candidate commits only after persistence confirmation',async()=>{
 let live=defaultTreeSettings(),stored=structuredClone(live);const previous=live,candidate={...live,params:{...live.params,persona:'CANDIDATE'}};let release;
 const pending=savePromptCandidate(candidate,{persist:async next=>{await new Promise(r=>release=r);stored=structuredClone(next);},commit:next=>live=next});assert.equal(live,previous);release();await pending;assert.deepEqual(live,stored);
 await assert.rejects(savePromptCandidate({...candidate,tagMode:'invalid'},{persist:()=>assert.fail('validation must precede persistence'),commit:()=>assert.fail()}),e=>e.stage==='validate');
 const before=live;await assert.rejects(savePromptCandidate(candidate,{persist:()=>{throw Error('fixture HTTP 403');},commit:()=>assert.fail()}),e=>e.stage==='save'&&e.cause.message.includes('403'));assert.equal(live,before);
});
test('binding cold start delays roster, stale loads cannot inject and generation rejects I/O errors',async()=>{
 let status='idle',roster='OLD',release,calls=[],errors=[];
 const settings={enabled:true,promptConfig:{...defaultTreeSettings(),tagMode:'binding'}},bindings={state:()=>status,roster:()=>{assert.equal(status,'ready');return roster;},prepare:async()=>{status='loading';await new Promise(r=>release=r);status='ready';}};
 const injection=createPromptInjection({settings,bindings,context:()=>({chat:[],setExtensionPrompt:(id,text)=>calls.push(text)}),onError:e=>errors.push(e)});
 injection.update();assert.deepEqual(calls,['']);const old=injection.reload();injection.clear();roster='NEW';release();await old;assert.ok(calls.every(t=>!t.includes('OLD')));
 const ready=injection.begin();release();await ready;assert.ok(calls.at(-1).includes('NEW'));
 bindings.prepare=async()=>{status='error';throw Error('fixture HTTP 403');};await assert.rejects(injection.begin(),/403/);assert.equal(calls.at(-1),'');assert.equal(errors.length,1);
 settings.promptConfig.mode='external';await injection.reload();assert.equal(calls.at(-1),'');
});
test('current tree cleanup retains exact composed D0 and blocks conflicting retired bodies',()=>{
 const c=defaultTreeSettings();c.textOverridesById={'tags.full':{body:'CUSTOM TAG'}};c.legacyBackup={private:'obsolete'};c.treeBackup={};const expected=composePrompt(c),next=migrateTreeSettings(c);assert.equal(composePrompt(next),expected);assert.equal(next.legacyBackup,undefined);assert.equal(next.treeBackup,undefined);
 const old={...c,treeRevision:1,textOverridesById:{tags:{body:'ONE'},'tags.rules':{body:'TWO'}}},before=structuredClone(old);assert.throws(()=>migrateTreeSettings(old),/冲突/);assert.deepEqual(old,before);
});
test('disabled binding tags keep other D0 modules without loading archives',async()=>{
 const c=defaultTreeSettings();c.tagMode='binding';c.enabledById.tags=false;const calls=[];
 const injection=createPromptInjection({settings:{enabled:true,promptConfig:c},bindings:{state:()=> 'idle',prepare:()=>assert.fail('disabled tag module must not load archives'),roster:()=>assert.fail('disabled roster')},context:()=>({chat:[],setExtensionPrompt:(id,text)=>calls.push(text)}),onError:e=>assert.fail(e.message)});
 await injection.begin();assert.ok(calls.at(-1).includes('<imageTag>'));assert.equal(calls.at(-1),composePrompt(c));
});

test('custom legacy cot boundary is blocked rather than discarded',()=>{const old=structuredClone(history[0].config);old.fixed.cot_xml='CUSTOM_BOUNDARY';const before=structuredClone(old);assert.throws(()=>migrateTreeSettings(old),/无法无损/);assert.deepEqual(old,before);});
