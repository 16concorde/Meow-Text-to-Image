import {parseImageLayout} from './image-layout.js';
import {parseNAICharacterSegments} from './multi-character.js';
import {parseBodyBlocks} from '../core/core.js';

// Change only the first capture of this exact occurrence. Reject delimiters
// that would split one tag into several tags or consume a neighbouring tag.
export function editedTag(text,block,prompt,pattern,format={}){
    prompt=String(prompt).trim();if(!prompt)throw Error('提示词不能为空');
    if(parseImageLayout(prompt).metadataStatus!=='missing')throw Error('这里只编辑 Tag 正文，请保留原构图标记');
    parseNAICharacterSegments(prompt,format.model??'nai-diffusion-4-5-full');
    const before=parseBodyBlocks(text,pattern,format),current=before.find(item=>item.start===block.start&&item.raw===block.raw);
    if(!current)throw Error('原 tag 已变化，请重新打开提示词');
    let match;try{match=new RegExp(pattern,'id').exec(current.raw);}catch{match=new RegExp(pattern,'i').exec(current.raw);}
    if(!match?.[1])throw Error('无法定位 tag 提示词');
    const at=match.indices?.[1]?.[0]??current.raw.indexOf(match[1]);
    const start=current.start+at,end=start+match[1].length;
    const layout=parseImageLayout(match[1]);if(layout.metadataStatus==='blocked')throw Error(layout.error);const content=layout.metadataStatus==='missing'?prompt:layout.header+prompt+( /[\r\n]$/.test(match[1])?'\n':'');
    const next=text.slice(0,start)+content+text.slice(end),after=parseBodyBlocks(next,pattern,format),replacement=after[current.bodyIndex];
    if(after.length!==before.length||!replacement||replacement.prompt!==prompt||before.some((item,i)=>i!==current.bodyIndex&&item.raw!==after[i].raw))throw Error('提示词不能包含捕捉标签的起始或结束标记');
    return {text:next,block:replacement};
}
