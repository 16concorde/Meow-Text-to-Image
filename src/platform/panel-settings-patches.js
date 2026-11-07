// Stable profile/binding arrays can be patched by index only while their ID order is unchanged.
export function panelSettingsPatch(before,after,path=[]){
    if(JSON.stringify(before)===JSON.stringify(after))return [];
    const arrays=Array.isArray(before)&&Array.isArray(after)&&before.length===after.length&&before.every((value,i)=>value?.id&&value.id===after[i]?.id);
    const objects=before&&after&&typeof before==='object'&&typeof after==='object'&&!Array.isArray(before)&&!Array.isArray(after);
    if(objects||arrays)return [...new Set([...Object.keys(before),...Object.keys(after)])].flatMap(key=>panelSettingsPatch(before[key],after[key],[...path,key]));
    return [{path,value:after===undefined?undefined:structuredClone(after)}];
}
