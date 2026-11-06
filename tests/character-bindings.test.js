import test from 'node:test';
import assert from 'node:assert/strict';
import {bindingIdentity,emptyBindingArchive,editBinding,validateBindingArchive,activeBindings,bindingSwitchKey,bindingRoster,SWITCH_KEY} from '../src/profiles/character-bindings.js';
import {defaultTreeSettings,migrateTreeSettings,withTreeEnabled} from '../src/prompts/tree-settings.js';
import {composeTreePrompt} from '../src/prompts/tree-composer.js';
import {treeById} from '../src/prompts/tree-defaults.js';
import {createPromptInjection} from '../src/platform/prompt-injection.js';
const owner={type:'card',stableKey:'card-a.png'},fields={name:'Fixture',aliases:['F','F'],positive:'boy, black hair',negative:'blue hair'};
test('owner identity follows real avatar files, never names or array indexes; group is unsupported',()=>{
 const c={characters:[{avatar:'card-a.png',name:'A'}],characterId:0,name1:'Same',chatId:'a'};
 const a=bindingIdentity(c,'persona-a.png');c.characters.unshift({avatar:'other.png'});c.characterId=1;c.characters[1].name='Renamed';c.name1='Renamed';c.chatId='b';
 assert.deepEqual(bindingIdentity(c,'persona-a.png').owners.map(o=>[o.type,o.stableKey]),a.owners.map(o=>[o.type,o.stableKey]));
 for(const avatar of ['renamed.png','imported.png','copy.png','new-avatar.png']){c.characters[1].avatar=avatar;assert.notEqual(bindingIdentity(c,'persona-a.png').owners[1].stableKey,a.owners[1].stableKey);}
 assert.notDeepEqual(bindingIdentity(c,'persona-b.png').owners[0],a.owners[0]);
 assert.equal(bindingIdentity({...c,groupId:'group'},'persona-a.png').unsupported,true);
 assert.deepEqual(bindingIdentity({},'').owners,[]);assert.throws(()=>bindingIdentity(c,'../avatar'));
});
test('immutable IDs survive edit, archive, list order, and never reuse sequence numbers',()=>{
 let a=editBinding(emptyBindingArchive(owner),fields);const first=structuredClone(a.bindings[0]);
 a=editBinding(a,{...fields,name:'Renamed',aliases:['Alias'],archived:true},first.uuid);a=editBinding(a,fields);a.bindings.reverse();
 assert.equal(a.bindings[1].shortId,'C01');assert.equal(a.bindings[1].uuid,first.uuid);assert.equal(a.bindings[1].revision,2);assert.equal(a.bindings[0].shortId,'C02');assert.equal(a.nextSequence,3);
 const u=editBinding(emptyBindingArchive({type:'user',stableKey:'persona.png'}),fields);assert.equal(u.bindings[0].shortId,'U01');
 assert.deepEqual(first.aliases,['F']);for(const change of [b=>b.nextSequence=1,b=>b.bindings.push(b.bindings[0]),b=>b.bindings[0].positive='',b=>b.bindings[0].negative=7,b=>b.bindings[0].shortId='C00']){const broken=structuredClone(a);change(broken);assert.throws(()=>validateBindingArchive(broken));}
});
test('chat differences override one UUID and automatically inherit new bindings',()=>{
 let a=editBinding(emptyBindingArchive(owner),fields);a=editBinding(a,{...fields,name:'Second'});
 const k=bindingSwitchKey(owner,a.bindings[0]),metadata={[SWITCH_KEY]:{schemaVersion:1,values:{[k]:false}}};
 assert.deepEqual(activeBindings([a],metadata).map(b=>b.enabled),[false,true]);assert.deepEqual(activeBindings([a],{}).map(b=>b.enabled),[true,true]);
 a=editBinding(a,fields);assert.deepEqual(activeBindings([a],metadata).map(b=>b.enabled),[false,true,true]);delete metadata[SWITCH_KEY].values[k];assert.equal(activeBindings([a],metadata)[0].enabled,true);
 const text=bindingRoster(activeBindings([a],metadata));assert.ok(text.includes('C01 = Fixture'));assert.ok(!text.includes(fields.positive));assert.ok(!text.includes(fields.negative));
});
test('02 choices stay mutually exclusive through parent switches and all old revisions migrate losslessly',()=>{
 let c=defaultTreeSettings(),full=treeById['tags.full'].slots.body,bound=treeById['tags.binding'].slots.body;
 assert.ok(composeTreePrompt(c).includes(full));assert.ok(!composeTreePrompt(c).includes(bound));c.tagMode='binding';
 assert.ok(!composeTreePrompt(c).includes(full));assert.ok(composeTreePrompt(c,{bindingRoster:'U01 = Fixture'}).includes('U01 = Fixture'));
 c=withTreeEnabled(c,'tags',false);assert.ok(!composeTreePrompt(c).includes(bound));c=withTreeEnabled(c,'tags',true);assert.equal(c.tagMode,'binding');assert.ok(composeTreePrompt(c).includes(bound));
 for(const revision of [1,2,3]){const old={...defaultTreeSettings(),treeRevision:revision,textOverridesById:{tags:{body:'OLD CUSTOM'},composition:{body:'OTHER'}},nsfwTrigger:{keywords:['KEEP']}};const next=migrateTreeSettings(old);assert.equal(next.treeRevision,4);assert.equal(next.tagMode,'full');assert.equal(next.textOverridesById['tags.full'].body,'OLD CUSTOM');assert.equal(next.textOverridesById.composition.body,'OTHER');assert.deepEqual(next.nsfwTrigger.keywords,['KEEP']);assert.equal(next.textOverridesById.tags,undefined);}
});
test('revision 1 retains both conflicting legacy tag texts without copying the whole settings document',()=>{
 const old={...defaultTreeSettings(),treeRevision:1,textOverridesById:{tags:{body:'PARENT CUSTOM'},'tags.rules':{body:'RULES CUSTOM'}}};
 const next=migrateTreeSettings(old);assert.equal(next.textOverridesById['tags.full'].body,'RULES CUSTOM');assert.equal(next.treeBackup.retiredText.tagsBody,'PARENT CUSTOM');assert.equal(next.treeBackup.config,undefined);
});
test('D0 clears stale rosters on load failure and awaits preparation before sending',async()=>{
 let roster='C01 = Fixture',ready=false,release;const injected=[],errors=[];
 const settings={enabled:true,promptConfig:{...defaultTreeSettings(),tagMode:'binding'}};
 const injection=createPromptInjection({context:()=>({chat:[],setExtensionPrompt:(id,text)=>injected.push(text)}),settings,onError:e=>errors.push(e.message),bindings:{roster(){if(!ready)throw Error('not ready');return roster;},prepare:()=>new Promise(r=>release=()=>{ready=true;r();})}});
 const pending=injection.begin();assert.equal(injected.length,0);release();await pending;assert.ok(injected.at(-1).includes(roster));
 ready=false;assert.throws(()=>injection.update(),/not ready/);assert.equal(injected.at(-1),'');assert.equal(errors.length,1);
 settings.promptConfig.mode='external';assert.equal(injection.update(),'');
 const rejected=createPromptInjection({context:()=>({chat:[],setExtensionPrompt:(id,text)=>injected.push(text)}),settings:{...settings,promptConfig:{...settings.promptConfig,mode:'builtin'}},onError:e=>errors.push(e.message),bindings:{prepare:async()=>{throw Error('V3 not supported');}}});
 await assert.rejects(rejected.begin(),/V3/);assert.equal(injected.at(-1),'');assert.equal(errors.at(-1),'V3 not supported');
});
