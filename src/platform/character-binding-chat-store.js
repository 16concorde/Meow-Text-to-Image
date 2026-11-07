import {randomId,sha256} from './browser-crypto.js';
import {validBindingUuid,bindingSwitchKey} from '../profiles/character-bindings.js';
// ST has no directed namespace update. Store only this plugin's field overrides.
// The persistent index distinguishes copies; unobserved ambiguous renames fail closed.
export function createBindingChatStore({storage,host,list,metadata}){
    const indexName=owner=>`miao-character-chat-index-v1-${owner}.json`;
    const dataName=(owner,id)=>`miao-character-chat-overrides-v1-${owner}-${id}.json`;
    const valid=index=>{if(index?.schemaVersion!==1||!Array.isArray(index.chats)||index.chats.length>4096||!Number.isSafeInteger(index.revision)||index.chats.some(c=>!validBindingUuid(c.id)||typeof c.fileName!=='string'||typeof c.integrity!=='string')||new Set(index.chats.map(c=>c.id)).size!==index.chats.length)throw Error('聊天定位索引无效，请核对宿主备份');return index;};
    async function locate(ref,meta,{create=false}={}){
        const owner=ref.cardOwnerId;if(!validBindingUuid(owner))throw Error('请先在角色管理中建立此角色卡的资料身份');
        if(typeof meta.integrity!=='string'||!meta.integrity)throw Error('此聊天缺少可核实的身份，请先在酒馆打开并保存该聊天');
        const raw=await storage.readJSON(indexName(owner)),index=raw?valid(raw.value):{schemaVersion:1,revision:0,chats:[]};
        const chats=await list(ref.target);if(!chats.some(c=>c.fileName===ref.fileName))throw Error('目标聊天已删除或改名，请重新选择');
        let entry=index.chats.find(c=>!c.deleted&&c.fileName===ref.fileName&&c.integrity===meta.integrity);
        if(!entry){
            const ambiguous=index.chats.find(c=>!c.deleted&&c.integrity===meta.integrity&&!chats.some(chat=>chat.fileName===c.fileName));
            if(ambiguous)throw Error('聊天可能已在其他窗口改名，身份尚未确认；请在原窗口完成重命名定位同步后重试');
            if(!create)return null;
            for(const old of index.chats)if(old.fileName===ref.fileName&&!old.deleted)old.deleted=true;
            if(index.chats.length>=4096)throw Error('聊天定位记录已达上限，请保留草稿并核对宿主备份');
            entry={id:randomId(),fileName:ref.fileName,integrity:meta.integrity};index.chats.push(entry);index.revision++;await storage.publishJSON(indexName(owner),index,raw?.hash??null);
        }
        return entry;
    }
    function effective(base,data){const next=structuredClone(base);for(const [key,value] of Object.entries(data?.values||{})){if(value==='inherit')delete next.values[key];else next.values[key]=value;}if(data)next.chatUuid=data.chatId;return next;}
    async function read(ref,meta,base){
        if(!validBindingUuid(ref.cardOwnerId)||!meta.integrity)return {settings:base,hash:null,entry:null,data:null};
        const entry=await locate(ref,meta);if(!entry)return {settings:base,hash:null,entry:null,data:null};
        const raw=await storage.readJSON(dataName(ref.cardOwnerId,entry.id)),data=raw?.value;
        if(data&&(data.schemaVersion!==1||data.ownerId!==ref.cardOwnerId||data.chatId!==entry.id||data.integrity!==meta.integrity||!data.values||Array.isArray(data.values)||Object.values(data.values).some(v=>typeof v!=='boolean'&&v!=='inherit')))throw Error('聊天开关文件身份或格式不一致');
        return {settings:effective(base,data),hash:raw?.hash??null,entry,data};
    }
    return {read,async save(state,values,base){
        if(typeof window!=='undefined'&&!globalThis.navigator?.locks)throw Error('当前环境缺少安全写入锁，请使用支持 Web Locks 的 HTTPS 页面保存聊天开关');
        const captured=host.scope(),ref=state.ref,latest=await metadata(ref);if(latest.integrity!==state.integrity)throw Object.assign(Error('聊天身份已改变，草稿保留'),{saveState:'conflict'});
        if(await sha256(JSON.stringify(latest.extensions?.meow_t2i_bindings??null))!==state.baseHash)throw Object.assign(Error('聊天原始开关已变化，请重新读取比较'),{saveState:'conflict'});
        const entry=await locate(ref,latest,{create:true}),file=dataName(ref.cardOwnerId,entry.id),remote=await storage.readJSON(file);
        if((remote?.hash??null)!==(state.sidecar?.hash??null))throw Object.assign(Error('聊天开关已被其他窗口修改，请保留草稿比较'),{saveState:'conflict'});
        const data=remote?.value??{schemaVersion:1,revision:0,ownerId:ref.cardOwnerId,chatId:entry.id,integrity:latest.integrity,values:{}};
        for(const [key,value] of Object.entries(values)){if(!base.some(row=>bindingSwitchKey(row.owner,row)===key)||typeof value!=='boolean'&&value!=='inherit')throw Error('聊天开关不属于所选对象');data.values[key]=value;}
        data.revision++;if(host.scope()!==captured)throw Error('账户已切换，草稿保留');
        // Check target again immediately before publishing; never rewrite chat messages.
        const verify=await metadata(ref);if(verify.integrity!==latest.integrity||await sha256(JSON.stringify(verify.extensions?.meow_t2i_bindings??null))!==state.baseHash)throw Object.assign(Error('聊天身份或原开关已变化，请重新读取'),{saveState:'conflict'});const verifiedEntry=await locate(ref,verify);if(verifiedEntry?.id!==entry.id)throw Object.assign(Error('聊天定位已变化，草稿保留'),{saveState:'conflict'});await storage.publishJSON(file,data,state.sidecar?.hash??null);
        if(host.scope()!==captured)throw Object.assign(Error('账户已切换，保存结果待查证'),{saveState:'unknown'});
        return effective(state.settings,data);
    },async event(change,records){
        if(change.name==='CHAT_DELETED'){
            for(const record of records.filter(r=>r.type==='card'&&r.state==='ready')){const raw=await storage.readJSON(indexName(record.ownerId));if(!raw)continue;const index=valid(raw.value),existing=await list({type:'card',locator:record.locator});let changed=false;for(const entry of index.chats)if(!entry.deleted&&!existing.some(chat=>chat.fileName===entry.fileName)){entry.deleted=true;changed=true;}if(changed){index.revision++;await storage.publishJSON(indexName(record.ownerId),index,raw.hash);}}return;
        }
        if(change.name!=='CHAT_RENAMED'||!change.locator)return;
        const owner=records.find(r=>r.type==='card'&&r.locator===change.locator&&r.state==='ready')?.ownerId;if(!owner)return;
        const raw=await storage.readJSON(indexName(owner));if(!raw)return;const index=valid(raw.value),old=change.oldChatFile??change.chatFile;let changed=false;
        for(const entry of index.chats)if(!entry.deleted&&entry.fileName===old){if(change.name==='CHAT_RENAMED')entry.fileName=change.chatFile;else entry.deleted=true;changed=true;}
        if(changed){index.revision++;await storage.publishJSON(indexName(owner),index,raw.hash);}
    }};
}
