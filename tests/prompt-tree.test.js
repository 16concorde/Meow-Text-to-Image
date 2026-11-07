import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {promptTree,treeById,treeRoots,validatePromptTree} from '../src/prompts/tree-defaults.js';
import {defaultTreeSettings,migrateTreeSettings,effectiveEnabled,withTreeText,withTreeEnabled,treeText} from '../src/prompts/tree-settings.js';
import {upgradeRevision4} from '../src/prompts/tree-migration.js';
import {composePrompt} from '../src/prompts/prompt-composer.js';
import {fixedMacroSnapshot,updateFixedMacros} from '../src/prompts/prompt-settings.js';
import {createEggMarkerCache} from '../src/profiles/easter-egg-selection.js';
import {revision4Settings} from './support/revision4-settings.js';
const source=JSON.parse(readFileSync(new URL('./support/prompt-tree-source.json',import.meta.url)));
test('new semantic registry covers every approved source slot and rejects cycles',()=>{
 assert.equal(validatePromptTree(),true);assert.deepEqual(treeRoots,['task','composition','tags','nsfw','selfcheck','output']);
 assert.deepEqual(treeById.task.children,[]);assert.equal(treeById.task.editable,false);assert.deepEqual(treeById.nsfw.children,['orientation']);assert.equal(treeById['nsfw.rules'],undefined);
 assert.deepEqual(treeById.tags.children,['tags.full','tags.binding','tags.fan','tags.egg']);
 assert.deepEqual(treeById.selfcheck.children,['selfcheck.item1','selfcheck.item2','selfcheck.egg','selfcheck.fan','selfcheck.roles.full','selfcheck.roles.binding','selfcheck.item4','selfcheck.nsfw','selfcheck.item5']);
 assert.equal(Object.keys(source).length,promptTree.reduce((n,node)=>n+Object.keys(node.slots).length,0));
 for(const {nodeId,slot,sha256} of Object.values(source))assert.equal(createHash('sha256').update(treeById[nodeId].slots[slot]).digest('hex'),sha256,nodeId);
 assert.throws(()=>{treeById.task.slots.body='changed';});const bad=structuredClone(promptTree);bad.find(n=>n.nodeId==='nsfw').condition=['selfcheck'];bad.find(n=>n.nodeId==='selfcheck').condition=['nsfw'];assert.throws(()=>validatePromptTree(bad),/循环/);
});
test('base flags, parent state, choices and per-round NSFW jointly govern runtime without mutation',()=>{
 for(let bits=0;bits<256;bits++)for(const mode of ['full','binding'])for(const orientation of ['','BG','BL','GL','INTERSEX']){
  const c=defaultTreeSettings();const [fan,egg,composition,tags,check,nsfw,matched,description]=Array.from({length:8},(_,i)=>!!(bits&(1<<i)));c.flags.fan=fan;c.tagMode=mode;c.orientation=orientation;Object.assign(c.enabledById,{egg,composition,tags,selfcheck:check,nsfw,'egg.description':description});
  const before=structuredClone(c),text=composePrompt(c,{nsfwMatched:matched,bindingRoster:'FIXTURE_ROSTER'}),eggActive=egg&&composition;
  for(const [id,expected] of [['tags.fan',fan&&tags],['tags.egg',eggActive&&tags],['selfcheck.fan',fan&&check],['selfcheck.egg',eggActive&&check],['egg.description',eggActive&&description],['nsfw',nsfw&&matched],['selfcheck.nsfw',nsfw&&matched&&check]])assert.equal(text.includes(treeById[id].slots.body),expected,id);
  assert.equal(text.includes('以及彩蛋插图 1 张'),eggActive);assert.equal(text.includes('（这里`'),false);
  assert.equal(text.includes('FIXTURE_ROSTER'),tags&&mode==='binding');
  for(const value of ['BG','BL','GL','INTERSEX'])assert.equal(text.includes(treeById['orientation.'+value.toLowerCase()].slots.body),nsfw&&matched&&value===orientation);
  assert.equal(text.includes(treeById['selfcheck.roles.'+mode].slots.body),check);assert.deepEqual(c,before);
 }
});
test('fixed task is enforced on updates and imports; previews interpolate without changing source',()=>{
 const c=defaultTreeSettings(),source=treeById.task.slots.body;c.params.count='4';c.params.eggMarker='/FIXTURE';const text=composePrompt(c);assert.ok(text.includes('数量为 4 张'));assert.ok(text.includes('/FIXTURE 标记之后'));assert.equal(treeById.task.slots.body,source);
 assert.throws(()=>withTreeText(c,'task',{body:'OVERRIDE'}),/不可编辑/);assert.throws(()=>composePrompt({...c,textOverridesById:{task:{body:'IMPORT'}}}),/不可编辑/);assert.throws(()=>withTreeEnabled(c,'task',false));
 let next=withTreeEnabled(c,'egg.description',false);next=withTreeEnabled(next,'egg',false);next=withTreeEnabled(next,'egg',true);assert.equal(effectiveEnabled(next,'egg.description'),false);
 const custom=withTreeText(c,'composition',{body:'CUSTOM {{user}}'});assert.ok(composePrompt(custom).includes('CUSTOM {{user}}'));assert.equal(treeText(withTreeText(custom,'composition',treeById.composition.slots),'composition'),treeById.composition.slots.body);
});
test('migration preserves exact old payload, choice and custom semantics; retired text blocks migration and keeps the original payload',()=>{
 const old=revision4Settings();old.enabledById['task.fan']=false;old.enabledById['egg.description']=false;old.enabledById['nsfw.rules']=false;old.enabledById.nsfw=true;old.tagMode='binding';old.orientation='BL';old.nsfwTrigger.keywords=[];old.textOverridesById={'nsfw.rules':{body:'CUSTOM RULE'},composition:{body:'CUSTOM SCENE'}};
 const before=structuredClone(old),next=migrateTreeSettings(old);assert.deepEqual(old,before);assert.equal(next.migrationArchive,undefined);assert.equal(next.flags.fan,false);assert.equal(next.enabledById.nsfw,false);assert.equal(next.enabledById['egg.description'],false);assert.equal(next.tagMode,'binding');assert.equal(next.orientation,'BL');assert.deepEqual(next.nsfwTrigger.keywords,[]);assert.equal(next.textOverridesById.nsfw.body,'CUSTOM RULE');assert.equal(next.textOverridesById.composition.body,'CUSTOM SCENE');assert.equal(migrateTreeSettings(next),next);
 old.textOverridesById.task={prefix:'CUSTOM TASK'};old.textOverridesById['selfcheck.item3']={body:'RETIRED CHECK'};assert.throws(()=>migrateTreeSettings(old),e=>e.status==='migration-conflict');assert.deepEqual(old.textOverridesById.task,{prefix:'CUSTOM TASK'});assert.deepEqual(old.textOverridesById['selfcheck.item3'],{body:'RETIRED CHECK'});
 const unknown={...old,treeRevision:99};assert.throws(()=>migrateTreeSettings(unknown));
});
test('fixed macros expose only count and marker and the cache resolves a stable parameter ID',async()=>{
 let c=defaultTreeSettings();const snap=fixedMacroSnapshot(c);assert.deepEqual(snap.macros.map(n=>n.id),['count','eggMarker']);c=updateFixedMacros(c,snap,{count:'3',eggMarker:'/NEW'});assert.equal(c.params.count,'3');const cache=createEggMarkerCache({read:()=>fixedMacroSnapshot(c),key:()=>c.params.eggMarker});assert.equal(await cache.read(),'/NEW');
});
test('output is a single continuous format and selfcheck formats close as a pair',()=>{
 const c=defaultTreeSettings();c.enabledById['output.subtitle']=true;assert.ok(composePrompt(c).includes('【每个配图的正确完整格式】\n<imgthink>\n与当前画面对应的思考过程。\n</imgthink>\n┈┈[胡里花哨的符号+本次绘画的主题文字+可爱颜文字]┈┈\nimage###\n[图片tag]\n###'));
 const off=withTreeEnabled(c,'selfcheck',false);assert.ok(!composePrompt(off).includes('<imgthink>'));assert.throws(()=>withTreeText(c,'selfcheck',{suffix:''}),/成对/);
});

test('old order is normalized without resetting nonzero depth and historical fields stay passive',async()=>{
 const {promptConfigForComparison}=await import('../src/prompts/tree-settings.js'),old=defaultTreeSettings();old.injection={depth:7,order:888};old.migrationArchive={fixture:'passive legacy value'};const before=structuredClone(old),next=migrateTreeSettings(old);assert.deepEqual(old,before);assert.deepEqual(next.injection,{depth:7});assert.deepEqual(next.migrationArchive,old.migrationArchive);assert.equal(promptConfigForComparison(next).migrationArchive,undefined);assert.equal(migrateTreeSettings(next),next);
 const custom=revision4Settings();custom.params.persona='CUSTOM_PERSONA';const untouched=structuredClone(custom);assert.throws(()=>migrateTreeSettings(custom),/params.persona/);assert.deepEqual(custom,untouched);
});
