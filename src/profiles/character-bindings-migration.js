import {legacyOwnerKey,SWITCH_KEY,BINDING_NAMESPACE,bindingSwitchKey,validBindingUuid,assertSafeBindingData} from './character-bindings.js';
import {randomId} from '../platform/browser-crypto.js';
export function assertLegacyLocatorUnique(target,objects){
    const key=legacyOwnerKey(target.locator),collisions=objects.filter(o=>o.type===target.type&&legacyOwnerKey(o.locator)===key);
    if(collisions.length>1)throw Error('旧头像规范化产生归属冲突，绑定读取已停止，请核对完整宿主备份中的原定位');
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
