import {randomId} from '../platform/browser-crypto.js';

export const BINDING_LIMITS=Object.freeze({count:100,text:16000,name:160,aliases:20,bytes:4*1024*1024});
export const SWITCH_KEY='miaoCharacterSwitchOverrides';
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
export function normalizeOwnerKey(value){
    if(typeof value!=='string'||!value.trim()||value.length>512||/[\x00-\x1f/\\]/.test(value))throw Error('所有者头像标识无效');
    return value.normalize('NFC').trim();
}
export function bindingIdentity(context,personaAvatar){
    const chat=context.getCurrentChatId?.()??context.chatId;
    if(context.groupId)return {chat:null,owners:[],unsupported:true};
    const owners=[];
    for(const [type,key,label] of [['user',personaAvatar,context.name1],['card',context.characters?.[context.characterId]?.avatar,context.characters?.[context.characterId]?.name]]){
        if(key)owners.push({type,stableKey:normalizeOwnerKey(key),label:String(label||key)});
    }
    return {chat:chat==null?null:String(chat),owners,unsupported:false};
}
export const ownerIdentity=owner=>JSON.stringify([owner.type,owner.stableKey]);
export const contextIdentity=identity=>JSON.stringify([identity.chat,identity.unsupported,identity.owners.map(ownerIdentity)]);
export function emptyBindingArchive(owner){return {schemaVersion:1,owner:{type:owner.type,stableKey:owner.stableKey},revision:0,nextSequence:1,bindings:[]};}
export function validateBindingArchive(value,expectedOwner){
    if(!value||value.schemaVersion!==1||!['card','user'].includes(value.owner?.type))throw Error('角色档案格式无效');
    normalizeOwnerKey(value.owner.stableKey);
    if(expectedOwner&&ownerIdentity(value.owner)!==ownerIdentity(expectedOwner))throw Error('角色档案归属不匹配');
    if(!Number.isSafeInteger(value.revision)||value.revision<0||!Number.isSafeInteger(value.nextSequence)||value.nextSequence<1||!Array.isArray(value.bindings)||value.bindings.length>BINDING_LIMITS.count)throw Error('角色档案版本或数量无效');
    const ids=new Set(),uuids=new Set(),prefix=value.owner.type==='card'?'C':'U';
    for(const b of value.bindings){
        const sequence=Number(b.shortId?.slice(1));
        if(!uuid.test(b.uuid)||uuids.has(b.uuid)||!new RegExp('^'+prefix+'[0-9]{2,}$').test(b.shortId)||!Number.isSafeInteger(sequence)||sequence<1||sequence>=value.nextSequence||b.shortId!==prefix+String(sequence).padStart(2,'0')||ids.has(b.shortId))throw Error('角色 UUID、短 ID 或分配序列无效');
        uuids.add(b.uuid);ids.add(b.shortId);
        for(const [field,max] of [['name',BINDING_LIMITS.name],['positive',BINDING_LIMITS.text],['negative',BINDING_LIMITS.text]])if(typeof b[field]!=='string'||b[field].length>max||field!=='negative'&&!b[field].trim())throw Error('角色名称或正负面长度无效');
        if(!Array.isArray(b.aliases)||b.aliases.length>BINDING_LIMITS.aliases||new Set(b.aliases).size!==b.aliases.length||b.aliases.some(a=>typeof a!=='string'||!a.trim()||a.length>BINDING_LIMITS.name))throw Error('角色别名无效');
        if(typeof b.defaultEnabled!=='boolean'||typeof b.archived!=='boolean'||!Number.isSafeInteger(b.revision)||b.revision<1)throw Error('角色开关或修订无效');
    }
    if(new TextEncoder().encode(JSON.stringify(value)).length>BINDING_LIMITS.bytes)throw Error('角色档案超过 4 MiB 上限');
    return value;
}
export function editBinding(archive,changes,id){
    const next=structuredClone(archive),existing=id&&next.bindings.find(b=>b.uuid===id);
    if(id&&!existing)throw Error('角色记录已不存在');
    const b=existing||{uuid:randomId(),shortId:(next.owner.type==='card'?'C':'U')+String(next.nextSequence++).padStart(2,'0'),revision:0,defaultEnabled:true,archived:false};
    for(const field of ['name','positive','negative','defaultEnabled','archived'])if(Object.hasOwn(changes,field))b[field]=changes[field];
    if(changes.aliases)b.aliases=[...new Set(changes.aliases.map(a=>a.trim()).filter(Boolean))];
    b.revision++;if(!existing)next.bindings.push(b);
    return validateBindingArchive(next);
}
export function bindingSwitchKey(owner,b){return JSON.stringify([owner.type,owner.stableKey,b.uuid]);}
export function activeBindings(archives,metadata={}){
    const overrides=metadata[SWITCH_KEY]?.schemaVersion===1?metadata[SWITCH_KEY].values||{}:{};
    return archives.flatMap(a=>a.bindings.map(b=>{const key=bindingSwitchKey(a.owner,b),override=overrides[key];return {...b,owner:a.owner,enabled:typeof override==='boolean'?override:b.defaultEnabled,source:typeof override==='boolean'?'chat':'global'};})).filter(b=>!b.archived);
}
export function bindingRoster(bindings){
    const plain=s=>s.replace(/[\r\n\x00-\x1f=<>]/g,' ').trim();
    return bindings.filter(b=>b.enabled).sort((a,b)=>b.shortId[0].localeCompare(a.shortId[0])||Number(a.shortId.slice(1))-Number(b.shortId.slice(1))).map(b=>`${b.shortId} = ${plain(b.name)}${b.aliases.length?'（别名：'+b.aliases.map(plain).join('、')+'）':''}`).join('\n');
}
