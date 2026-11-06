import {bindingIdentity,contextIdentity,ownerIdentity,activeBindings,bindingRoster,bindingSwitchKey,SWITCH_KEY,validateBindingArchive} from './character-bindings.js';
import {bindingReferences,resolveBindingPrompt} from '../prompts/character-binding-prompt.js';
import {randomId,sha256Sync} from '../platform/browser-crypto.js';

export const SNAPSHOTS_KEY='miaoCharacterSnapshots';
export const snapshotSlot=(swipe,block)=>JSON.stringify([swipe,block.bodyIndex,sha256Sync(block.prompt)]);
export function createCharacterBindingsSession({context,persona,storage,mode,models}){
    let loaded=null,loading=null,epoch=0;
    const pending=new WeakMap();
    const identity=()=>bindingIdentity(context(),persona());
    const key=()=>contextIdentity(identity());
    function current(){if(!loaded||loaded.key!==key())throw Error('角色绑定尚未加载或聊天已切换，请打开角色绑定页重载');return loaded;}
    function assertKey(expected){if(key()!==expected)throw Error('聊天、角色卡或用户设定已切换，请重试');}
    function rows(){return activeBindings(current().entries.map(e=>e.archive),context().chatMetadata);}
    async function load(){
        const captured=identity(),capturedKey=contextIdentity(captured);
        if(loaded?.key===capturedKey)return current();
        if(loading?.key===capturedKey)return loading.promise;
        loaded=null;const token=++epoch;
        const promise=Promise.all(captured.owners.map(owner=>storage.load(owner))).then(entries=>{
            assertKey(capturedKey);if(epoch!==token)throw Error('角色绑定加载已过期');
            loaded={key:capturedKey,identity:captured,entries};return loaded;
        }).finally(()=>{if(loading?.promise===promise)loading=null;});
        loading={key:capturedKey,promise};return promise;
    }
    function bindingMode(){return mode()?.version===2&&mode().mode==='builtin'&&mode().tagMode==='binding'&&mode().enabledById?.tags!==false;}
    const api={
        identity,current,rows,load,
        invalidate(){epoch++;loaded=null;loading=null;},
        roster(){if(!bindingMode())return '';return bindingRoster(rows());},
        async prepare(){
            if(!bindingMode())return;
            await load();
            if(current().identity.unsupported)throw Error('角色绑定第一阶段不支持群聊');
            if(models().some(m=>!/^nai-diffusion-[45](?:-|$)/.test(m)))throw Error('绑定模式不支持 V3，请更换全部候选及彩蛋配置或切回完整 Tag 模式');
        },
        async saveArchive(archive){
            const state=current(),expected=state.key,index=state.entries.findIndex(e=>ownerIdentity(e.archive.owner)===ownerIdentity(archive.owner));
            if(index<0)throw Error('档案不属于当前身份');validateBindingArchive(archive,state.entries[index].archive.owner);
            const previous=state.entries[index].archive;
            if(archive.nextSequence<previous.nextSequence)throw Error('不能回退角色 ID 分配序列');
            for(const old of previous.bindings){const next=archive.bindings.find(b=>b.uuid===old.uuid);if(!next||next.shortId!==old.shortId||next.revision<old.revision)throw Error('不能删除或重分配历史角色身份，请归档');}
            for(const next of archive.bindings)if(!previous.bindings.some(b=>b.uuid===next.uuid)&&Number(next.shortId.slice(1))<previous.nextSequence)throw Error('不能复用历史短 ID');
            const saved=await storage.save(archive,state.entries[index].hash);assertKey(expected);state.entries[index]=saved;return saved.archive;
        },
        async saveSwitches(values,scope){
            const state=current(),expected=state.key;
            if(scope==='global'){
                for(const entry of [...state.entries]){
                    const next=structuredClone(entry.archive);let changed=false;
                    for(const b of next.bindings){const value=values[bindingSwitchKey(next.owner,b)];if(typeof value==='boolean'&&value!==b.defaultEnabled){b.defaultEnabled=value;b.revision++;changed=true;}}
                    if(changed)await api.saveArchive(next);
                }
            }else{
                const host=context();if(!state.identity.chat||typeof host.saveMetadataDebounced!=='function'||typeof host.saveMetadata!=='function'||!host.chatMetadata)throw Error('当前宿主或聊天不支持保存开关覆盖');
                const previous=structuredClone(host.chatMetadata[SWITCH_KEY]),next={schemaVersion:1,values:{...(previous?.values||{})}};
                for(const row of rows()){
                    const k=bindingSwitchKey(row.owner,row),v=values[k];
                    if(v==='inherit')delete next.values[k];else if(typeof v==='boolean')next.values[k]=v;
                }
                host.chatMetadata[SWITCH_KEY]=next;
                try{await host.saveMetadataDebounced();assertKey(expected);if(await host.saveMetadata()===false)throw Error('聊天元数据保存失败');assertKey(expected);}catch(error){if(previous===undefined)delete host.chatMetadata[SWITCH_KEY];else host.chatMetadata[SWITCH_KEY]=previous;throw error;}
            }
        },
        async accept(message,block,{reassociate=false,sourceBlock=block,frozenBindings}={}){
            if(!bindingReferences(block.prompt).length)return null;
            const swipe=message.swipe_id??0,slot=snapshotSlot(swipe,block),ref=message[SNAPSHOTS_KEY]?.[slot];
            const jobs=pending.get(message)||new Map();pending.set(message,jobs);if(jobs.has(slot))return jobs.get(slot);
            if(ref&&!reassociate)return ref;
            if(!bindingMode())throw Error('含绑定 ID 的 Tag 需要内置角色绑定模式，请编辑本次 Tag');
            const expectedText=message.mes,expectedKey=key();
            const promise=(async()=>{
                await api.prepare();assertKey(expectedKey);const captured=expectedKey;
                if(frozenBindings?.some(b=>!current().identity.owners.some(o=>ownerIdentity(o)===ownerIdentity(b.owner))))throw Error('角色归属已切换，不能使用旧名单');
                const resolved=resolveBindingPrompt(block.prompt,'nai-diffusion-5-full',frozenBindings??rows());
                message.miao_nai_image_id??=randomId();
                const snapshot={schemaVersion:1,prompt:block.prompt,bindings:resolved.used,models:[...models()],identity:identity(),messageId:message.miao_nai_image_id,swipe,bodyIndex:block.bodyIndex};
                const savedRef=await storage.writeSnapshot(snapshot);assertKey(captured);
                if((message.swipe_id??0)!==swipe||message.mes.slice(0,sourceBlock.start+sourceBlock.raw.length)!==expectedText.slice(0,sourceBlock.start+sourceBlock.raw.length)||!context().chat.includes(message)||message.mes.slice(sourceBlock.start,sourceBlock.start+sourceBlock.raw.length)!==sourceBlock.raw)throw Error('消息、Tag 或分支已切换，未关联绑定快照');
                (message[SNAPSHOTS_KEY]??={})[slot]={ref:savedRef,prefixHash:sha256Sync(expectedText.slice(0,sourceBlock.start))};
                try{await context().saveChat();}catch(error){if(ref)message[SNAPSHOTS_KEY][slot]=ref;else delete message[SNAPSHOTS_KEY][slot];throw error;}
                return savedRef;
            })().finally(()=>jobs.delete(slot));jobs.set(slot,promise);return promise;
        },
        async resolve(message,block){
            if(!bindingReferences(block.prompt).length)return undefined;
            const captured=key(),ref=message[SNAPSHOTS_KEY]?.[snapshotSlot(message.swipe_id??0,block)];
            if(!ref||ref.prefixHash!==sha256Sync(message.mes.slice(0,block.start)))throw Error('历史绑定不可还原：此 Tag 没有快照。请使用「重新关联绑定」确认使用当前档案，或编辑本次 Tag');
            const snapshot=await storage.readSnapshot(ref.ref);assertKey(captured);
            if(snapshot.schemaVersion!==1||snapshot.prompt!==block.prompt||snapshot.messageId!==message.miao_nai_image_id||!Array.isArray(snapshot.bindings))throw Error('历史绑定快照与当前 Tag 不匹配，请重新关联');
            return snapshot.bindings.map(b=>({...b,enabled:true,archived:false}));
        },
        async settled(message,block){const job=pending.get(message)?.get(snapshotSlot(message.swipe_id??0,block));if(job)await job;},
    };
    return api;
}
