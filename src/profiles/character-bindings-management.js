import {randomId} from '../platform/browser-crypto.js';
import {emptyBindingArchive,validateBindingArchive,legacyOwnerKey} from './character-bindings.js';
import {OWNER_INDEX_FILE,ownerLocatorKey,validateOwnerIndex,assertArchiveEvolution} from './character-owner-identity.js';
import {assertLegacyLocatorUnique,migrateBindingArchive} from './character-bindings-migration.js';
import {createBindingLRU} from './character-bindings-index.js';

// Browsing has no relationship to the generation session's selected owners.
export function createCharacterBindingsManagement({storage,host,locks=globalThis.navigator?.locks}){
    const cache=createBindingLRU(),inflight=new Map(),listeners=new Set();let activeScope=host.scope(),index=null,queue=Promise.resolve();
    function checkScope(expected=activeScope){if(host.scope()!==expected){cache.clear();index=null;inflight.clear();activeScope=host.scope();throw Error('账户或数据集已改变，请重新进入管理');}}
    const notify=change=>{for(const fn of listeners)fn(change);};
    const serial=fn=>{const expected=host.scope(),job=queue.then(async()=>{checkScope(expected);return locks?.request?locks.request('meow-owners:'+expected,fn):fn();});queue=job.catch(()=>{});return job;};
    async function readIndex(){checkScope();const raw=await storage.readJSON(OWNER_INDEX_FILE);return raw?{value:validateOwnerIndex(raw.value),hash:raw.hash}:{value:{schemaVersion:2,revision:0,owners:[]},hash:null};}
    async function changeIndex(change){const base=await readIndex(),next=structuredClone(base.value);await change(next);next.revision++;await storage.publishJSON(OWNER_INDEX_FILE,next,base.hash);index=next;return next;}
    async function records(){index=(await readIndex()).value;return index.owners;}
    async function targetList(type){checkScope();return host.list(type);}
    async function recordFor(target,{fresh=false}={}){
        if(fresh||!index)await records();
        return index.owners.find(r=>r.state!=='missing'&&ownerLocatorKey(r)===ownerLocatorKey(target));
    }
    async function publishRecord(record){await changeIndex(next=>{const at=next.owners.findIndex(r=>r.ownerId===record.ownerId);if(at<0)next.owners.push(record);else next.owners[at]=record;});}
    async function resolveRecord(target){
        let record=await recordFor(target,{fresh:true});
        if(!record&&(index.deletedLocators?.includes(ownerLocatorKey(target))||index.owners.some(r=>r.type===target.type&&r.locator===target.locator&&r.state==='missing')))throw Object.assign(Error('此文件定位曾属于已删除对象，绑定读取已停止，请从完整宿主备份核对身份归属'),{identityConflict:true});
        if(target.type!=='card')return record;
        const cardId=await host.readOwnerId(target);
        if(record&&cardId&&cardId!==record.ownerId&&!(record.state==='pending'&&record.previousOwnerId===cardId)){const e=Error('此文件已被另一张卡替换，所属身份不一致；绑定读取已停止，请从完整宿主备份核对身份归属');e.identityConflict=true;throw e;}
        if(record&&record.state==='ready'&&!cardId)throw Object.assign(Error('卡内身份丢失，绑定读取已停止，请从完整宿主备份恢复原卡与身份索引'),{identityConflict:true});
        if(!record&&cardId){
            const previous=index.owners.find(r=>r.ownerId===cardId);
            if(previous){
                const cards=await targetList('card');if(cards.some(c=>c.locator===previous.locator))throw Object.assign(Error('检测到复制的所属 UUID，当前对象已隔离，绑定读取已停止，请从完整宿主备份核对复制来源'),{identityConflict:true});
                record={...previous,aliases:[...new Set([...previous.aliases,previous.locator])],locator:target.locator,state:previous.state==='pending'?'pending':'ready'};await publishRecord(record);
            }else {
                const data=await storage.load({type:'card',ownerId:cardId}),source=data.archive.nativeLocator?.locator??data.archive.migration?.sourceOwnerKey;
                if(!data.hash||!source)throw Object.assign(Error('卡内身份没有可确认的所属索引，绑定读取已停止，请从完整宿主备份恢复资料'),{identityConflict:true});
                const cards=await targetList('card');if(source!==target.locator&&cards.some(c=>c.locator===source))throw Object.assign(Error('复制的卡内身份仍属于现存原卡，绑定读取已停止，请从完整宿主备份核对复制来源'),{identityConflict:true});
                record={type:'card',locator:target.locator,aliases:source===target.locator?[]:[source],ownerId:cardId,state:'pending',opId:randomId(),legacyKey:data.archive.migration?.sourceOwnerKey??null,sourceHash:data.archive.migration?.sourceHash??null};
            }
        }
        return record;
    }
    async function complete(target,record,legacy){
        // Record the allocation first; every interrupted retry reuses its UUID.
        if(legacy?.hash&&record.sourceHash&&legacy.hash!==record.sourceHash)throw Error('迁移中的旧档案已变化，请保留草稿并比较源版本');
        record={...record,sourceHash:record.sourceHash??legacy?.hash??null,legacyKey:record.legacyKey??(legacy?.hash?legacy.archive.owner.stableKey:null)};
        await publishRecord(record);
        if(legacy?.hash){await storage.immutableJSON(`miao-character-legacy-backup-v2-${record.opId}.json`,{schemaVersion:2,sourceHash:legacy.hash,archive:legacy.archive});}
        const owner={type:target.type,ownerId:record.ownerId};let saved=await storage.load(owner);
        if(!saved.hash){const candidate=legacy?.hash?migrateBindingArchive(legacy.archive,target,record.ownerId):emptyBindingArchive(owner);candidate.nativeLocator={type:target.type,locator:target.locator};if(candidate.migration&&legacy?.hash)candidate.migration.sourceHash=legacy.hash;saved=await storage.save(candidate,null);}
        if(target.type==='card')await host.writeOwnerId(target,record.ownerId);
        const ready={...record,state:'ready',archiveRevision:saved.archive.revision,sourceHash:saved.archive.migration?.sourceHash??record.sourceHash,legacyKey:saved.archive.migration?.sourceOwnerKey??record.legacyKey};await publishRecord(ready);
        const entry={...saved,target:structuredClone(target),record:ready,scope:activeScope};cache.set(ownerLocatorKey(target),entry);notify({target,kind:record.operationKind==='independent'?'identity':'initialized'});return entry;
    }
    async function openUncached(target,{create=false}={}){
        checkScope();let record=await resolveRecord(target);
        if(record?.state==='ready'){
            const saved=await storage.load({type:target.type,ownerId:record.ownerId});if(!saved.hash)throw Error('所属索引指向的档案缺失，请从完整宿主备份恢复');
            const old=record.legacyKey?await storage.load({type:target.type,stableKey:record.legacyKey}):null;
            const legacyChanged=!!(old?.hash&&record.sourceHash&&old.hash!==record.sourceHash);
            const entry={...saved,target:structuredClone(target),record,legacyChanged,scope:activeScope};cache.set(ownerLocatorKey(target),entry);return entry;
        }
        const objects=await targetList(target.type),legacyKey=legacyOwnerKey(target.locator),legacy=await storage.load({type:target.type,stableKey:legacyKey});if(legacy.hash)assertLegacyLocatorUnique(target,objects);
        if(!record&&!legacy.hash&&!create)return {archive:emptyBindingArchive({type:target.type,stableKey:target.locator}),hash:null,target:structuredClone(target),record:null,scope:activeScope};
        record??={type:target.type,locator:target.locator,aliases:[],ownerId:randomId(),state:'pending',opId:randomId(),legacyKey:legacy.hash?legacyKey:null};
        return complete(target,record,legacy);
    }
    const api={
        host,storage,cache,records,list:targetList,listenerCount:()=>listeners.size,
        subscribe(fn){listeners.add(fn);return ()=>listeners.delete(fn);},
        async open(target,{fresh=false,create=false}={}){
            checkScope();const key=ownerLocatorKey(target),expected=host.scope();if(!fresh&&!create){const found=cache.get(key);if(found)return found;if(inflight.has(key))return inflight.get(key);}
            const promise=serial(()=>openUncached(target,{create})).then(entry=>{checkScope(expected);return structuredClone({...entry,scope:expected});}).finally(()=>inflight.delete(key));inflight.set(key,promise);return promise;
        },
        async save(entry,archive){return serial(async()=>{
            const target=entry.target,expected=host.scope();if(entry.scope!==expected)throw Error('账户或数据集已改变，旧草稿不能写入新账户');let current=entry;
            validateBindingArchive(archive);assertArchiveEvolution(entry.archive,archive);
            if(!entry.record){const allocated=await recordFor(target,{fresh:true});if(allocated?.state==='ready')throw Object.assign(Error('此对象已建立档案，请刷新并比较后再保存草稿'),{saveState:'conflict',latest:(await storage.load({type:target.type,ownerId:allocated.ownerId})).archive});if(allocated){const existing=await storage.load({type:target.type,ownerId:allocated.ownerId});if(existing.archive.bindings.length)throw Error('迁移或创建已在另一窗口开始，请刷新后继续');}current=await openUncached(target,{create:true});archive={...structuredClone(archive),schemaVersion:2,owner:current.archive.owner,revision:current.archive.revision};}
            else {const record=await resolveRecord(target);if(!record||record.ownerId!==entry.archive.owner.ownerId)throw Error('保存目标归属已变化，请保留草稿并刷新');if(record.legacyKey&&record.sourceHash){const old=await storage.load({type:target.type,stableKey:record.legacyKey});if(old.hash&&old.hash!==record.sourceHash)throw Error('迁移后的旧 v1 资料已被旧版修改，绑定写入已停止，请从完整备份核对 v1 与 v2 资料');}}
            archive={...archive,nativeLocator:{type:target.type,locator:target.locator}};
            let saved;try{saved=await storage.save(archive,current.hash);}catch(error){cache.delete(ownerLocatorKey(target));error.baseEntry=current;throw error;}
            checkScope(expected);const updatedRecord={...current.record,archiveRevision:saved.archive.revision};
            const result={...current,...saved,record:updatedRecord,scope:expected};cache.set(ownerLocatorKey(target),result);notify({target,kind:'saved'});return result;
        });},
        invalidate(target){if(target)cache.delete(ownerLocatorKey(target));else cache.clear();},
        async independent(target){return serial(async()=>{
            const existing=await recordFor(target,{fresh:true});if(existing?.state==='pending'&&existing.operationKind==='independent')return complete(target,existing,null);
            const previousOwnerId=target.type==='card'?await host.readOwnerId(target):existing?.ownerId;
            await changeIndex(next=>{for(const r of next.owners)if(r.type===target.type&&r.locator===target.locator)r.state='missing';});
            return complete(target,{type:target.type,locator:target.locator,aliases:[],ownerId:randomId(),opId:randomId(),state:'pending',operationKind:'independent',previousOwnerId},null);
        });},
        async verifySources(entries){for(const entry of entries){const record=entry.record;if(record?.legacyKey&&record.sourceHash){const old=await storage.load({type:record.type,stableKey:record.legacyKey});if(old.hash&&old.hash!==record.sourceHash){cache.delete(ownerLocatorKey(entry.target));throw Error('旧版 v1 资料有新变更，绑定生成已停止，请从完整备份核对 v1 与 v2 资料');}}}},
        async handle(change){
            if(change.type){if(change.locator)cache.delete(ownerLocatorKey({type:change.type,locator:change.locator}));if(change.oldLocator)cache.delete(ownerLocatorKey({type:change.type,locator:change.oldLocator}));}if(!change.type||!change.locator){notify(change);return;}
            if(change.duplicate){const target=(await targetList(change.type)).find(o=>o.locator===change.locator);if(target)await api.independent(target);}
            else if(change.name==='CHARACTER_RENAMED'){await serial(async()=>{
                const all=await records(),old=all.find(r=>r.type==='card'&&r.locator===change.oldLocator&&r.state!=='missing'),cards=await targetList('card'),target=cards.find(o=>o.locator===change.locator);
                if(!target)throw Error('重命名目标未加载，请刷新列表');
                if(!old){
                    if(index.deletedLocators?.includes(ownerLocatorKey({type:'card',locator:change.oldLocator})))throw Error('原定位有失联记录，绑定读取已停止，请从完整宿主备份核对身份归属');
                    const embedded=await host.readOwnerId(target);if(embedded){await openUncached(target);return;}
                    const key=legacyOwnerKey(change.oldLocator),legacy=await storage.load({type:'card',stableKey:key});if(!legacy.hash)return;
                    if(cards.some(c=>c.locator!==target.locator&&legacyOwnerKey(c.locator)===key))throw Error('旧档案归属存在规范化冲突');
                    await complete(target,{type:'card',locator:target.locator,aliases:[change.oldLocator],ownerId:randomId(),state:'pending',opId:randomId(),legacyKey:key,sourceHash:legacy.hash},legacy);return;
                }
                const actual=await host.readOwnerId(target);if(actual&&actual!==old.ownerId)throw Error('重命名目标所属身份不一致，请修复');if(actual!==old.ownerId)await host.writeOwnerId(target,old.ownerId);
                await publishRecord({...old,locator:change.locator,aliases:[...new Set([...old.aliases,change.oldLocator])]});
            });}
            else if(change.name.endsWith('_DELETED'))await serial(()=>changeIndex(next=>{for(const r of next.owners)if(r.type===change.type&&r.locator===change.locator)r.state='missing';next.deletedLocators=[...new Set([...(next.deletedLocators||[]),ownerLocatorKey(change)])];}));
            notify(change);
        },
        dispose(){unsubscribe();unsubscribeStorage?.();listeners.clear();cache.clear();},
    };
    const unsubscribeStorage=storage.subscribe?.(()=>{cache.clear();index=null;notify({external:true});});
    const unsubscribe=host.subscribe(change=>api.handle(change).catch(()=>notify({...change,identityPending:true})));
    return api;
}
