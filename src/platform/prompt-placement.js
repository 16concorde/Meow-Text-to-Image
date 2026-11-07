export const promptPlacementCapabilities=Object.freeze({supportsDepth:true,limits:{minDepth:0,maxDepth:10000}});
export function publishPrompt(host,id,text,{depth=0}={}){
    if(!Number.isInteger(depth)||depth<0||depth>10000)throw Error('注入深度无效');
    if(typeof host.setExtensionPrompt!=='function')throw Error('宿主不支持 setExtensionPrompt');
    host.setExtensionPrompt(id,text,1,depth,false,0);
    const actual=host.extensionPrompts?.[id]??host.extension_prompts?.[id];
    if(actual&&(actual.value!==text||actual.depth!==depth||actual.position!==1))throw Error('宿主提示词发布核验失败');
    return text;
}
