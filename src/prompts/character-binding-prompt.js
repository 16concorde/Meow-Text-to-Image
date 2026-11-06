import {parseNAICharacterSegments,scanNAIPipes} from './multi-character.js';
const reference=/^[UC]\d+$/;
export function bindingReferences(prompt){
    const {separators}=scanNAIPipes(prompt),parts=[];let start=0;
    for(const end of [...separators,prompt.length]){parts.push(prompt.slice(start,end).trim());start=end+1;}
    return parts.map((part,index)=>({id:part.split(',')[0].trim(),index})).filter(p=>reference.test(p.id));
}
export function resolveBindingPrompt(prompt,model,bindings){
    const segments=parseNAICharacterSegments(prompt,model),refs=bindingReferences(prompt);
    if(!refs.length)return {...segments,negatives:[],used:[]};
    if(!segments.hasCharacters||refs.some(r=>r.index===0))throw Error('绑定 ID 必须在 base | 角色段 的角色首标签，请编辑本次 Tag');
    const used=[],seen=new Set(),negatives=[];
    const characters=segments.characters.map(segment=>{
        const comma=segment.indexOf(','),id=(comma<0?segment:segment.slice(0,comma)).trim();
        if(!reference.test(id)){negatives.push('');return segment;}
        const b=bindings.find(b=>b.shortId===id&&b.enabled&&!b.archived);
        if(!b)throw Error(`绑定 ${id} 不可用，请编辑本次 Tag 或恢复绑定并选择绑定模式`);
        const fixed=scanNAIPipes(b.positive);
        if(fixed.unclosed||fixed.separators.length||reference.test(b.positive.split(',')[0].trim()))throw Error('绑定固定正面不能包含人物分隔符或绑定 ID，请编辑角色档案');
        if(seen.has(id))throw Error(`绑定 ${id} 在同一图片中重复`);seen.add(id);
        const dynamic=comma<0?'':segment.slice(comma+1).trim();
        if(dynamic.split(',').some(t=>reference.test(t.trim())))throw Error('一个角色段只能引用一个绑定 ID');
        used.push({...structuredClone(b),dynamic});negatives.push(b.negative);
        return [b.positive,dynamic].filter(Boolean).join(', ');
    });
    return {...segments,characters,negatives,used};
}
