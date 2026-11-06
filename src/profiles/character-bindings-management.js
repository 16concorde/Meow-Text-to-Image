import {randomId,sha256} from '../platform/browser-crypto.js';
import {emptyBindingArchive,validateBindingArchive,legacyOwnerKey,assertSafeBindingData,validBindingUuid} from './character-bindings.js';
import {OWNER_INDEX_FILE,ownerLocatorKey,validateOwnerIndex,assertArchiveEvolution} from './character-owner-identity.js';
import {assertLegacyLocatorUnique,migrateBindingArchive,mergedBindingArchive} from './character-bindings-migration.js';
import {createBindingLRU,ownerSummary} from './character-bindings-index.js';

// Browsing has no relationship to the generation session's selected owners.
export function createCharacterBindingsManagement({storage,host,locks=globalThis.navigator?.locks}){
    const cache=createBindingLRU(),inflight=new Map(),listeners=new Set();let activeScope=host.scope(),index=null,summaryCache=null,queue=Promise.resolve(),scan=null;
    function checkScope(expected=activeScope){if(host.scope()!==expected){cache.clear();index=null;summaryCache=null;inflight.clear();activeScope=host.scope();throw Error('账户或数据集已改变，请重新进入管理');}}
    const notify=change=>{for(const fn of listeners)fn(change);};
    const serial=fn=>{const expected=host.scope(),job=queue.then(async()=>{checkScope(expected);return locks?.request?locks.request('meow-owners:'+expected,fn):fn();});queue=job.catch(()=>{});return job;};
    async function readIndex(){checkScope();const raw=await storage.readJSON(OWNER_INDEX_FILE);return raw?{value:validateOwnerIndex(raw.value),hash:raw.hash}:{value:{schemaVersion:2,revision:0,owners:[],indexed:[]},hash:null};}
    async function changeIndex(change){const base=await readIndex(),next=structuredClone(base.value);await change(next);next.revision++;await storage.publishJSON(OWNER_INDEX_FILE,next,base.hash);index=next;return next;}
    async function records(){index=(await readIndex()).value;return index.owners;}
    async function targetList(type){checkScope();return host.list(type);}
    async function recordFor(target,{fresh=false}={}){
        if(fresh||!index)await records();
        return index.owners.find(r=>r.state!=='missing'&&ownerLocatorKey(r)===ownerLocatorKey(target));
    }
    async function summaries(){
        checkScope();if(summaryCache)return summaryCache;
        await records();const shards=[...new Set(index.owners.filter(r=>['ready','missing','pending'].includes(r.state)).map(r=>r.ownerId[0]))];
        const result=[];let summaryBytes=0;const captured=activeScope;for(const shard of shards){const data=await storage.readJSON(`miao-character-summary-v2-${shard}.json`);if(data){if(data.value.schemaVersion!==2||!Array.isArray(data.value.items))throw Error('检索摘要损坏，请修复搜索索引');summaryBytes+=new TextEncoder().encode(JSON.stringify(data.value.items)).length;if(summaryBytes>8*1024*1024){result.incomplete=true;break;}result.push(...data.value.items);}}
        checkScope(captured);summaryCache=result;return result;
    }
    async function updateSummary(target,archive){
        summaryCache=null;
        const name=`miao-character-summary-v2-${archive.owner.ownerId[0]}.json`,old=await storage.readJSON(name),value=old?.value||{schemaVersion:2,items:[]},next=structuredClone(value);
        next.items=next.items.filter(i=>i.ownerId!==archive.owner.ownerId);next.items.push(ownerSummary(target,archive));await storage.publishJSON(name,next,old?.hash??null);
    }
    async function publishRecord(record){await changeIndex(next=>{const at=next.owners.findIndex(r=>r.ownerId===record.ownerId);if(at<0)next.owners.push(record);else next.owners[at]=record;});}
    async function resolveRecord(target){
        let record=await recordFor(target,{fresh:true});
        if(!record&&(index.deletedLocators?.includes(ownerLocatorKey(target))||index.owners.some(r=>r.type===target.type&&r.locator===target.locator&&r.state==='missing')))throw Object.assign(Error('此文件定位曾属于已删除对象，请明确关联原资料或建立独立档案'),{identityConflict:true});
        if(target.type!=='card')return record;
        const cardId=await host.readOwnerId(target);
        if(record&&cardId&&cardId!==record.ownerId&&!(record.state==='pending'&&record.previousOwnerId===cardId)){const e=Error('此文件已被另一张卡替换，所属身份不一致；请选择关联原资料或建立独立档案');e.identityConflict=true;throw e;}
        if(record&&record.state==='ready'&&!cardId)throw Object.assign(Error('卡内身份丢失，请在数据管理中确认归属后重新关联'),{identityConflict:true});
        if(!record&&cardId){
            const previous=index.owners.find(r=>r.ownerId===cardId);
            if(previous){
                const cards=await targetList('card');if(cards.some(c=>c.locator===previous.locator))throw Object.assign(Error('检测到复制的所属 UUID，当前对象已隔离，请建立独立档案'),{identityConflict:true});
                record={...previous,aliases:[...new Set([...previous.aliases,previous.locator])],locator:target.locator,state:previous.state==='pending'?'pending':'ready'};await publishRecord(record);
            }else {
                const data=await storage.load({type:'card',ownerId:cardId}),source=data.archive.nativeLocator?.locator??data.archive.migration?.sourceOwnerKey;
                if(!data.hash||!source)throw Object.assign(Error('卡内身份没有可确认的所属索引，请在数据管理中恢复卡内资料或建立独立档案'),{identityConflict:true});
                const cards=await targetList('card');if(source!==target.locator&&cards.some(c=>c.locator===source))throw Object.assign(Error('复制的卡内身份仍属于现存原卡，请建立独立档案'),{identityConflict:true});
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
        let summaryPending=false;try{await updateSummary(target,saved.archive);}catch{summaryPending=true;}
        const entry={...saved,target:structuredClone(target),record:ready,summaryPending,scope:activeScope};cache.set(ownerLocatorKey(target),entry);notify({target,kind:['independent','repair'].includes(record.operationKind)?'identity':'initialized'});return entry;
    }
    async function openUncached(target,{create=false}={}){
        checkScope();let record=await resolveRecord(target);
        if(record?.state==='ready'){
            const saved=await storage.load({type:target.type,ownerId:record.ownerId});if(!saved.hash)throw Error('所属索引指向的档案缺失，请在数据管理中恢复');
            const old=record.legacyKey?await storage.load({type:target.type,stableKey:record.legacyKey}):null;
            const legacyChanged=!!(old?.hash&&record.sourceHash&&old.hash!==record.sourceHash);
            const entry={...saved,target:structuredClone(target),record,legacyChanged,summaryPending:record.summaryPending||record.archiveRevision!==saved.archive.revision,scope:activeScope};cache.set(ownerLocatorKey(target),entry);return entry;
        }
        const objects=await targetList(target.type),legacyKey=legacyOwnerKey(target.locator),legacy=await storage.load({type:target.type,stableKey:legacyKey});if(legacy.hash)assertLegacyLocatorUnique(target,objects);
        if(!record&&!legacy.hash&&!create)return {archive:emptyBindingArchive({type:target.type,stableKey:target.locator}),hash:null,target:structuredClone(target),record:null,scope:activeScope};
        record??={type:target.type,locator:target.locator,aliases:[],ownerId:randomId(),state:'pending',opId:randomId(),legacyKey:legacy.hash?legacyKey:null};
        return complete(target,record,legacy);
    }
    const api={
        host,storage,cache,records,summaries,list:targetList,listenerCount:()=>listeners.size,
        subscribe(fn){listeners.add(fn);return ()=>listeners.delete(fn);},
        async open(target,{fresh=false,create=false}={}){
            checkScope();const key=ownerLocatorKey(target),expected=host.scope();if(!fresh&&!create){const found=cache.get(key);if(found)return found;if(inflight.has(key))return inflight.get(key);}
            const promise=serial(()=>openUncached(target,{create})).then(entry=>{checkScope(expected);return structuredClone({...entry,scope:expected});}).finally(()=>inflight.delete(key));inflight.set(key,promise);return promise;
        },
        async save(entry,archive){return serial(async()=>{
            const target=entry.target,expected=host.scope();if(entry.scope!==expected)throw Error('账户或数据集已改变，旧草稿不能写入新账户');let current=entry;
            validateBindingArchive(archive);assertArchiveEvolution(entry.archive,archive);
            if(!entry.record){const allocated=await recordFor(target,{fresh:true});if(allocated?.state==='ready')throw Object.assign(Error('此对象已建立档案，请刷新并比较后再保存草稿'),{saveState:'conflict',latest:(await storage.load({type:target.type,ownerId:allocated.ownerId})).archive});if(allocated){const existing=await storage.load({type:target.type,ownerId:allocated.ownerId});if(existing.archive.bindings.length)throw Error('迁移或创建已在另一窗口开始，请刷新后继续');}current=await openUncached(target,{create:true});archive={...structuredClone(archive),schemaVersion:2,owner:current.archive.owner,revision:current.archive.revision};}
            else {const record=await resolveRecord(target);if(!record||record.ownerId!==entry.archive.owner.ownerId)throw Error('保存目标归属已变化，请保留草稿并刷新');if(record.legacyKey&&record.sourceHash){const old=await storage.load({type:target.type,stableKey:record.legacyKey});if(old.hash&&old.hash!==record.sourceHash)throw Error('迁移后的旧 v1 资料已被旧版修改，请到数据管理中比较并明确选择保留 v2 或合并旧版变更');}}
            archive={...archive,nativeLocator:{type:target.type,locator:target.locator}};
            let saved;try{saved=await storage.save(archive,current.hash);}catch(error){cache.delete(ownerLocatorKey(target));error.baseEntry=current;throw error;}
            checkScope(expected);let summaryPending=false;try{await updateSummary(target,saved.archive);}catch{summaryPending=true;}
            const updatedRecord={...current.record,archiveRevision:saved.archive.revision,summaryPending};try{await publishRecord(updatedRecord);}catch{summaryPending=true;}
            const result={...current,...saved,record:updatedRecord,summaryPending,scope:expected};cache.set(ownerLocatorKey(target),result);notify({target,kind:'saved'});return result;
        });},
        invalidate(target){if(target)cache.delete(ownerLocatorKey(target));else cache.clear();},
        async copyFrom(target,sourceId){
            if(!validBindingUuid(sourceId))throw Error('来源所属身份无效');const source=(await records()).find(r=>r.ownerId===sourceId);const data=await storage.load({type:source?.type??target.type,ownerId:sourceId});if(!data.hash)throw Error('来源档案缺失');
            const destination=await api.open(target,{create:true,fresh:true});if(destination.archive.bindings.length)throw Error('目标已有角色，请使用导入预览合并');
            const next={...destination.archive,nextSequence:data.archive.nextSequence,bindings:data.archive.bindings.map(b=>({...b,uuid:randomId(),shortId:(target.type==='card'?'C':'U')+b.shortId.slice(1),revision:1}))};return api.save(destination,next);
        },
        async repair(target,ownerId){return serial(async()=>{
            const old=(await records()).find(r=>r.ownerId===ownerId&&r.type===target.type);if(!old)throw Error('待关联档案不存在');
            const objects=await targetList(target.type);if(old.locator!==target.locator&&objects.some(o=>o.locator===old.locator)&&old.state!=='missing')throw Error('所属资料仍被另一对象占用，不能共享；请独立复制');
            const occupied=index.owners.find(r=>r.ownerId!==ownerId&&r.type===target.type&&r.locator===target.locator&&r.state!=='missing');
            if(occupied)throw Error('目标已有独立档案，不能覆盖归属');
            const record={...old,operationKind:'repair',locator:target.locator,aliases:[...new Set([...old.aliases,old.locator])],state:'pending'};return complete(target,record,null);
        });},
        async independent(target){return serial(async()=>{
            const existing=await recordFor(target,{fresh:true});if(existing?.state==='pending'&&existing.operationKind==='independent')return complete(target,existing,null);
            const previousOwnerId=target.type==='card'?await host.readOwnerId(target):existing?.ownerId;
            await changeIndex(next=>{for(const r of next.owners)if(r.type===target.type&&r.locator===target.locator)r.state='missing';});
            return complete(target,{type:target.type,locator:target.locator,aliases:[],ownerId:randomId(),opId:randomId(),state:'pending',operationKind:'independent',previousOwnerId},null);
        });},
        async buildIndex({onProgress=()=>{},signal}={}){
            if(scan)return scan;const run=(async()=>{const objects=[...await targetList('card'),...await targetList('user')];await records();let done=0;const failures=[];
                let completed=[];
                async function flush(){if(!completed.length)return;const batch=completed;completed=[];await changeIndex(next=>{next.indexed=[...new Set([...(next.indexed||[]),...batch])];});}
                for(const target of objects){if(signal?.aborted)break;const key=ownerLocatorKey(target);if(index.indexed?.includes(key)){done++;continue;}
                    try{
                        const known=index.owners.find(r=>r.type===target.type&&r.locator===target.locator&&r.state!=='missing');
                        const legacy=known?null:await storage.load({type:target.type,stableKey:legacyOwnerKey(target.locator)});if(legacy?.hash)assertLegacyLocatorUnique(target,objects);
                        if(known||legacy?.hash){const entry=await api.open(target,{fresh:true});if(entry.record)await updateSummary(target,entry.archive);}
                        completed.push(key);if(completed.length>=32)await flush();
                    }catch(error){failures.push({type:target.type,locator:target.locator,message:error.message});}
                    done++;onProgress({done,total:objects.length,failures:failures.length});await new Promise(r=>setTimeout(r,0));
                }
                await flush();
                return {done,total:objects.length,failures,complete:done===objects.length&&!failures.length};})();scan=run;try{return await run;}finally{scan=null;}
        },
        async indexStatus(objects){await records();const known=new Set(index.indexed||[]);return {done:objects.filter(o=>known.has(ownerLocatorKey(o))).length,total:objects.length};},
        async verifySources(entries){for(const entry of entries){const record=entry.record;if(record?.legacyKey&&record.sourceHash){const old=await storage.load({type:record.type,stableKey:record.legacyKey});if(old.hash&&old.hash!==record.sourceHash){cache.delete(ownerLocatorKey(entry.target));throw Error('旧版 v1 资料有新变更，请在数据管理中比较并确认后再生成');}}}},
        async legacyStatus(target){const record=await recordFor(target,{fresh:true});if(!record?.legacyKey)return null;const old=await storage.load({type:target.type,stableKey:record.legacyKey});return old.hash?{record,old,changed:!!record.sourceHash&&record.sourceHash!==old.hash}:null;},
        async resolveLegacy(target,{merge=false}={}){return serial(async()=>{const record=await resolveRecord(target);if(!record?.legacyKey)throw Error('没有旧版来源');const old=await storage.load({type:target.type,stableKey:record.legacyKey}),current=await storage.load({type:target.type,ownerId:record.ownerId});if(!old.hash||!current.hash)throw Error('资料源缺失，请先恢复文件');let saved=current;if(merge){const next=mergedBindingArchive(current.archive,old.archive);validateBindingArchive(next);saved=await storage.save(next,current.hash);}await publishRecord({...record,sourceHash:old.hash,archiveRevision:saved.archive.revision});cache.delete(ownerLocatorKey(target));let summaryPending=false;try{await updateSummary(target,saved.archive);}catch{summaryPending=true;}notify({target,kind:'saved'});return {...saved,summaryPending};});},
        async embedded(target,{independent=false}={}){if(target.type!=='card')throw Error('用户设定请使用失联资料关联');const ownerId=await host.readOwnerId(target);if(!ownerId)throw Error('此卡没有可恢复的所属身份');const data=await storage.load({type:'card',ownerId});if(!data.hash)throw Error('单卡 PNG 不含外部角色正文，请导入资料包或建立独立档案');if(independent){const destination=await api.independent(target);const next={...destination.archive,nextSequence:data.archive.nextSequence,bindings:data.archive.bindings.map(b=>({...b,uuid:randomId(),revision:1}))};return api.save(destination,next);}const source=data.archive.nativeLocator?.locator??data.archive.migration?.sourceOwnerKey;if(!source)throw Error('无法证明原资料归属，请选择独立复制');const cards=await targetList('card');if(source!==target.locator&&cards.some(c=>c.locator===source))throw Error('原资料仍被现存卡占用，请独立复制');return serial(()=>complete(target,{type:'card',locator:target.locator,ownerId,aliases:source===target.locator?[]:[source],state:'pending',opId:randomId()},null));},
        async recovery(target){const record=await recordFor(target,{fresh:true});if(!record)return null;const name=await storage.filename({type:target.type,ownerId:record.ownerId}),op=await storage.readJSON(`miao-character-operation-v2-${await sha256(name)}.json`);if(!op)return null;const candidate=await storage.readJSON(op.value.candidate);return candidate?{operation:op.value,archive:candidate.value.value,current:await storage.readJSON(name)}:null;},
        async exportPackage(){
            const owners=await records(),files=[];let packageBytes=0;for(const record of owners.filter(r=>['ready','missing','pending'].includes(r.state))){const data=await storage.load({type:record.type,ownerId:record.ownerId});if(data.hash){packageBytes+=new TextEncoder().encode(JSON.stringify(data.archive)).length;if(packageBytes>16*1024*1024)throw Error('资料包超过 16 MiB，请按对象分别导出');files.push({ownerState:record.state,type:record.type,ownerId:record.ownerId,locator:record.locator,aliases:record.aliases,archive:data.archive,checksum:await sha256(JSON.stringify(data.archive))});}}
            return {schemaVersion:2,format:'meow-binding-package',compatibility:2,includes:{archives:true,snapshots:false,chatOverrides:false,credentials:false},files};
        },
        async previewPackage(value){
            assertSafeBindingData(value);
            if(value?.schemaVersion!==2||value.format!=='meow-binding-package'||!Array.isArray(value.files)||value.files.length>1000)throw Error('资料包格式或数量无效');
            const existing=await records(),ids=new Set();for(const item of value.files){validateBindingArchive(item.archive,{type:item.type,ownerId:item.ownerId});if(ids.has(item.ownerId)||await sha256(JSON.stringify(item.archive))!==item.checksum)throw Error('资料包重复身份或校验和错误');ids.add(item.ownerId);}
            return value.files.map(item=>({...item,conflict:existing.some(r=>r.ownerId===item.ownerId)}));
        },
        async handle(change){
            if(change.type){summaryCache=null;if(change.locator)cache.delete(ownerLocatorKey({type:change.type,locator:change.locator}));if(change.oldLocator)cache.delete(ownerLocatorKey({type:change.type,locator:change.oldLocator}));}if(!change.type||!change.locator){notify(change);return;}
            if(change.duplicate){const source=(await records()).find(r=>r.type===change.type&&r.locator===change.oldLocator);const target=(await targetList(change.type)).find(o=>o.locator===change.locator);if(target){let sourceId=source?.ownerId;if(!sourceId&&change.type==='card'){try{sourceId=await host.readOwnerId({type:'card',locator:change.oldLocator});}catch{}}const result=await api.independent(target);if(sourceId)await changeIndex(next=>{next.owners.find(r=>r.ownerId===result.record.ownerId).copySource=sourceId;});}}
            else if(change.name==='CHARACTER_RENAMED'){await serial(async()=>{
                const all=await records(),old=all.find(r=>r.type==='card'&&r.locator===change.oldLocator&&r.state!=='missing'),cards=await targetList('card'),target=cards.find(o=>o.locator===change.locator);
                if(!target)throw Error('重命名目标未加载，请刷新列表');
                if(!old){
                    if(index.deletedLocators?.includes(ownerLocatorKey({type:'card',locator:change.oldLocator})))throw Error('原定位有失联记录，请修复归属');
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
    const unsubscribeStorage=storage.subscribe?.(()=>{cache.clear();index=null;summaryCache=null;notify({external:true});});
    const unsubscribe=host.subscribe(change=>api.handle(change).catch(()=>notify({...change,identityPending:true})));
    return api;
}
