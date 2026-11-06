import {sha256} from './browser-crypto.js';
import {hostFetch} from './host-fetch.js';
import {randomId} from './browser-crypto.js';
import {emptyBindingArchive,validateBindingArchive,ownerIdentity,BINDING_LIMITS,assertSafeBindingData,legacyOwnerKey} from '../profiles/character-bindings.js';

export function createCharacterBindingStorage({getHeaders,fetchImpl=fetch,scope=()=>'',locks=globalThis.navigator?.locks}){
    let queue=Promise.resolve();const pending=new Map(),subscribers=new Set();let channel=null,channelScope=null;
    function coordinate(){if(typeof window==='undefined'||typeof BroadcastChannel!=='function')return;if(channelScope!==scope()){channel?.close();channelScope=scope();channel=new BroadcastChannel('meow-bindings:'+channelScope);channel.onmessage=event=>{if(event.data?.scope===scope())for(const fn of subscribers)fn(event.data);};}}
    const serial=fn=>{const captured=scope(),run=()=>{if(scope()!==captured)throw Error('账户或数据集已改变，写入未开始');return fn();};const job=queue.then(()=>locks?.request?locks.request('meow-bindings:'+captured,run):run());queue=job.catch(()=>{});return job;};
    const filename=async owner=>owner.ownerId?`miao-character-${owner.type}-v2-${owner.ownerId}.json`:`miao-character-${owner.type}-v1-${await sha256(ownerIdentity({...owner,stableKey:legacyOwnerKey(owner.stableKey)}))}.json`;
    const fileLimit=name=>BINDING_LIMITS.bytes+(/^(?:miao-character-recovery|miao-character-legacy-backup)-/.test(name)?65536:0);
    async function readFile(name){
        const captured=scope();coordinate();
        if(!/^miao-character-[a-zA-Z0-9.-]+\.json$/.test(name))throw Error('角色文件名无效');
        const r=await hostFetch('/user/files/'+name,{cache:'no-store'},{fetchImpl});
        if(scope()!==captured)throw Error('账户或数据集已改变，读取结果已丢弃');
        if(r.status===404)return null;
        if(!r.ok)throw Error(`角色文件读取失败（HTTP ${r.status}），未初始化空档案`);
        if(Number(r.headers?.get('content-length'))>fileLimit(name))throw Error('角色文件超过容量上限');
        const text=await r.text();if(new TextEncoder().encode(text).length>fileLimit(name))throw Error('角色文件超过容量上限');
        let value;try{value=assertSafeBindingData(JSON.parse(text));}catch{throw Error('角色文件 JSON 损坏或包含危险字段，请从备份恢复');}
        const hash=await sha256(text);if(scope()!==captured)throw Error('账户或数据集已改变');return {value,hash};
    }
    async function upload(name,value){
        const captured=scope();assertSafeBindingData(value);const serialized=JSON.stringify(value),hash=await sha256(serialized),bytes=new TextEncoder().encode(serialized);
        if(bytes.length>fileLimit(name))throw Error('角色文件超过容量上限');
        let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
        if(scope()!==captured)throw Error('账户或数据集已改变，写入未开始');
        let failure;
        try{
            const r=await hostFetch('/api/files/upload',{method:'POST',headers:getHeaders(),body:JSON.stringify({name,data:btoa(binary)})},{fetchImpl});
            if(!r.ok)throw Error(`角色文件保存失败（HTTP ${r.status}）`);
            const result=await r.json();if('/'+String(result.path).replace(/^\//,'')!=='/user/files/'+name)throw Error('角色文件返回路径异常');
        }catch(error){failure=error;}
        if(scope()!==captured)throw Object.assign(Error('账户已改变，原写入结果待查证'),{saveState:'unknown'});
        let confirmed;try{confirmed=await readFile(name);}catch{const e=Error('保存结果未知，请重新查证；草稿和恢复版本已保留，请勿重复新建');e.saveState='unknown';throw e;}
        if(confirmed?.hash===hash)return hash;
        if(failure)throw failure;
        const e=Error('保存未获读回确认，请保留草稿并重试或查证结果');e.saveState='unconfirmed';throw e;
    }
    async function publish(name,value,expectedHash){
        const current=await readFile(name),desiredHash=await sha256(JSON.stringify(value));
        if(current?.hash===desiredHash){pending.delete(scope()+':'+name);return desiredHash;}
        if((current?.hash??null)!==expectedHash){const e=Error('角色档案已被其它窗口修改，请保留草稿，重载并比较后再保存');e.saveState='conflict';e.latest=current?.value;e.baseHash=expectedHash;throw e;}
        const hash=await sha256(JSON.stringify(value)),token=scope()+':'+name;
        let op=pending.get(token);
        if(!op||op.hash!==hash){const id=value._recovery?.opId??randomId(),key=await sha256(name);op={opId:id,hash,name,candidate:`miao-character-recovery-v2-${key}-${id}.json`,baseHash:expectedHash};pending.set(token,op);}
        await upload(op.candidate,{schemaVersion:2,operation:op,value,parent:current?.value?._recovery??null});
        const opName=`miao-character-operation-v2-${await sha256(name)}.json`;
        await upload(opName,{schemaVersion:2,...op});
        const latest=await readFile(name);if((latest?.hash??null)!==expectedHash){const e=Error('发布前发现并发修改，恢复版本已保留，请比较后重试');e.saveState='conflict';e.latest=latest?.value;throw e;}
        const confirmed=await upload(name,value);pending.delete(token);channel?.postMessage({scope:scope(),name,hash:confirmed});return confirmed;
    }
    const api={
        serial,filename,readJSON:readFile,
        subscribe(fn){coordinate();subscribers.add(fn);return ()=>subscribers.delete(fn);},
        dispose(){channel?.close();subscribers.clear();},
        publishJSON:(name,value,expectedHash)=>serial(()=>publish(name,value,expectedHash)),
        async immutableJSON(name,value){return serial(async()=>{const old=await readFile(name),hash=await sha256(JSON.stringify(value));if(old){if(old.hash!==hash)throw Error('不可变恢复文件冲突');return hash;}return upload(name,value);});},
        async load(owner){const data=await readFile(await filename(owner));return {archive:data?validateBindingArchive(data.value,owner.ownerId?owner:{...owner,stableKey:legacyOwnerKey(owner.stableKey)}):emptyBindingArchive(owner),hash:data?.hash??null};},
        save(archive,expectedHash){return serial(async()=>{validateBindingArchive(archive);const next=structuredClone(archive);next.revision++;if(next.schemaVersion===2)next._recovery={parentOpId:archive._recovery?.opId??null,opId:await sha256(JSON.stringify(next))};const hash=await publish(await filename(archive.owner),next,expectedHash);return {archive:next,hash};});},
        writeSnapshot(snapshot){return serial(async()=>{const ref=await sha256(JSON.stringify(snapshot)),name=`miao-character-snapshot-v1-${ref}.json`,existing=await readFile(name);if(!existing)await upload(name,snapshot);else if(await sha256(JSON.stringify(existing.value))!==ref)throw Error('历史绑定快照校验失败');return ref;});},
        async readSnapshot(ref){if(!/^[a-f0-9]{64}$/.test(ref))throw Error('历史快照引用无效');const data=await readFile(`miao-character-snapshot-v1-${ref}.json`);if(!data||await sha256(JSON.stringify(data.value))!==ref)throw Error('历史绑定不可还原：快照缺失或损坏，请编辑本次 Tag 重新关联');return data.value;},
        pendingOperations:()=>[...pending.values()].map(({opId,name,candidate,hash})=>({opId,name,candidate,hash})),
    };
    return api;
}
