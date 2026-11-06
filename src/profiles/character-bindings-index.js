export const searchText=value=>String(value||'').normalize('NFKC').trim().toLowerCase();
export function searchOwners(owners,query){
    const terms=searchText(query).split(/\s+/).filter(Boolean);
    return owners.filter(owner=>{const fields=[owner.name,owner.title,owner.type==='user'?owner.description:''].map(searchText);return terms.every(t=>fields.some(v=>v.includes(t)));});
}
export function createBindingLRU({maxEntries=8,maxBytes=8*1024*1024}={}){
    const values=new Map();let bytes=0;
    return {get(key){const item=values.get(key);if(!item)return;values.delete(key);values.set(key,item);return structuredClone(item.value);},set(key,value){this.delete(key);const size=new TextEncoder().encode(JSON.stringify(value)).length;if(size>maxBytes)return;values.set(key,{value:structuredClone(value),bytes:size});bytes+=size;while(values.size>maxEntries||bytes>maxBytes)this.delete(values.keys().next().value);},delete(key){const old=values.get(key);if(old)bytes-=old.bytes;values.delete(key);},clear(){values.clear();bytes=0;},stats:()=>({entries:values.size,bytes,maxEntries,maxBytes})};
}
