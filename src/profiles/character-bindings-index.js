export const searchText=value=>String(value||'').normalize('NFKC').trim().toLowerCase();
export function ownerSummary(target,archive){return {ownerId:archive.owner.ownerId,type:target.type,locator:target.locator,name:target.name,title:target.title||'',description:(target.description||'').slice(0,512),revision:archive.revision,count:archive.bindings.length,bindings:archive.bindings.map(b=>({name:b.name,aliases:[...b.aliases],archived:b.archived})),updated:Date.now()};}
export function searchOwners(owners,summaries,query,{includeArchived=false}={}){
    const terms=searchText(query).split(/\s+/).filter(Boolean);
    return owners.flatMap(owner=>{const summary=summaries.find(s=>s.type===owner.type&&s.locator===owner.locator),bindings=(summary?.bindings||[]).filter(b=>includeArchived||!b.archived),fields=[owner.name,owner.title,owner.description,...bindings.flatMap(b=>[b.name,...b.aliases])].map(searchText);
        if(!terms.every(term=>fields.some(field=>field.includes(term))))return [];
        const hit=terms.length?bindings.find(b=>terms.some(t=>[b.name,...b.aliases].some(v=>searchText(v).includes(t)))):null;
        return [{...owner,ownerId:summary?.ownerId,count:summary?.count,matchedBinding:hit?.name}];});
}
export function createBindingLRU({maxEntries=8,maxBytes=8*1024*1024}={}){
    const values=new Map();let bytes=0;
    return {get(key){const item=values.get(key);if(!item)return;values.delete(key);values.set(key,item);return structuredClone(item.value);},set(key,value){this.delete(key);const size=new TextEncoder().encode(JSON.stringify(value)).length;if(size>maxBytes)return;values.set(key,{value:structuredClone(value),bytes:size});bytes+=size;while(values.size>maxEntries||bytes>maxBytes)this.delete(values.keys().next().value);},delete(key){const old=values.get(key);if(old)bytes-=old.bytes;values.delete(key);},clear(){values.clear();bytes=0;},stats:()=>({entries:values.size,bytes,maxEntries,maxBytes})};
}
