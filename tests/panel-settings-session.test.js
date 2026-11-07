import test from 'node:test';
import assert from 'node:assert/strict';
import {createSettingsPanelSession} from '../src/ui/settings-panel-session.js';
import {applyConfigPatch,mergePromptChanges} from '../src/prompts/prompt-patches.js';
import {panelSettingsPatch} from '../src/platform/panel-settings-patches.js';
test('panel fields are drafts until confirmed, interleaved edits keep their profile identity and runtime is not optimistic',async()=>{
 const runtime={profiles:[{id:'fixture',name:'original',negative:'old'}],active:0,promptConfig:{fixture:true}},writes=[];let release;
 const session=createSettingsPanelSession({settings:runtime,persist:async patch=>{writes.push(patch);await new Promise(r=>release=r);Object.assign(runtime,applyConfigPatch(runtime,patch));}}),profile=session.view.profiles[0];
 profile.name='edited';const pending=session.request();await new Promise(setImmediate);assert.equal(runtime.profiles[0].name,'original');profile.negative='new';session.request();release();await new Promise(setImmediate);assert.equal(runtime.profiles[0].name,'edited');assert.equal(runtime.profiles[0].negative,'old');release();await pending;await session.flush();assert.equal(runtime.profiles[0].negative,'new');assert.equal(session.view.profiles[0],profile);assert.equal(writes.length,2);session.dispose();
});
test('failed confirmation retains the local draft and retry saves without a second object',async()=>{
 const runtime={profiles:[{id:'fixture',name:'original'}]};let failed=true;const session=createSettingsPanelSession({settings:runtime,persist:async patch=>{if(failed)throw Error('fixture save failed');Object.assign(runtime,applyConfigPatch(runtime,patch));}});session.view.profiles[0].name='draft';await assert.rejects(session.request(),/failed/);assert.equal(runtime.profiles[0].name,'original');assert.equal(session.view.profiles[0].name,'draft');failed=false;await session.retry();assert.equal(runtime.profiles.length,1);assert.equal(runtime.profiles[0].name,'draft');session.dispose();
});
test('independent profile fields merge, changed profile order conflicts before index-based patches can target another object',()=>{
 const base={profiles:[{id:'a',name:'A',negative:'old'},{id:'b',name:'B'}]},ours=structuredClone(base),remote=structuredClone(base);ours.profiles[0].name='new';remote.profiles[0].negative='remote';const merged=mergePromptChanges(base,remote,ours,panelSettingsPatch);assert.equal(merged.profiles[0].name,'new');assert.equal(merged.profiles[0].negative,'remote');remote.profiles.reverse();assert.throws(()=>mergePromptChanges(base,remote,ours,panelSettingsPatch),e=>e.status==='conflicted');
});

test('explicit conflict resolution keeps local edited fields and unrelated remote fields',async()=>{
 const runtime={profiles:[{id:'a',name:'old',negative:'old'}]};let remote={profiles:[{id:'a',name:'remote',negative:'remote'}]},attempts=0;const session=createSettingsPanelSession({settings:runtime,persist:async(patch,base)=>{if(!attempts++){const error=Error('conflict');error.latest=remote;throw error;}assert.equal(base.profiles[0].name,'remote');Object.assign(runtime,applyConfigPatch(remote,patch));}});session.view.profiles[0].name='ours';await assert.rejects(session.request(),/conflict/);assert.equal(session.canResolveConflict(),true);await session.resolveConflict();assert.deepEqual(runtime.profiles,[{id:'a',name:'ours',negative:'remote'}]);session.dispose();
});
