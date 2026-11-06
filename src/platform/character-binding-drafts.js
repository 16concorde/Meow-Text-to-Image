import {assertSafeBindingData} from '../profiles/character-bindings.js';
// Small, device-local drafts only. User files remain the authoritative library.
export function createBindingDraftStore({scope,enabled=()=>true,indexedDBImpl=globalThis.indexedDB}){
    let queue=Promise.resolve();
    const available=()=>!!indexedDBImpl&&enabled();
    async function transaction(mode,run){
        if(!available())return null;
        const captured=scope();const db=await new Promise((resolve,reject)=>{const request=indexedDBImpl.open('meow-character-drafts-v2',1);request.onupgradeneeded=()=>request.result.createObjectStore('drafts');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(Error('本机草稿存储不可用'));});
        try{return await new Promise((resolve,reject)=>{const tx=db.transaction('drafts',mode),store=tx.objectStore('drafts');let value;const request=run(store,captured);request.onsuccess=()=>{value=request.result;};tx.oncomplete=()=>{if(scope()!==captured)reject(Error('账户已改变，未载入旧草稿'));else resolve(value);};tx.onerror=()=>reject(Error('本机草稿读写失败'));tx.onabort=()=>reject(Error('本机草稿读写未完成'));});}finally{db.close();}
    }
    return {
        available,
        async load(){const value=await transaction('readonly',(store,key)=>store.get(key));if(!value||value.schemaVersion!==2||Date.now()-value.updated>7*86400000)return [];assertSafeBindingData(value);if(new TextEncoder().encode(JSON.stringify(value)).length>512*1024||!Array.isArray(value.drafts)||value.drafts.length>8||value.drafts.some(pair=>!Array.isArray(pair)||pair.length!==2||typeof pair[0]!=='string'||!pair[1]||typeof pair[1]!=='object'))throw Error('本机草稿格式无效');return value.drafts;},
        save(drafts){const entries=structuredClone([...drafts]).filter(([,draft])=>draft.dirty).slice(-8),value={schemaVersion:2,updated:Date.now(),drafts:entries};if(new TextEncoder().encode(JSON.stringify(value)).length>512*1024)return Promise.reject(Error('本机恢复草稿超过 512 KiB，请先保存部分对象'));const job=queue.then(()=>transaction('readwrite',(store,key)=>store.put(value,key)));queue=job.catch(()=>{});return job;},
        settled:()=>queue,
    };
}
