import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {defaultNsfwKeywords,validateNsfwKeywords,matchNsfwKeywords,getNsfwActivationText} from '../src/prompts/nsfw-trigger.js';
import {defaultPromptSettings,defaultLegacyPromptSettings} from '../src/prompts/prompt-settings.js';
import {migrateTreeSettings,withNsfwKeywords,withTreeEnabled,withTreeText} from '../src/prompts/tree-settings.js';
import {treeById} from '../src/prompts/tree-defaults.js';
import {composePrompt} from '../src/prompts/prompt-composer.js';
import {createPromptInjection,bindPromptInjection,PROMPT_ID} from '../src/platform/prompt-injection.js';

test('default tags retain source order; literal OR, folding and known single-character matches',()=>{
 const book=JSON.parse(readFileSync(new URL('../assets/worldbook.json',import.meta.url)));const source=Object.values(book.entries).find(n=>n.comment==='NSFW提示词');assert.deepEqual([...defaultNsfwKeywords],source.key);
 assert.equal(matchNsfwKeywords('nSfW scene',defaultNsfwKeywords),true);assert.equal(matchNsfwKeywords('操作',defaultNsfwKeywords),true);assert.equal(matchNsfwKeywords('操作',defaultNsfwKeywords.filter(w=>w!=='操')),false);
 assert.equal(matchNsfwKeywords('normal',defaultNsfwKeywords),false);assert.equal(matchNsfwKeywords('NSFW',defaultNsfwKeywords.filter(w=>w!=='NSFW')),false);
 assert.equal(matchNsfwKeywords('任意亲密场景',['other','亲密场景']),true);assert.equal(matchNsfwKeywords('axb',['a.b']),false);assert.equal(matchNsfwKeywords('a.b',['a.b']),true);assert.equal(matchNsfwKeywords('anything',['/x/i']),false);assert.equal(matchNsfwKeywords('/x/i',['/x/i']),true);assert.equal(matchNsfwKeywords('anything',[]),false);
 assert.equal(matchNsfwKeywords('ＮＳＦＷ',['NSFW']),false);assert.equal(matchNsfwKeywords('做愛',['做爱']),false);
});
test('keywords validate before saving, preserve display text and protect other state',()=>{
 for(const invalid of [null,'NSFW',[''],['  '],['A',' a '],['x'.repeat(65)],['a\nb'],Array.from({length:65},(_,i)=>String(i))])assert.throws(()=>validateNsfwKeywords(invalid));
 const config=defaultPromptSettings(),before=structuredClone(config),next=withNsfwKeywords(config,[' A.b ','亲密']);assert.deepEqual(config,before);assert.deepEqual(next.nsfwTrigger.keywords,[' A.b ','亲密']);assert.equal(matchNsfwKeywords('a.b',next.nsfwTrigger.keywords),true);assert.deepEqual(next.enabledById,config.enabledById);assert.deepEqual(next.textOverridesById,config.textOverridesById);assert.equal(next.orientation,config.orientation);
 assert.deepEqual(withNsfwKeywords(config,[]).nsfwTrigger.keywords,[]);
});
test('scan last two valid message bodies, count greeting, exclude systems and replaced tails',()=>{
 const chat=[{mes:'old NSFW',is_user:true},{mes:'greeting'},{mes:'system NSFW',is_system:true},{mes:' '},{mes:'user',is_user:true},{mes:'card NSFW',extra:{miao_display_only:true}},{mes:'assistant',name:'NSFW',extra:{title:'NSFW',reasoning:'NSFW'}}];
 assert.equal(getNsfwActivationText(chat),'user\nassistant');assert.equal(getNsfwActivationText(chat,'continue'),'user\nassistant');assert.equal(getNsfwActivationText(chat,'swipe'),'greeting\nuser');assert.equal(getNsfwActivationText(chat,'regenerate'),'greeting\nuser');
 assert.equal(getNsfwActivationText([{mes:'first greeting'}]),'first greeting');assert.equal(getNsfwActivationText([]),'');assert.equal(getNsfwActivationText([{mes:'NSFW',is_system:true}]),'');
});
test('one runtime gate opens rules, selected orientation and check together without altering manual settings',()=>{
 for(const armed of [false,true])for(const matched of [false,true])for(const rules of [false,true])for(const check of [false,true])for(const orientation of ['','BG','BL','GL','INTERSEX']){
  let c=defaultPromptSettings();c=withTreeEnabled(c,'nsfw',armed);c=withTreeEnabled(c,'nsfw.rules',rules);c=withTreeEnabled(c,'selfcheck',check);c.orientation=orientation;
  c=withTreeText(c,'nsfw.rules',{body:'PRIVATE_RULE'});c=withTreeText(c,'selfcheck.nsfw',{body:'PRIVATE_CHECK'});const before=structuredClone(c),text=composePrompt(c,{nsfwMatched:matched});
  assert.equal(text.includes('PRIVATE_RULE'),armed&&matched&&rules);assert.equal(text.includes('PRIVATE_CHECK'),armed&&matched&&check);
  for(const choice of ['BG','BL','GL','INTERSEX'])assert.equal(text.includes(treeById['orientation.'+choice.toLowerCase()].slots.body),armed&&matched&&orientation===choice);
  assert.deepEqual(c,before);
  if(!matched)assert.equal(text,composePrompt(withTreeEnabled(c,'nsfw',false),{nsfwMatched:true}));
 }
 const c=withTreeEnabled(defaultPromptSettings(),'nsfw',true);assert.equal(composePrompt(c).includes(treeById['nsfw.rules'].slots.body),false);assert.equal(composePrompt({...c,mode:'external'},{nsfwMatched:true}),'');
});
test('revision 1/2/3 migration is idempotent and preserves existing trigger lists and backups',()=>{
 const c=defaultPromptSettings();assert.equal(c.treeRevision,4);assert.deepEqual(c.nsfwTrigger.keywords,[...defaultNsfwKeywords]);
 for(const treeRevision of [undefined,1,2]){
  const old={...c,treeRevision,nsfwTrigger:{keywords:[]},legacyBackup:{fixture:'keep'},treeBackup:{fixture:'keep'}};const before=structuredClone(old),next=migrateTreeSettings(old);assert.deepEqual(old,before);assert.deepEqual(next.nsfwTrigger.keywords,[]);assert.deepEqual(next.legacyBackup,old.legacyBackup);assert.deepEqual(next.treeBackup,old.treeBackup);assert.equal(migrateTreeSettings(next),next);
  const missing={...old};delete missing.nsfwTrigger;assert.deepEqual(migrateTreeSettings(missing).nsfwTrigger.keywords,[...defaultNsfwKeywords]);
 }
 const bad={...c,nsfwTrigger:{keywords:null}},before=structuredClone(bad);assert.throws(()=>migrateTreeSettings(bad));assert.deepEqual(bad,before);const repaired=withNsfwKeywords(bad,[...defaultNsfwKeywords]);assert.deepEqual(repaired.nsfwTriggerBackup,bad.nsfwTrigger);
 const legacy={...defaultLegacyPromptSettings(),overrides:{main:'legacy custom'}};assert.equal(migrateTreeSettings(legacy),legacy);
});
test('event boundary captures new input before prompt construction, freezes streams and clears chats',()=>{
 const handlers=new Map(),source={on:(name,fn)=>{const a=handlers.get(name)||[];a.push(fn);handlers.set(name,a);}},names=['CHAT_CHANGED','CHAT_LOADED','MESSAGE_SENT','USER_MESSAGE_RENDERED','MESSAGE_DELETED','MESSAGE_EDITED','MESSAGE_UPDATED','MESSAGE_SWIPED','GENERATION_AFTER_COMMANDS','GENERATION_ENDED','GENERATION_STOPPED'];
 const eventTypes=Object.fromEntries(names.map(n=>[n,n])),emit=(name,...args)=>{for(const f of handlers.get(name)||[])f(...args);};let chat=[{is_user:true,mes:'safe'}],calls=[],scans=0;
 const settings={enabled:true,promptConfig:withTreeEnabled(defaultPromptSettings(),'nsfw',true)},injection=createPromptInjection({settings,context:()=>({chat,setExtensionPrompt:(...args)=>calls.push(args)}),onError:()=>assert.fail('unexpected injection error'),match:(text,keywords)=>{scans++;return matchNsfwKeywords(text,keywords);}});
 bindPromptInjection({source,eventTypes,injection});const active=()=>calls.at(-1)[1].includes(treeById['nsfw.rules'].slots.body);
 emit('GENERATION_AFTER_COMMANDS','normal');assert.equal(active(),false);chat.push({is_user:true,mes:'NSFW'});emit('MESSAGE_SENT',1);assert.equal(active(),true);const count=scans;emit('USER_MESSAGE_RENDERED',1);assert.equal(scans,count);
 chat.push({mes:'safe streamed reply'});emit('MESSAGE_UPDATED',2);injection.update();assert.equal(active(),true);chat.at(-1).mes='more stream';assert.equal(scans,count);
 emit('GENERATION_ENDED');chat=[{is_user:true,mes:'safe'},{mes:'safe'}];emit('GENERATION_AFTER_COMMANDS','normal');assert.equal(active(),false);
 chat=[{is_user:true,mes:'safe'},{mes:'NSFW old reply'}];emit('GENERATION_AFTER_COMMANDS','regenerate');assert.equal(active(),false);chat.pop();emit('MESSAGE_DELETED',1);assert.equal(active(),false);
 chat=[{is_user:true,mes:'safe'},{mes:'NSFW old swipe'}];emit('GENERATION_AFTER_COMMANDS','swipe');assert.equal(active(),false);emit('GENERATION_AFTER_COMMANDS','continue');assert.equal(active(),true);
 chat=[{mes:'safe in B'}];emit('CHAT_CHANGED');assert.equal(active(),false);chat=[{mes:'NSFW in A'}];emit('CHAT_LOADED');assert.equal(active(),true);
 settings.promptConfig=withNsfwKeywords(settings.promptConfig,[]);injection.update();assert.equal(active(),false);settings.promptConfig=withNsfwKeywords(settings.promptConfig,['NSFW']);injection.update();assert.equal(active(),true);
 settings.promptConfig={...settings.promptConfig,mode:'external'};injection.update();assert.equal(calls.at(-1)[1],'');settings.promptConfig={...settings.promptConfig,mode:'builtin'};settings.enabled=false;injection.update();assert.equal(calls.at(-1)[1],'');
 assert.ok(calls.every(c=>c[0]===PROMPT_ID&&JSON.stringify(c.slice(2))==='[1,0,false,0]'));
});

test('configured keywords, node bodies and display metadata cannot self-activate D0',()=>{
 const config=withTreeEnabled(defaultPromptSettings(),'nsfw',true);config.params.persona='NSFW';config.textOverridesById={'nsfw.rules':{body:'NSFW RULE'},'selfcheck.nsfw':{body:'NSFW CHECK'}};
 const calls=[],settings={enabled:true,promptConfig:config};
 const injection=createPromptInjection({settings,context:()=>({chat:[{mes:'safe',name:'NSFW',extra:{title:'NSFW'}}],setExtensionPrompt:(...args)=>calls.push(args)}),onError:()=>assert.fail('unexpected error')});
 const text=injection.update();assert.ok(text.includes('NSFW，这是附加'));assert.ok(!text.includes('NSFW RULE'));assert.ok(!text.includes('NSFW CHECK'));assert.deepEqual(settings.promptConfig,config);
});
