// Leaf patches compose against the latest confirmed snapshot, never a queued full snapshot.
export function configPatch(before,after,path=[]){
    if(JSON.stringify(before)===JSON.stringify(after))return [];
    if(before&&after&&typeof before==='object'&&typeof after==='object'&&!Array.isArray(before)&&!Array.isArray(after))return [...new Set([...Object.keys(before),...Object.keys(after)])].flatMap(key=>configPatch(before[key],after[key],[...path,key]));
    return [{path,value:after===undefined?undefined:structuredClone(after)}];
}
export function applyConfigPatch(config,patch){
    const next=structuredClone(config);
    for(const {path,value} of patch){let target=next;for(const key of path.slice(0,-1))target=target[key]??={};if(value===undefined)delete target[path.at(-1)];else target[path.at(-1)]=structuredClone(value);}
    return next;
}

export function mergePromptChanges(base,remote,local,patcher=configPatch){
    const ours=patcher(base,local),theirs=patcher(base,remote);
    const overlaps=(a,b)=>a.every((key,i)=>b[i]===key)||b.every((key,i)=>a[i]===key);
    for(const a of ours)for(const b of theirs)if(overlaps(a.path,b.path)&&JSON.stringify(a.value)!==JSON.stringify(b.value))throw Object.assign(Error('提示词同一字段已被其他页面修改；当前草稿保留，请核对最新配置后重试'),{status:'conflicted',fields:[a.path.join('.')]});
    return applyConfigPatch(remote,ours);
}

export function intendedConfigPatch(base,next,paths=[]){
    const patch=configPatch(base,next);
    for(const path of paths){const value=path.reduce((item,key)=>item?.[key],next);patch.push({path:[...path],value:value===undefined?undefined:structuredClone(value)});}
    return patch;
}
