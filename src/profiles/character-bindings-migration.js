import {legacyOwnerKey,SWITCH_KEY,BINDING_NAMESPACE,bindingSwitchKey,validBindingUuid,assertSafeBindingData} from './character-bindings.js';
import {randomId} from '../platform/browser-crypto.js';
export function assertLegacyLocatorUnique(target,objects){
    const key=legacyOwnerKey(target.locator),collisions=objects.filter(o=>o.type===target.type&&legacyOwnerKey(o.locator)===key);
    if(collisions.length>1)throw Error('旧头像规范化产生归属冲突，请在数据管理中选择关联资料或建立独立档案');
    return key;
}
export function migrateBindingArchive(archive,target,ownerId){
    return {...structuredClone(archive),schemaVersion:2,owner:{type:target.type,ownerId},migration:{sourceSchema:1,sourceOwnerKey:archive.owner.stableKey},legacyKeys:[archive.owner.stableKey]};
}
export function migratedChatSettings(metadata,entries,{chatUuid}={}){
    const modern=metadata.extensions?.[BINDING_NAMESPACE];
    if(modern?.schemaVersion===2){assertSafeBindingData(modern);if(!validBindingUuid(modern.chatUuid)||!modern.values||typeof modern.values!=='object'||Array.isArray(modern.values))throw Error('聊天绑定覆盖格式无效');for(const [key,value] of Object.entries(modern.values)){let pair;try{pair=JSON.parse(key);}catch{throw Error('聊天绑定覆盖键无效');}if(!Array.isArray(pair)||pair.length!==2||!pair.every(validBindingUuid)||typeof value!=='boolean')throw Error('聊天绑定覆盖身份或开关无效');}return structuredClone(modern);}
    const values={},legacy=metadata[SWITCH_KEY]?.values||{};
    for(const {archive} of entries)for(const binding of archive.bindings){
        for(const key of archive.legacyKeys||[archive.owner.stableKey,archive.migration?.sourceOwnerKey].filter(Boolean)){
            const value=legacy[JSON.stringify([archive.owner.type,key,binding.uuid])];if(typeof value==='boolean')values[bindingSwitchKey(archive.owner,binding)]=value;
        }
    }
    return {schemaVersion:2,chatUuid:validBindingUuid(chatUuid)?chatUuid:randomId(),values,legacyMigrated:true};
}

export function copiedBindingArchive(destination,source){
    const next=structuredClone(destination);
    if(next.bindings.length)throw Error('保留复制编号需要空目标；已有角色请使用明确的追加导入');
    next.nextSequence=source.nextSequence;next.bindings=source.bindings.map(b=>({...b,uuid:randomId(),shortId:(next.owner.type==='card'?'C':'U')+b.shortId.slice(1),revision:1}));return next;
}
export function mergedBindingArchive(destination,source){
    const next=structuredClone(destination);
    for(const b of source.bindings){const old=next.bindings.find(x=>x.uuid===b.uuid||x.shortId===b.shortId);if(old){if(old.uuid!==b.uuid||old.shortId!==b.shortId)throw Error('短 ID 与 UUID 冲突');Object.assign(old,b,{revision:Math.max(old.revision,b.revision)+1});}else {if(Number(b.shortId.slice(1))<next.nextSequence)throw Error('不能复用历史编号');next.bindings.push(structuredClone(b));}}
    next.nextSequence=Math.max(next.nextSequence,source.nextSequence);return next;
}
