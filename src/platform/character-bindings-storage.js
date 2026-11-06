import {sha256} from './browser-crypto.js';
import {hostFetch} from './host-fetch.js';
import {emptyBindingArchive,validateBindingArchive,ownerIdentity,BINDING_LIMITS} from '../profiles/character-bindings.js';

export function createCharacterBindingStorage({getHeaders,fetchImpl=fetch}){
    let queue=Promise.resolve();
    const serial=fn=>{const job=queue.then(fn);queue=job.catch(()=>{});return job;};
    const filename=async owner=>`miao-character-${owner.type}-v1-${await sha256(ownerIdentity(owner))}.json`;
    async function readFile(name){
        const r=await hostFetch('/user/files/'+name,{cache:'no-store'},{fetchImpl});
        if(r.status===404)return null;
        if(!r.ok)throw Error(`角色文件读取失败（HTTP ${r.status}），未初始化空档案`);
        const text=await r.text();if(new TextEncoder().encode(text).length>BINDING_LIMITS.bytes)throw Error('角色文件超过容量上限');
        let value;try{value=JSON.parse(text);}catch{throw Error('角色文件 JSON 损坏，请从备份恢复');}
        return {value,hash:await sha256(text)};
    }
    async function upload(name,value){
        const bytes=new TextEncoder().encode(JSON.stringify(value));if(bytes.length>BINDING_LIMITS.bytes)throw Error('角色文件超过容量上限');
        let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
        const r=await hostFetch('/api/files/upload',{method:'POST',headers:getHeaders(),body:JSON.stringify({name,data:btoa(binary)})},{fetchImpl});
        if(!r.ok)throw Error(`角色文件保存失败（HTTP ${r.status}）`);
        const result=await r.json();if('/'+String(result.path).replace(/^\//,'')!=='/user/files/'+name)throw Error('角色文件返回路径异常');
        return sha256(JSON.stringify(value));
    }
    return {
        async load(owner){const data=await readFile(await filename(owner));return {archive:data?validateBindingArchive(data.value,owner):emptyBindingArchive(owner),hash:data?.hash??null};},
        save(archive,expectedHash){return serial(async()=>{
            validateBindingArchive(archive);const name=await filename(archive.owner),current=await readFile(name);
            if((current?.hash??null)!==expectedHash)throw Error('角色档案已被其它窗口修改，请重载后再保存');
            const next=structuredClone(archive);next.revision++;const hash=await upload(name,next);return {archive:next,hash};
        });},
        writeSnapshot(snapshot){return serial(async()=>{const ref=await sha256(JSON.stringify(snapshot)),name=`miao-character-snapshot-v1-${ref}.json`,existing=await readFile(name);if(!existing)await upload(name,snapshot);else if(await sha256(JSON.stringify(existing.value))!==ref)throw Error('历史绑定快照校验失败');return ref;});},
        async readSnapshot(ref){if(!/^[a-f0-9]{64}$/.test(ref))throw Error('历史快照引用无效');const data=await readFile(`miao-character-snapshot-v1-${ref}.json`);if(!data||await sha256(JSON.stringify(data.value))!==ref)throw Error('历史绑定不可还原：快照缺失或损坏，请编辑本次 Tag 重新关联');return data.value;},
    };
}
