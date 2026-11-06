import test from 'node:test';
import assert from 'node:assert/strict';
import {managementFixture} from './support/character-binding-management-fixture.js';
import {emptyBindingArchive,editBinding,normalizeOwnerKey,legacyOwnerKey,bindingSwitchKey,BINDING_NAMESPACE} from '../src/profiles/character-bindings.js';
import {searchOwners,createBindingLRU} from '../src/profiles/character-bindings-index.js';
import {readBindingChatObjects} from '../src/chat/character-binding-chat-settings.js';
const fields={name:'角色A',aliases:['Hero Alias'],positive:'boy, silver hair',negative:'black hair'};
async function saved(f,index=0){const target=(await f.management.list('card'))[index],empty=await f.management.open(target),entry=await f.management.save(empty,editBinding(empty.archive,fields));return {target,entry};}

test('selectors project native objects without writes; exact locators and same names remain separate',async()=>{
 const f=managementFixture(),cards=await f.management.list('card'),users=await f.management.list('user');assert.equal(cards.length,2);assert.equal(cards[0].name,cards[1].name);assert.notEqual(cards[0].locator,cards[1].locator);assert.equal(users[0].title,'Fixture Remark');assert.equal(f.requests.length,0);
 for(const raw of [' 中文#%.png ','e\u0301.png','é.png','A.PNG'])assert.equal(normalizeOwnerKey(raw),raw);assert.equal(legacyOwnerKey(' e\u0301.png '),'é.png');
 const empty=await f.management.open(cards[0]);assert.equal(empty.archive.bindings.length,0);assert.equal(f.files.size,0);assert.ok(!f.requests.some(r=>r.url==='/api/characters/merge-attributes'));
});
test('first save confirms card UUID, v2 archive, index and summary; same-name cards are isolated',async()=>{
 const f=managementFixture(),a=await saved(f,0),b=await saved(f,1);assert.notEqual(a.entry.archive.owner.ownerId,b.entry.archive.owner.ownerId);assert.equal(a.entry.archive.bindings[0].shortId,'C01');assert.equal(b.entry.archive.bindings[0].shortId,'C01');
 assert.equal(f.cards.get(a.target.locator).data.extensions.meow_t2i.ownerId,a.entry.archive.owner.ownerId);assert.ok(![...f.files.keys()].some(k=>k.includes('summary-v2')));

});
test('native rename and overwrite preserve owner/binding IDs; duplicated UUID is quarantined',async()=>{
 const f=managementFixture(),{target,entry}=await saved(f),id=entry.archive.owner.ownerId,bid=entry.archive.bindings[0].uuid;
 const old=f.cards.get(target.locator),newLocator='改名#%.png';f.cards.delete(target.locator);f.cards.set(newLocator,{...old,avatar:newLocator,name:'Renamed'});Object.assign(f.context.characters[0],{avatar:newLocator,name:'Renamed'});
 await f.host.emit({name:'CHARACTER_RENAMED',type:'card',oldLocator:target.locator,locator:newLocator});const next=(await f.management.list('card'))[0],loaded=await f.management.open(next,{fresh:true});assert.equal(loaded.archive.owner.ownerId,id);assert.equal(loaded.archive.bindings[0].uuid,bid);
 f.context.characters.push({...structuredClone(f.context.characters[0]),avatar:'copy.png'});f.cards.set('copy.png',{...structuredClone(f.cards.get(newLocator)),avatar:'copy.png'});
 await assert.rejects(f.management.open((await f.management.list('card')).at(-1)),/复制/);await f.host.emit({name:'CHARACTER_DUPLICATED',type:'card',oldLocator:newLocator,locator:'copy.png',duplicate:true});
 const copy=await f.management.open((await f.management.list('card')).at(-1));assert.notEqual(copy.archive.owner.ownerId,id);assert.equal(copy.archive.bindings.length,0);
 assert.equal((await f.storage.load(entry.archive.owner)).archive.bindings[0].uuid,bid);
});
test('migration preserves v1 binding identities, aliases, sequence and immutable old files',async()=>{
 const f=managementFixture(),target=(await f.management.list('card'))[0];let legacy=editBinding(emptyBindingArchive({type:'card',stableKey:target.locator}),fields);legacy=editBinding(legacy,{...fields,name:'Second'});const old=await f.storage.save(legacy,null),file=await f.storage.filename(legacy.owner),before=f.files.get('/user/files/'+file);
 const entry=await f.management.open(target,{fresh:true});assert.equal(entry.archive.schemaVersion,2);assert.deepEqual(entry.archive.bindings,old.archive.bindings);assert.equal(entry.archive.nextSequence,3);assert.equal(f.files.get('/user/files/'+file),before);
 f.management.invalidate();const again=await f.management.open(target,{fresh:true});assert.equal(again.archive.owner.ownerId,entry.archive.owner.ownerId);
});
test('legacy normalization collisions and swallowed card saves block migration without empty overwrites',async()=>{
 const f=managementFixture();await f.storage.save(editBinding(emptyBindingArchive({type:'card',stableKey:'card-0.png'}),fields),null);const before=f.files.size;f.context.characters.push({avatar:' card-0.png ',name:'Collision'});await assert.rejects(f.management.open((await f.management.list('card'))[0]),/规范化/);assert.equal(f.files.size,before);
 const g=managementFixture();g.swallowCard=true;await assert.rejects(saved(g),/身份尚未保存/);const pending=(await g.management.records()).find(r=>r.state==='pending');assert.ok(pending);g.swallowCard=false;
 const retry=await g.management.open((await g.management.list('card'))[0],{create:true,fresh:true});assert.equal(retry.archive.owner.ownerId,pending.ownerId);
});
test('upload interruption is confirmed by read-back without search summary writes',async()=>{
 const f=managementFixture();f.uploadThenThrow=true;const {entry}=await saved(f);assert.equal(entry.archive.bindings.length,1);assert.ok(![...f.files.keys()].some(k=>k.includes('summary-v2')));
});
test('current chat saves detect swallowed writes and preserve unknown metadata',async()=>{
 const f=managementFixture(),{entry}=await saved(f),ref=f.chatSettings.current();f.context.chatMetadata.unknown={preserved:true};await f.context.saveChat();const state=await f.chatSettings.read(ref),row=f.chatSettings.rows(state)[0],key=bindingSwitchKey(row.owner,row);
 f.swallowMetadata=true;await assert.rejects(f.chatSettings.save(state,{[key]:false}),/读回内容不一致/);f.swallowMetadata=false;
 const reread=await f.chatSettings.read(ref),savedState=await f.chatSettings.save(reread,{[key]:false});assert.equal(savedState.settings.values[key],false);assert.equal(savedState.metadata.unknown.preserved,true);assert.ok(!JSON.stringify(savedState.settings).includes(fields.positive));
});
test('ST non-current save opens exactly selected card/chat; busy hosts never switch',async()=>{
 const f=managementFixture(),{target}=await saved(f,1);f.storeChat(target.locator,'chat-b',{integrity:'fixture-b'});const ref={target,fileName:'chat-b'},state=await f.chatSettings.read(ref);assert.equal(f.context.characterId,0);assert.equal(state.persona,null);
 f.busy=true;await assert.rejects(f.chatSettings.save(state,{}),/正在生成或保存/);assert.equal(f.context.characterId,0);f.busy=false;
 await f.chatSettings.save(state,{});assert.equal(f.context.characters[f.context.characterId].avatar,target.locator);assert.equal(f.context.chatId,'chat-b');
});
test('bounded chat reader cancels after header and refuses malformed or oversized objects',async()=>{
 let cancelled=false,pulls=0;const stream=new ReadableStream({pull(c){pulls++;c.enqueue(new TextEncoder().encode(pulls===1?'[{"chat_metadata":{"integrity":"x"}},':'{"mes":"never materialized"},'));},cancel(){cancelled=true;}});
 const header=await readBindingChatObjects(new Response(stream));assert.equal(header.chat_metadata.integrity,'x');assert.equal(cancelled,true);assert.ok(pulls<4);
 await assert.rejects(readBindingChatObjects(Response.json({})),/格式异常/);await assert.rejects(readBindingChatObjects(Response.json([{chat_metadata:{large:'x'.repeat(1024)}}]),{maxObjectBytes:100}),/过大/);
});
test('native search handles Unicode, name fragments and user remarks only',async()=>{
 const target={type:'card',locator:'x.png',name:'角色a&角色b'};assert.equal(searchOwners([target],'角色b').length,1);assert.equal(searchOwners([target],'HERO ALIAS').length,0);assert.equal(searchOwners([{type:'user',name:'Traveler',title:'Remark'}],' TRAV remark ').length,1);
 for(const count of [300,1000]){const f=managementFixture({cards:count}),objects=await f.management.list('card');assert.equal(searchOwners(objects,'same').length,2);await f.management.list('card');assert.equal(f.requests.length,0);}
});
test('LRU enforces byte and entry budgets independently; account changes clear old sensitive cache',async()=>{
 const lru=createBindingLRU({maxEntries:2,maxBytes:100});lru.set('a','x'.repeat(50));lru.set('b','y'.repeat(50));assert.ok(lru.stats().bytes<=100);assert.equal(lru.get('a'),undefined);
 const f=managementFixture();await saved(f);assert.ok(f.management.cache.stats().entries>0);f.account='other';await assert.rejects(f.management.list('card'),/账户/);assert.equal(f.management.cache.stats().bytes,0);
});

test('TT directed metadata uses exact card stem and never switches or overwrites live current metadata',async()=>{
 const f=managementFixture(),{target}=await saved(f,1);f.storeChat(target.locator,'offline',{integrity:'tt-offline',other:'preserved'});let directed=0;
 f.tt={api:{chat:{open(ref){assert.equal(ref.characterId,'card-1');assert.equal(ref.fileName,'offline');return {metadata:{get:async()=>structuredClone(f.chats.get(f.chatKey(target.locator,'offline'))[0].chat_metadata),setExtension:async({namespace,value})=>{directed++;const meta=f.chats.get(f.chatKey(target.locator,'offline'))[0].chat_metadata;meta.extensions??={};meta.extensions[namespace]=structuredClone(value);}}};}}}};
 const state=await f.chatSettings.read({target,fileName:'offline'}),row=f.chatSettings.rows(state)[0];const updated=await f.chatSettings.save(state,{[bindingSwitchKey(row.owner,row)]:false});assert.equal(directed,1);assert.equal(f.context.characterId,0);assert.equal(updated.metadata.other,'preserved');assert.equal(f.context.chatMetadata.extensions,undefined);
});
test('legacy chat keys migrate through owner aliases while explicit true and inherit remain distinct',async()=>{
 const f=managementFixture(),target=(await f.management.list('card'))[0],legacy=await f.storage.save(editBinding(emptyBindingArchive({type:'card',stableKey:target.locator}),fields),null),binding=legacy.archive.bindings[0];
 f.context.chatMetadata.miaoCharacterSwitchOverrides={schemaVersion:1,values:{[JSON.stringify(['card',target.locator,binding.uuid])]:false}};await f.context.saveChat();const entry=await f.management.open(target),state=await f.chatSettings.read(f.chatSettings.current());assert.equal(f.chatSettings.rows(state)[0].enabled,false);
 const key=bindingSwitchKey(entry.archive.owner,binding),savedState=await f.chatSettings.save(state,{[key]:true});assert.equal(savedState.settings.values[key],true);assert.equal(savedState.metadata.miaoCharacterSwitchOverrides.values[JSON.stringify(['card',target.locator,binding.uuid])],false);
 const inherited=await f.chatSettings.save(savedState,{[key]:'inherit'});assert.equal(inherited.settings.values[key],undefined);
});
test('message snapshot references require disk confirmation even when saveChat resolves silently',async()=>{
 const f=managementFixture();await saved(f);const {createCharacterBindingsSession}=await import('../src/profiles/character-bindings-session.js'),{parseBodyBlocks}=await import('../src/core/core.js'),{defaultTreeSettings}=await import('../src/prompts/tree-settings.js');
 const session=createCharacterBindingsSession({context:()=>f.context,persona:()=>f.avatar,storage:f.storage,management:f.management,chatSettings:f.chatSettings,mode:()=>({...defaultTreeSettings(),tagMode:'binding'}),models:()=>['nai-diffusion-4-5-full']});
 const message={mes:'image###scene | C01, smiling###'};f.context.chat.push(message);const block=parseBodyBlocks(message.mes,'image###([\\s\\S]*?)###')[0];f.swallowChat=true;
 await assert.rejects(session.accept(message,block),/读回未确认/);await assert.rejects(session.resolve(message,block),/读回未确认/);f.swallowChat=false;await f.context.saveChat();assert.equal((await session.resolve(message,block))[0].positive,fields.positive);
});
test('two clients passing old hashes retain independent immutable recovery candidates without claiming CAS',async()=>{
 const f=managementFixture(),{entry}=await saved(f),{createCharacterBindingStorage}=await import('../src/platform/character-bindings-storage.js');const other=createCharacterBindingStorage({getHeaders:f.context.getRequestHeaders,fetchImpl:f.fetch,scope:f.host.scope,locks:null}),name=await f.storage.filename(entry.archive.owner);
 let arrivals=0,release;const barrier=new Promise(r=>release=r);f.onUpload=async body=>{if(body.name===name){arrivals++;if(arrivals===2)release();await barrier;}};
 const a=editBinding(entry.archive,{name:'Client A'},entry.archive.bindings[0].uuid),b=editBinding(entry.archive,{name:'Client B'},entry.archive.bindings[0].uuid);
 const results=await Promise.allSettled([f.storage.save(a,entry.hash),other.save(b,entry.hash)]);assert.equal(arrivals,2);assert.ok(results.some(r=>r.status==='fulfilled'));
 const recovery=[...f.files.entries()].filter(([path])=>path.includes('recovery-v2')).map(([,value])=>JSON.parse(value).value).filter(v=>v?.owner?.ownerId===entry.archive.owner.ownerId&&v.bindings?.[0]?.name?.startsWith('Client '));assert.equal(recovery.length,2);assert.deepEqual(new Set(recovery.map(v=>v.bindings[0].name)),new Set(['Client A','Client B']));
});

test('offline rename recovers through embedded identity while deleted locator reuse requires repair',async()=>{
 const f=managementFixture(),{target,entry}=await saved(f),card=structuredClone(f.cards.get(target.locator));f.management.dispose();
 const newer=managementFixture();newer.files=new Map(f.files);newer.cards=new Map(f.cards);newer.cards.delete(target.locator);newer.cards.set('offline-renamed.png',{...card,avatar:'offline-renamed.png'});newer.context.characters[0]={...card,avatar:'offline-renamed.png'};
 const recovered=await newer.management.open((await newer.management.list('card'))[0],{fresh:true});assert.equal(recovered.archive.owner.ownerId,entry.archive.owner.ownerId);assert.equal(recovered.archive.bindings[0].uuid,entry.archive.bindings[0].uuid);
 await newer.host.emit({name:'CHARACTER_DELETED',type:'card',locator:'offline-renamed.png'});newer.context.characters[0]={avatar:'offline-renamed.png',name:'Replacement',data:{extensions:{}}};newer.cards.set('offline-renamed.png',structuredClone(newer.context.characters[0]));
 await assert.rejects(newer.management.open((await newer.management.list('card'))[0],{fresh:true}),/已删除对象/);assert.equal((await newer.storage.load(entry.archive.owner)).archive.bindings[0].uuid,entry.archive.bindings[0].uuid);
});
test('old-version writes after migration require an explicit compare/merge decision',async()=>{
 const f=managementFixture(),target=(await f.management.list('card'))[0],old=await f.storage.save(editBinding(emptyBindingArchive({type:'card',stableKey:target.locator}),fields),null),entry=await f.management.open(target);
 await f.storage.save(editBinding(old.archive,{positive:'boy, OLD VERSION EDIT'},old.archive.bindings[0].uuid),old.hash);
 f.management.invalidate(target);const current=await f.management.open(target,{fresh:true});assert.equal(current.legacyChanged,true);await assert.rejects(f.management.verifySources([current]),/旧版 v1/);await assert.rejects(f.management.save(current,editBinding(current.archive,{name:'Attempt'},current.archive.bindings[0].uuid)),/旧 v1/);
 assert.equal((await f.storage.load(entry.archive.owner)).archive.bindings[0].positive,fields.positive);
});
test('complete user-file and chat transfer keeps identities, overrides and historical snapshots in another instance',async()=>{
 const source=managementFixture(),{entry,target}=await saved(source),row=entry.archive.bindings[0],ref=source.chatSettings.current(),state=await source.chatSettings.read(ref);await source.chatSettings.save(state,{[bindingSwitchKey(entry.archive.owner,row)]:false});
 const snapshot={schemaVersion:1,prompt:'scene | C01, smiling',bindings:[{...row,owner:entry.archive.owner,enabled:true,dynamic:'smiling'}],messageId:'fixture-message',swipe:0,bodyIndex:0};const snapshotRef=await source.storage.writeSnapshot(snapshot);
 const destination=managementFixture();destination.files=new Map(source.files);destination.cards=new Map([...source.cards].map(([k,v])=>[k,structuredClone(v)]));destination.context.characters=source.context.characters.map(c=>structuredClone(c));destination.chats=new Map([...source.chats].map(([k,v])=>[k,structuredClone(v)]));destination.context.chatMetadata=structuredClone(source.context.chatMetadata);
 const restored=await destination.management.open(target,{fresh:true}),chat=await destination.chatSettings.read(destination.chatSettings.current());assert.equal(restored.archive.owner.ownerId,entry.archive.owner.ownerId);assert.deepEqual(restored.archive.bindings,entry.archive.bindings);assert.equal(destination.chatSettings.rows(chat)[0].enabled,false);assert.deepEqual(await destination.storage.readSnapshot(snapshotRef),snapshot);
});
test('chat rename retains chat UUID and explicit overrides; copied chat forks identity on next save',async()=>{
 const f=managementFixture();await saved(f);let state=await f.chatSettings.read(f.chatSettings.current()),row=f.chatSettings.rows(state)[0];state=await f.chatSettings.save(state,{[bindingSwitchKey(row.owner,row)]:false});const uuid=state.settings.chatUuid;
 f.chats.set(f.chatKey('card-0.png','renamed'),f.chats.get(f.chatKey('card-0.png','chat-a')));f.chats.delete(f.chatKey('card-0.png','chat-a'));f.context.chatId='renamed';await f.host.emit({name:'CHAT_RENAMED',type:'card',locator:'card-0.png',oldChatFile:'chat-a',chatFile:'renamed'});
 const renamed=await f.chatSettings.read(f.chatSettings.current());assert.equal(renamed.settings.chatUuid,uuid);assert.equal(renamed.collision,false);assert.equal(f.chatSettings.rows(renamed)[0].enabled,false);
 f.storeChat('card-0.png','copy',renamed.metadata);const copy=await f.chatSettings.read({target:renamed.ref.target,cardOwnerId:renamed.ref.cardOwnerId,fileName:'copy'});assert.equal(copy.collision,true);const savedCopy=await f.chatSettings.save(copy,{});assert.notEqual(savedCopy.settings.chatUuid,uuid);assert.equal(f.chatSettings.rows(savedCopy)[0].enabled,false);
});
test('fresh retry uses the same drafted binding UUID and never replaces an archive created meanwhile',async()=>{
 const f=managementFixture(),target=(await f.management.list('card'))[0],draft=await f.management.open(target),uuid='00000000-0000-4000-8000-000000000123',a=editBinding(draft.archive,fields,undefined,{newUuid:uuid});assert.equal(a.bindings[0].uuid,uuid);assert.equal(editBinding(draft.archive,fields,undefined,{newUuid:uuid}).bindings[0].uuid,uuid);
 const other=await saved(f);await assert.rejects(f.management.save(draft,a),/已建立档案/);assert.equal((await f.management.open(target,{fresh:true})).archive.bindings[0].uuid,other.entry.archive.bindings[0].uuid);
});

test('new exact Unicode locators stay independent when no ambiguous v1 archive exists',async()=>{
 const f=managementFixture();f.context.characters=[{avatar:'e\u0301.png',name:'Same',data:{extensions:{}}},{avatar:'é.png',name:'Same',data:{extensions:{}}}];f.cards=new Map(f.context.characters.map(c=>[c.avatar,structuredClone(c)]));const [a,b]=await f.management.list('card');
 const first=await f.management.open(a),second=await f.management.open(b);const savedA=await f.management.save(first,editBinding(first.archive,fields)),savedB=await f.management.save(second,editBinding(second.archive,fields));assert.notEqual(savedA.archive.owner.ownerId,savedB.archive.owner.ownerId);assert.equal(savedA.target.locator,'e\u0301.png');assert.equal(savedB.target.locator,'é.png');
});

test('native rename before first v2 indexing migrates the proven old locator and keeps old chat overrides',async()=>{
 const f=managementFixture(),oldTarget=(await f.management.list('card'))[0],legacy=await f.storage.save(editBinding(emptyBindingArchive({type:'card',stableKey:oldTarget.locator}),fields),null),binding=legacy.archive.bindings[0];
 const newLocator='renamed-before-index.png',card=f.cards.get(oldTarget.locator);f.cards.delete(oldTarget.locator);f.cards.set(newLocator,{...card,avatar:newLocator});f.context.characters[0].avatar=newLocator;
 const meta={integrity:'native-rename',miaoCharacterSwitchOverrides:{schemaVersion:1,values:{[JSON.stringify(['card',oldTarget.locator,binding.uuid])]:false}}};f.storeChat(newLocator,'chat-a',meta);f.context.chatMetadata=structuredClone(meta);
 await f.host.emit({name:'CHARACTER_RENAMED',type:'card',oldLocator:oldTarget.locator,locator:newLocator});const loaded=await f.management.open((await f.management.list('card'))[0],{fresh:true});assert.equal(loaded.archive.bindings[0].uuid,binding.uuid);assert.equal(loaded.archive.nextSequence,legacy.archive.nextSequence);assert.ok(loaded.record.aliases.includes(oldTarget.locator));const state=await f.chatSettings.read(f.chatSettings.current());assert.equal(f.chatSettings.rows(state)[0].enabled,false);
});
test('interrupted independent identity writes resume the same pending UUID and preserve the old archive',async()=>{
 const f=managementFixture(),{target,entry}=await saved(f);f.swallowCard=true;await assert.rejects(f.management.independent(target),/身份尚未保存/);const pending=(await f.management.records()).find(r=>r.state==='pending');assert.ok(pending);assert.notEqual(pending.ownerId,entry.archive.owner.ownerId);
 f.swallowCard=false;const retried=await f.management.independent(target);assert.equal(retried.archive.owner.ownerId,pending.ownerId);assert.equal((await f.storage.load(entry.archive.owner)).archive.bindings[0].uuid,entry.archive.bindings[0].uuid);
});
test('TT snapshot confirmation uses bounded history instead of materializing the full chat',async()=>{
 const f=managementFixture();await saved(f);const expected={ref:'a'.repeat(64),prefixHash:'b'.repeat(64)},message={miao_nai_image_id:'fixture-message'};let limit;
 f.tt={api:{chat:{open(ref){assert.equal(ref.characterId,'card-0');return {history:{tail:async options=>{limit=options.limit;return {messages:[{...message,miaoCharacterSnapshots:{slot:expected}}],hasMoreBefore:false};},before:async()=>{throw Error('must stop at target');}}};}}}};
 const before=f.requests.length;await f.chatSettings.confirmMessage(message,'slot',expected);assert.equal(limit,20);assert.equal(f.requests.slice(before).filter(r=>r.url==='/api/chats/get').length,0);
});
test('near-4MiB archive and 100-binding boundary stay valid with bounded cache and tiny card identity',async()=>{
 const f=managementFixture(),target=(await f.management.list('card'))[0],entry=await f.management.open(target),archive={...entry.archive,nextSequence:101,bindings:Array.from({length:100},(_,i)=>({uuid:`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,shortId:'C'+String(i+1).padStart(2,'0'),name:'Fixture '+i,aliases:[],positive:(i<30?'黑':'x').repeat(16000),negative:'y'.repeat(16000),defaultEnabled:true,archived:i===99,revision:1}))};
 const bytes=new TextEncoder().encode(JSON.stringify(archive)).length;assert.ok(bytes>4_000_000&&bytes<4*1024*1024);const saved=await f.management.save(entry,archive);assert.equal(saved.archive.bindings.length,100);assert.ok(f.management.cache.stats().bytes<=8*1024*1024);assert.ok(JSON.stringify(f.cards.get(target.locator).data.extensions).length<200);assert.ok(![...f.files.keys()].some(k=>k.includes('summary-v2')));
});

test('old empty and saved owner drafts cannot publish into a changed account',async()=>{
 const f=managementFixture(),target=(await f.management.list('card'))[1],empty=await f.management.open(target),{entry}=await saved(f);f.account='other-account';const writes=()=>f.requests.filter(r=>r.url==='/api/files/upload'||r.url==='/api/characters/merge-attributes').length,before=writes();
 await assert.rejects(f.management.save(empty,editBinding(empty.archive,fields)),/账户/);await assert.rejects(f.management.save(entry,editBinding(entry.archive,{name:'Do not transfer'},entry.archive.bindings[0].uuid)),/账户/);assert.equal(writes(),before);
});

test('automatic save forbids implicit ST navigation, including target changes while queued',async()=>{
 const f=managementFixture(),{target}=await saved(f,1);f.storeChat(target.locator,'offline',{integrity:'offline',unrelated:{keep:true}});
 const state=await f.chatSettings.read({target,fileName:'offline'}),row=f.chatSettings.rows(state)[0],key=bindingSwitchKey(row.owner,row);
 assert.equal(f.chatSettings.writable(state.ref),false);
 const before=f.requests.length;await assert.rejects(f.chatSettings.save(state,{[key]:false},{allowOpen:false}),/打开此聊天/);
 assert.equal(f.context.characterId,0);assert.equal(f.context.chatId,'chat-a');assert.equal(f.requests.slice(before).some(r=>r.url.includes('save')),false);
 await f.chatSettings.openChat(state.ref);assert.equal(f.context.characterId,1);assert.equal(f.context.chatId,'offline');assert.equal(f.chats.get(f.chatKey(target.locator,'offline'))[0].chat_metadata.extensions,undefined);
 const fresh=await f.chatSettings.read(state.ref);assert.equal(f.chatSettings.writable(fresh.ref),true);
 const job=f.chatSettings.save(fresh,{[key]:false},{allowOpen:false});f.context.characterId=0;f.context.chatId='chat-a';
 await assert.rejects(job,/打开此聊天/);assert.equal(f.context.characterId,0);assert.equal(f.chats.get(f.chatKey(target.locator,'offline'))[0].chat_metadata.extensions,undefined);
});
test('explicit chat boolean survives equal defaults while inherit removes only its exact key',async()=>{
 const f=managementFixture(),{entry}=await saved(f),ref=f.chatSettings.current(),state=await f.chatSettings.read(ref),row=f.chatSettings.rows(state)[0],key=bindingSwitchKey(row.owner,row);
 state.settings.values['unrecognized-owner:unrecognized-binding']=false;
 const explicit=await f.chatSettings.save(state,{[key]:row.defaultEnabled},{allowOpen:false});assert.equal(Object.hasOwn(explicit.settings.values,key),true);
 const inherited=await f.chatSettings.save(explicit,{[key]:'inherit'},{allowOpen:false});assert.equal(Object.hasOwn(inherited.settings.values,key),false);assert.equal(inherited.settings.values['unrecognized-owner:unrecognized-binding'],false);
 const next=editBinding(entry.archive,{defaultEnabled:false},row.uuid),updated=await f.management.save(entry,next);inherited.entries=[updated];assert.equal(f.chatSettings.rows(inherited)[0].enabled,false);
});
test('generation waits for owner confirmation and blocks current-chat writes from their queue boundary',async()=>{
 const f=managementFixture(),{target,entry}=await saved(f);let release,started;const ready=new Promise(resolve=>{started=resolve;});
 f.onUpload=async body=>{if(body.name===await f.storage.filename(entry.archive.owner)){started();await new Promise(resolve=>{release=resolve;});}};
 const next=editBinding(entry.archive,{defaultEnabled:false},entry.archive.bindings[0].uuid),job=f.management.save(entry,next);await ready;
 let settled=false;const barrier=f.management.awaitConfirmed([target]).then(()=>{settled=true;});await Promise.resolve();assert.equal(settled,false);release();await job;await barrier;assert.equal(settled,true);
 const state=await f.chatSettings.read(f.chatSettings.current()),row=f.chatSettings.rows(state)[0];const saving=f.chatSettings.save(state,{[bindingSwitchKey(row.owner,row)]:false},{allowOpen:false});
 assert.throws(()=>f.chatSettings.assertCurrentConfirmed(),/保存结果/);await saving;assert.doesNotThrow(()=>f.chatSettings.assertCurrentConfirmed());
});
