// Single pipes separate characters; paired pipes delimit NAI randomizers.
// Return offsets so callers can preserve every other byte of the prompt.
export function scanNAIPipes(prompt){
    const separators=[];let random=false;
    for(let i=0;i<prompt.length;i++)if(prompt[i]==='|'){
        if(prompt[i+1]==='|'){random=!random;i++;}
        else if(!random)separators.push(i);
    }
    return {separators,unclosed:random};
}
export function naiCharacterLimit(model){
    if(/^nai-diffusion-5(?:-|$)/.test(model))return 22;
    if(/^nai-diffusion-4(?:-|$)/.test(model))return 6;
    return 0;
}
export function parseNAICharacterSegments(rawPrompt,model){
    const {separators,unclosed}=scanNAIPipes(rawPrompt);
    if(unclosed)throw Error('提示词中的 || 随机化段未闭合');
    if(!separators.length)return {hasCharacters:false,base:rawPrompt,characters:[]};
    const parts=[];let start=0;
    for(const end of [...separators,rawPrompt.length]){parts.push(rawPrompt.slice(start,end).trim());start=end+1;}
    if(parts.some(part=>!part))throw Error('多角色提示词的 base 和每个角色段都不能为空，请检查管道符（|）');
    const limit=naiCharacterLimit(model);
    if(!limit)throw Error('该模型不支持多角色管道符，请使用 NovelAI V4/V4.5/V5');
    if(parts.length-1>limit)throw Error(`该模型最多支持 ${limit} 个角色提示词`);
    return {hasCharacters:true,base:parts[0],characters:parts.slice(1)};
}
// Validate snapshots/direct callers before key reads, queue admission or POST.
export function normalizeNAICharacterRequest(request){
    const parsed=parseNAICharacterSegments(request.prompt??'',request.model);
    for(const segment of [parsed.base,...parsed.characters])if(/^[UC]\d+(?:,|$)/.test(segment.trim()))throw Error('请求中存在未解析的绑定 ID，请编辑本次 Tag');
    if(request.naiCharacters===undefined&&request.naiCharacterNegatives!==undefined)throw Error('角色负面缺少对应正面数组');
    if(request.naiCharacters===undefined)return parsed.hasCharacters?{...request,prompt:parsed.base,naiCharacters:parsed.characters}:request;
    const characters=request.naiCharacters,limit=naiCharacterLimit(request.model);
    if(!Array.isArray(characters)||!characters.length||!limit||characters.length>limit)throw Error('多角色请求的角色列表或模型上限无效');
    if(parsed.hasCharacters||!parsed.base.trim())throw Error('多角色请求的全局 base 不能包含角色分隔符或为空');
    for(const character of characters){
        if(typeof character!=='string'||!character.trim()||parseNAICharacterSegments(character,request.model).hasCharacters)throw Error('多角色请求的角色段无效');
    }
    if(request.naiCharacterNegatives!==undefined&&(!Array.isArray(request.naiCharacterNegatives)||request.naiCharacterNegatives.length!==characters.length||request.naiCharacterNegatives.some(v=>typeof v!=='string')))throw Error('角色负面数组与正面不匹配');
    for(const segment of [request.prompt,...characters])if(/^[UC]\d+(?:,|$)/.test(segment.trim()))throw Error('请求中存在未解析的绑定 ID');
    return request;
}
