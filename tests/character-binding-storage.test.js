import test from 'node:test';
import assert from 'node:assert/strict';
import {bindingFixture} from './support/character-binding-fixture.js';
import {editBinding,bindingSwitchKey,SWITCH_KEY} from '../src/profiles/character-bindings.js';
import {SNAPSHOTS_KEY,snapshotSlot} from '../src/profiles/character-bindings-session.js';
import {parseBodyBlocks,defaults,buildRequest} from '../src/core/core.js';
const fields={name:'Fixture',aliases:[],positive:'boy, silver hair',negative:'black hair'};
async function populated(){const f=bindingFixture();await f.session.load();const a=f.session.current().entries.find(e=>e.archive.owner.type==='card').archive;await f.session.saveArchive(editBinding(a,fields));return f;}
function message(f,prompt='scene | C01, smiling'){const m={mes:'image###'+prompt+'###',swipe_id:0};f.context.chat.push(m);return {m,b:parseBodyBlocks(m.mes,'image###([\\s\\S]*?)###')[0]};}
test('404 creates only an in-memory template; uploads use hashed user files, never settings',async()=>{
 const f=bindingFixture();await f.session.load();assert.equal(f.files.size,0);assert.equal(f.session.current().entries.length,2);
 const a=f.session.current().entries[0].archive;await f.session.saveArchive(editBinding(a,fields));assert.equal(f.files.size,3);assert.ok([...f.files.keys()].some(k=>k.includes('recovery-v2')));assert.ok([...f.files.keys()].some(k=>k.includes('operation-v2')));assert.match([...f.files.keys()].find(k=>k.includes('miao-character-user-v1-')),/^\/user\/files\/miao-character-user-v1-[a-f0-9]{64}\.json$/);
 assert.ok(!JSON.stringify(f.config).includes(fields.positive));assert.ok(!JSON.stringify(f.context.chatMetadata).includes(fields.positive));
});
test('HTTP failures, corrupt JSON, and failed uploads never overwrite old archives',async()=>{
 const f=await populated(),path=[...f.files.keys()].find(k=>k.includes('miao-character-card-v1-')),original=f.files.get(path);
 f.session.invalidate();f.failRead=403;await assert.rejects(f.session.load(),/HTTP 403/);assert.equal(f.files.get(path),original);
 f.failRead=0;f.files.set(path,'bad JSON');await assert.rejects(f.session.load(),/JSON/);f.files.set(path,original);await f.session.load();
 const a=f.session.current().entries.find(e=>e.archive.owner.type==='card').archive;f.failWrite=true;await assert.rejects(f.session.saveArchive(editBinding(a,{name:'Changed'},a.bindings[0].uuid)),/HTTP 500/);assert.equal(f.files.get(path),original);assert.equal(f.session.rows()[0].name,'Fixture');
});
test('save detects another tab hash, serializes writes, and forbids reassigning identities',async()=>{
 const f=await populated(),a=f.session.current().entries.find(e=>e.archive.owner.type==='card').archive;
 const next=editBinding(a,{name:'First'},a.bindings[0].uuid);
 await Promise.all([f.session.saveArchive(next),assert.rejects(f.session.saveArchive(editBinding(a,{name:'Second'},a.bindings[0].uuid)),/其它窗口/)]);
 const bad=structuredClone(f.session.current().entries.find(e=>e.archive.owner.type==='card').archive);bad.bindings=[];await assert.rejects(f.session.saveArchive(bad),/历史角色身份/);
});
test('global defaults and chat-only differences are independent and metadata failures roll back',async()=>{
 const f=await populated(),row=f.session.rows()[0],k=bindingSwitchKey(row.owner,row);
 await f.session.saveSwitches({[k]:false},'chat');assert.equal(f.session.rows()[0].enabled,false);assert.equal(f.session.current().entries.find(e=>e.archive.owner.type==='card').archive.bindings[0].defaultEnabled,true);
 const saved=structuredClone(f.context.chatMetadata);f.context.chatMetadata={};f.context.chatId='chat-b';await f.session.load();assert.equal(f.session.rows()[0].enabled,true);
 f.context.chatMetadata=saved;f.context.chatId='chat-a';await f.session.load();await f.session.saveSwitches({[k]:'inherit'},'chat');assert.equal(f.session.rows()[0].enabled,true);
 f.failMetadata=true;await assert.rejects(f.session.saveSwitches({[k]:false},'chat'));assert.deepEqual(f.context.chatMetadata[SWITCH_KEY].values,{});f.failMetadata=false;
 await f.session.saveSwitches({[k]:false},'global');assert.equal(f.session.rows()[0].enabled,false);assert.ok(!JSON.stringify(f.context.chatMetadata).includes('silver hair'));
});
test('stale concurrent owner loads never populate a different persona or card',async()=>{
 const f=bindingFixture(),old=f.session.load();f.persona='persona-b.png';f.context.characters[0].avatar='card-b.png';const latest=f.session.load();await assert.rejects(old,/切换|过期/);await latest;
 assert.deepEqual(f.session.current().identity.owners.map(o=>o.stableKey),['persona-b.png','card-b.png']);f.persona='';f.context.characterId=undefined;await f.session.load();assert.deepEqual(f.session.rows(),[]);
});
test('complete but ungenerated tags freeze appearance; edit/archive/owner switch cannot replace history',async()=>{
 const f=await populated(),{m,b}=message(f);await f.session.accept(m,b);const ref=m[SNAPSHOTS_KEY][snapshotSlot(0,b)];assert.equal(typeof ref.ref,'string');assert.ok(!JSON.stringify(m[SNAPSHOTS_KEY]).includes('smiling'));
 let a=f.session.current().entries.find(e=>e.archive.owner.type==='card').archive;await f.session.saveArchive(editBinding(a,{...fields,name:'Renamed',positive:'boy, red hair',archived:true},a.bindings[0].uuid));
 f.persona='other-persona.png';f.context.characters[0].avatar='other-card.png';await f.session.load();const frozen=await f.session.resolve(m,b),request=buildRequest(defaults,b.prompt,frozen);assert.deepEqual(request.naiCharacters,['boy, silver hair, smiling']);assert.deepEqual(request.naiCharacterNegatives,['black hair']);
 assert.equal(m[SNAPSHOTS_KEY][snapshotSlot(0,b)],ref);const snapshotPath=[...f.files.keys()].find(k=>k.includes('snapshot'));f.files.delete(snapshotPath);await assert.rejects(f.session.resolve(m,b),/不可还原/);
});
test('missing history requires explicit association, and snapshot/chat save failures do not queue',async()=>{
 const f=await populated(),{m,b}=message(f);await assert.rejects(f.session.resolve(m,b),/没有快照/);
 f.failWrite=true;await assert.rejects(f.session.accept(m,b),/HTTP 500/);assert.equal(m[SNAPSHOTS_KEY],undefined);
 f.failWrite=false;f.failChat=true;await assert.rejects(f.session.accept(m,b),/chat save/);assert.equal(m[SNAPSHOTS_KEY][snapshotSlot(0,b)],undefined);
 f.failChat=false;await f.session.accept(m,b,{reassociate:true});assert.equal((await f.session.resolve(m,b))[0].shortId,'C01');
});
test('identical tags in separate floors/swipes are distinct and changed prefixes fail safely',async()=>{
 const f=await populated(),first=message(f),second=message(f);await f.session.accept(first.m,first.b);await f.session.accept(second.m,second.b);assert.notEqual(first.m[SNAPSHOTS_KEY][snapshotSlot(0,first.b)].ref,second.m[SNAPSHOTS_KEY][snapshotSlot(0,second.b)].ref);
 const oldRef=first.m[SNAPSHOTS_KEY][snapshotSlot(0,first.b)].ref;first.m.swipe_id=1;await assert.rejects(f.session.resolve(first.m,first.b));await f.session.accept(first.m,first.b);assert.notEqual(first.m[SNAPSHOTS_KEY][snapshotSlot(1,first.b)].ref,oldRef);
 first.m.mes='changed prefix '+first.m.mes;const changed=parseBodyBlocks(first.m.mes,'image###([\\s\\S]*?)###')[0];await assert.rejects(f.session.resolve(first.m,changed),/不可还原/);
});
test('switching chat during snapshot upload leaves the new chat untouched',async()=>{
 const f=await populated(),{m,b}=message(f);let release,started;const begun=new Promise(r=>started=r);f.beforeUpload=()=>new Promise(r=>{release=r;started();});const promise=f.session.accept(m,b);await begun;f.context.chatId='new-chat';release();await assert.rejects(promise,/切换/);assert.equal(m[SNAPSHOTS_KEY],undefined);
});
test('V3 candidates and external/full modes cannot accept new binding output',async()=>{
 const f=await populated(),{m,b}=message(f);f.models=['nai-diffusion-4-5-full','nai-diffusion-3'];await assert.rejects(f.session.prepare(),/V3/);f.models=['nai-diffusion-4-5-full'];
 for(const config of [{...f.config,mode:'external'},{...f.config,tagMode:'full'}]){f.config=config;await assert.rejects(f.session.accept(m,b),/绑定模式/);}
});
test('D0 frozen bindings survive edits before tag completion, but never cross owners',async()=>{
 const f=await populated(),frozen=structuredClone(f.session.rows()),{m,b}=message(f);
 const a=f.session.current().entries.find(e=>e.archive.owner.type==='card').archive;await f.session.saveArchive(editBinding(a,{positive:'boy, CHANGED'},a.bindings[0].uuid));
 await f.session.accept(m,b,{frozenBindings:frozen});assert.equal((await f.session.resolve(m,b))[0].positive,fields.positive);
 const other=message(f);f.context.characters[0].avatar='different.png';await f.session.load();await assert.rejects(f.session.accept(other.m,other.b,{frozenBindings:frozen}),/归属已切换/);
});
test('duplicate tags within one message use separate immutable references',async()=>{
 const f=await populated(),raw='image###scene | C01, smiling###',m={mes:raw+'\n'+raw,swipe_id:0};f.context.chat.push(m);
 const blocks=parseBodyBlocks(m.mes,'image###([\\s\\S]*?)###');await Promise.all(blocks.map(b=>f.session.accept(m,b)));
 const refs=Object.values(m[SNAPSHOTS_KEY]);assert.equal(refs.length,2);assert.notEqual(refs[0].ref,refs[1].ref);assert.ok(!JSON.stringify(m[SNAPSHOTS_KEY]).includes('C01'));
});
