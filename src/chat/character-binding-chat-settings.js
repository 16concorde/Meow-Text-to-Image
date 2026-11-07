import {createBindingChatStore} from '../platform/character-binding-chat-store.js';
import {BINDING_NAMESPACE,bindingIdentity,bindingSwitchKey,activeBindings} from '../profiles/character-bindings.js';
import {migratedChatSettings} from '../profiles/character-bindings-migration.js';
import {randomId,sha256} from '../platform/browser-crypto.js';

// Consume one JSON object at a time from ST's array response. Never materialize a whole chat.
export async function readBindingChatObjects(response,{find=()=>true,maxObjectBytes=1024*1024,maxBytes=32*1024*1024}={}){
    if(!response.ok)throw Error('聊天读取失败');
    const reader=response.body?.getReader?.();
    if(!reader){const size=Number(response.headers?.get('content-length'));if(!size||size>256*1024)throw Error('宿主不支持有界聊天读取，请在酒馆打开该聊天后重试');const value=await response.json();if(!Array.isArray(value))throw Error('聊天格式异常，请先在酒馆打开');return value.find(find)??null;}
    const decoder=new TextDecoder();let total=0,object='',depth=0,string=false,escaped=false,started=false;
    try{for(;;){const {value,done}=await reader.read();if(done)break;total+=value.length;if(total>maxBytes)throw Error('聊天读回验证超过 32 MiB 预算，请拆分过长聊天或使用可用的定向宿主接口');
        for(const ch of decoder.decode(value,{stream:true})){
            if(!started){if(/\s/.test(ch))continue;if(ch!=='[')throw Error('聊天格式异常，不能当成空元数据');started=true;continue;}
            if(!depth){if(ch==='{' ){object='{';depth=1;}else if(ch===']')return null;else if(!/[\s,]/.test(ch))throw Error('聊天对象格式异常');continue;}
            object+=ch;if(object.length>maxObjectBytes)throw Error('聊天单条记录过大，请打开该聊天后处理');
            if(string){if(escaped)escaped=false;else if(ch==='\\')escaped=true;else if(ch==='"')string=false;}
            else if(ch==='"')string=true;else if(ch==='{'||ch==='[')depth++;else if(ch==='}'||ch===']')depth--;
            if(!depth){if(new TextEncoder().encode(object).length>maxObjectBytes)throw Error('聊天单条记录过大，请打开该聊天后处理');let parsed;try{parsed=JSON.parse(object);}catch{throw Error('聊天记录损坏');}if(find(parsed))return parsed;object='';}
        }
    }throw Error('聊天响应不完整');}finally{await reader.cancel().catch(()=>{});}
}
const fileName=value=>{if(typeof value!=='string'||!value||value.length>1024||/[\x00-\x1f/\\]/.test(value))throw Error('聊天文件定位无效');return value;};
export function createBindingChatSettings({host,management}){
    const knownChats=new Map(),drafts=new Map(),pendingWrites=new Map(),inflightWrites=new Map();let queue=Promise.resolve();
    const current=()=>{const c=host.context(),card=c.characters?.[c.characterId],chat=c.getCurrentChatId?.()??c.chatId;return !c.groupId&&card?.avatar&&chat?{target:{type:'card',locator:card.avatar,name:card.name},cardOwnerId:card.data?.extensions?.meow_t2i?.ownerId,fileName:String(chat)}:null;};
    const key=ref=>JSON.stringify([host.scope(),ref.cardOwnerId??ref.target.locator,ref.fileName]);
    const isCurrent=ref=>{const c=current();return c&&key(c)===key(ref);};
    const handle=ref=>ref.target.locator.endsWith('.png')?host.tt()?.api?.chat?.open?.({kind:'character',characterId:ref.target.locator.slice(0,-4),fileName:ref.fileName}):null;
    const fetchObjects=(ref,options)=>host.post('chats/get',{avatar_url:ref.target.locator,file_name:fileName(ref.fileName)}).then(r=>readBindingChatObjects(r,options));
    async function resolveRef(ref){if(!ref.cardOwnerId)return ref;const record=(await management.records()).find(r=>r.ownerId===ref.cardOwnerId&&r.state==='ready');if(!record)throw Error('聊天所属资料失联，请刷新定位');return {...ref,target:{...ref.target,locator:record.locator}};}
    async function metadata(ref){
        const h=handle(ref);if(h?.metadata?.get)return h.metadata.get();
        const header=await fetchObjects(ref,{find:()=>true,maxObjectBytes:256*1024});if(!header?.chat_metadata||typeof header.chat_metadata!=='object')throw Error('聊天 header 缺失，请先在酒馆打开并保存此聊天');return header.chat_metadata;
    }
    const useSidecar=ref=>!!management.storage&&typeof handle(ref)?.metadata?.setExtension!=='function';
    const sidecar=management.storage?createBindingChatStore({storage:management.storage,host,list:ref=>api.list(ref),metadata}):null;
    const writable=ref=>!!sidecar||!!isCurrent(ref)||typeof handle(ref)?.metadata?.setExtension==='function';
    const api={current,isCurrent,key,drafts,writable,
        async handleEvent(change){if(sidecar&&['CHAT_RENAMED','CHAT_DELETED'].includes(change.name))await sidecar.event(change,await management.records());if(change.name!=='CHAT_RENAMED'||!change.locator||!change.oldChatFile||!change.chatFile)return;const record=(await management.records()).find(r=>r.type==='card'&&r.locator===change.locator&&r.state==='ready'),oldRef={target:{type:'card',locator:change.locator},cardOwnerId:record?.ownerId,fileName:change.oldChatFile},nextRef={...oldRef,fileName:change.chatFile};for(const [uuid,value] of knownChats)if(value===key(oldRef))knownChats.set(uuid,key(nextRef));if(drafts.has(key(oldRef))){drafts.set(key(nextRef),drafts.get(key(oldRef)));drafts.delete(key(oldRef));}},
        assertCurrentConfirmed(){const ref=current();if(ref&&(pendingWrites.has(key(ref))||inflightWrites.has(key(ref))))throw Error('聊天开关保存结果仍未知，请在聊天管理中重新读取查证后再生成');},
        async list(target){const result=await (await host.post('characters/chats',{avatar_url:target.locator,simple:true})).json();if(!Array.isArray(result)){if(result?.error===true)throw Error('聊天列表读取失败，请重试');throw Error('聊天列表格式无效');}return result.map(item=>({target,fileName:fileName(item.file_id??String(item.file_name).replace(/\.jsonl$/,'')),name:item.file_id??String(item.file_name).replace(/\.jsonl$/,''),last: item.last_mes??'',messages:item.chat_items??null}));},
        async read(ref,{previewPersona}={}){
            ref=await resolveRef(ref);const captured=host.scope(),meta=await metadata(ref);if(host.scope()!==captured)throw Error('账户已改变');
            const card=await management.open(ref.target);ref={...ref,cardOwnerId:card.archive.owner.ownerId??ref.cardOwnerId};const users=await management.list('user'),locator=isCurrent(ref)?host.persona():meta.persona??previewPersona;
            const user=locator&&users.find(u=>u.locator===locator),entries=[card];if(user)entries.push(await management.open(user));
            let settings=migratedChatSettings(meta,entries);const stored=useSidecar(ref)?await sidecar.read(ref,meta,settings):null;if(stored)settings=stored.settings;const known=knownChats.get(settings.chatUuid),collision=known&&known!==key(ref);knownChats.set(settings.chatUuid,key(ref));
            if(pendingWrites.has(key(ref))){if(isCurrent(ref)){const live=host.context().chatMetadata;live.extensions??={};if(meta.extensions?.[BINDING_NAMESPACE])live.extensions[BINDING_NAMESPACE]=structuredClone(meta.extensions[BINDING_NAMESPACE]);else delete live.extensions[BINDING_NAMESPACE];}pendingWrites.delete(key(ref));}
            return {ref,metadata:meta,entries,settings,sidecar:stored,persona:user||null,collision,baseHash:await sha256(JSON.stringify(meta.extensions?.[BINDING_NAMESPACE]??null)),integrity:meta.integrity??null,scope:captured};
        },
        rows(state){const meta={extensions:{[BINDING_NAMESPACE]:state.settings}};return activeBindings(state.entries.map(e=>e.archive),meta);},
        save(state,values){const captured=host.scope(),targetKey=key(state.ref),job=queue.then(async()=>{
            if(captured!==state.scope||host.scope()!==captured)throw Error('账户已切换，草稿未保存');
            if(host.busy())throw Error('酒馆正在生成或保存，请结束当前操作后再保存；草稿已保留');
            const ref=await resolveRef(state.ref);let live=isCurrent(ref),h=handle(ref);
            if(useSidecar(ref)){try{const saved=await sidecar.save({...state,ref},values,api.rows(state));pendingWrites.delete(key(ref));drafts.delete(key(ref));return {...await api.read(ref),settings:saved};}catch(error){if(['unknown','unconfirmed'].includes(error.saveState))pendingWrites.set(key(ref),true);throw error;}}
            if(!live&&!h?.metadata?.setExtension)throw Error('当前宿主缺少定向保存能力，草稿保留');
            const latest=await metadata(ref);if((latest.integrity??null)!==state.integrity||await sha256(JSON.stringify(latest.extensions?.[BINDING_NAMESPACE]??null))!==state.baseHash)throw Object.assign(Error('聊天元数据已改变，请保留草稿并重新读取比较'),{saveState:'conflict'});
            const next=structuredClone(state.settings);if(state.collision)next.chatUuid=randomId();
            for(const entry of state.entries){if(!entry.archive.owner.ownerId&&entry.archive.bindings.length)throw Error('所属身份尚未迁移，不能保存覆盖');}
            for(const row of api.rows(state)){const k=bindingSwitchKey(row.owner,row),v=values[k];if(v==='inherit')delete next.values[k];else if(typeof v==='boolean')next.values[k]=v;}
            if(host.scope()!==captured)throw Error('账户已改变，未写入开关');
            pendingWrites.set(key(ref),next);
            if(h?.metadata?.setExtension){try{await h.metadata.setExtension({namespace:BINDING_NAMESPACE,value:next});}catch{/* Verify the directed result below. */}}else if(live){
                if(!isCurrent(ref)||host.scope()!==captured)throw Error('当前聊天已改变，未写入开关');
                const c=host.context();c.chatMetadata.extensions??={};c.chatMetadata.extensions[BINDING_NAMESPACE]=next;
                if(!isCurrent(ref)||host.scope()!==captured)throw Object.assign(Error('当前聊天已改变，原保存结果待查证'),{saveState:'unknown'});try{await c.saveMetadata();}catch{/* Read-back decides whether the write actually completed. */}
            }
            if(host.scope()!==captured)throw Object.assign(Error('账户已改变，原写入结果待查证'),{saveState:'unknown'});
            let confirmed;try{confirmed=await metadata(ref);}catch{throw Object.assign(Error('聊天开关保存结果未知，请保留草稿并查证'),{saveState:'unknown'});}
            if(JSON.stringify(confirmed.extensions?.[BINDING_NAMESPACE])!==JSON.stringify(next)){if(isCurrent(ref)){const liveMeta=host.context().chatMetadata;if(confirmed.extensions?.[BINDING_NAMESPACE])liveMeta.extensions[BINDING_NAMESPACE]=structuredClone(confirmed.extensions[BINDING_NAMESPACE]);else delete liveMeta.extensions[BINDING_NAMESPACE];}pendingWrites.delete(key(ref));throw Error('聊天开关尚未保存：读回内容不一致，草稿已保留');}
            pendingWrites.delete(key(ref));
            if(isCurrent(ref)){const liveMeta=host.context().chatMetadata;liveMeta.extensions??={};liveMeta.extensions[BINDING_NAMESPACE]=structuredClone(next);}
            drafts.delete(key(ref));knownChats.set(next.chatUuid,key(ref));return {...state,metadata:confirmed,settings:next,baseHash:await sha256(JSON.stringify(next)),collision:false};
        });inflightWrites.set(targetKey,job);job.finally(()=>{if(inflightWrites.get(targetKey)===job)inflightWrites.delete(targetKey);}).catch(()=>{});queue=job.catch(()=>{});return job;},
        async confirmMessage(message,slot,value){
            const ref=current();if(!ref)throw Error('没有可确认保存的当前聊天');const id=message.miao_nai_image_id;
            const h=handle(ref);let found;
            if(h?.history?.tail&&h.history.before){
                let page=await h.history.tail({limit:20}),bytes=0;
                for(let batch=0;batch<100;batch++){
                    if(!Array.isArray(page.messages))throw Error('宿主聊天分页格式无效');
                    bytes+=new TextEncoder().encode(JSON.stringify(page.messages)).length;if(bytes>32*1024*1024)throw Error('聊天分页读回超过验证预算，未发送生图');
                    found=page.messages.find(item=>item?.miao_nai_image_id===id);if(found||!page.hasMoreBefore)break;
                    page=await h.history.before(page,{limit:20});
                }
            }else found=await fetchObjects(ref,{find:item=>item.miao_nai_image_id===id});
            if(!found||JSON.stringify(found.miaoCharacterSnapshots?.[slot])!==JSON.stringify(value))throw Error('历史绑定引用尚未保存：宿主读回未确认，已阻止生图');
        },
        async effectiveMetadata(entries){const ref=current();if(!ref)return host.context().chatMetadata;const state=await api.read(ref);return {extensions:{[BINDING_NAMESPACE]:state.settings}};},
        async confirmCurrentOverrides(entries,values){const ref=current();if(!ref)throw Error('请先打开聊天');const state=await api.read(ref);state.entries=entries;return api.save(state,values);},
    };
    const unsubscribe=host.subscribe(change=>api.handleEvent(change),{first:true});
    api.dispose=unsubscribe;return api;
}
