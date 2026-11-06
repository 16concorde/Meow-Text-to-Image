import {validBindingUuid,normalizeOwnerKey,ownerIdentity} from './character-bindings.js';
export const OWNER_INDEX_FILE='miao-character-owner-index-v2.json';
export const ownerLocatorKey=target=>JSON.stringify([target.type,normalizeOwnerKey(target.locator)]);
export function validateOwnerIndex(value){
    if(value?.schemaVersion!==2||!Number.isSafeInteger(value.revision)||!Array.isArray(value.owners)||value.owners.length>10000)throw Error('所属身份索引损坏');
    const ids=new Set(),active=new Set();
    for(const r of value.owners){if(!validBindingUuid(r.ownerId)||ids.has(r.ownerId)||!['card','user'].includes(r.type)||!['ready','pending','missing'].includes(r.state)||!Array.isArray(r.aliases))throw Error('所属身份记录无效');ids.add(r.ownerId);normalizeOwnerKey(r.locator);r.aliases.forEach(normalizeOwnerKey);if(r.state!=='missing'){const key=ownerLocatorKey(r);if(active.has(key))throw Error('所属身份定位冲突');active.add(key);}}
    return value;
}
export function assertArchiveEvolution(previous,next){
    if(ownerIdentity(previous.owner)!==ownerIdentity(next.owner)||next.nextSequence<previous.nextSequence)throw Error('不能重分配所属身份或回退短 ID');
    for(const old of previous.bindings){const b=next.bindings.find(b=>b.uuid===old.uuid);if(!b||b.shortId!==old.shortId||b.revision<old.revision)throw Error('不能删除或重分配历史角色身份，请归档');}
    for(const b of next.bindings)if(!previous.bindings.some(old=>old.uuid===b.uuid)&&Number(b.shortId.slice(1))<previous.nextSequence)throw Error('不能复用历史短 ID');
}
