// Literal protocol rendering is restricted to known source slots and syntax.
const protocolSlots=new Set(['tags.full:body','tags.binding:body','output.format:body']);
export function validateCaptureProtocol(protocol,marker='',reasoning={}){
    const {start,end}=protocol||{};
    for(const text of [start,end])if(typeof text!=='string'||!text.trim()||/[\r\n\u0000-\u001f\u007f]/.test(text)||/\{\{|\}\}/.test(text))throw Error('捕捉标签需为非空单行字面文本，不支持宏');
    if(start===end||end.includes(start)||start.startsWith(end))throw Error('捕捉起止标签存在歧义');
    for(const reserved of ['<imageTag>','</imageTag>','<imgthink>','</imgthink>','<easter_egg>','</easter_egg>',reasoning.prefix,reasoning.suffix,marker].filter(Boolean))if([start,end].some(s=>s.includes(reserved)||reserved.includes(s)))throw Error('捕捉标签与结构标签或彩蛋位置冲突');
    // An end suffix inside start is legal (the default image### / ### protocol).
    for(let i=1;i<Math.min(start.length,end.length);i++)if(end.endsWith(start.slice(0,i)))throw Error('捕捉标签边界重叠');
    return protocol;
}
export function renderTask(text,config,eggActive){
    const note='（这里`，以及彩蛋插图 1 张，彩蛋必须生成在 （彩蛋标签） 标记之后。彩蛋插图不计入正文原定张数，全部输出数量为「正文图片数 + 1 张」`这些内容在开启了彩蛋后才额外加入）';
    text=text.replace(note,'');
    if(!eggActive)text=text.replace('，以及彩蛋插图 1 张，彩蛋必须生成在 （彩蛋标签） 标记之后。彩蛋插图不计入正文原定张数，全部输出数量为「正文图片数 + 1 张」。','。');
    return text.replace(/（数量）|（彩蛋标签）/g,t=>t==='（数量）'?config.params.count:config.params.eggMarker);
}
export function renderPromptSlot(text,id,slot,config,{bindingRoster}={}){
    if(id==='tags.binding'&&slot==='body'){
        const header='【可用绑定 ID 对照表】';
        // Source includes the author's empty roster example; only runtime owns it.
        const at=text.indexOf(header);if(at>=0)text=text.slice(0,at).trimEnd();
        text+='\n\n'+header+'\n'+(bindingRoster||'（当前无可用绑定；所有人物须按未绑定规则写完整外貌 Tag，不得输出 ID）');
    }
    if(!protocolSlots.has(id+':'+slot))return text;
    const {start,end}=config.capture;
    // One pass: tokens inside macros are opaque; inserted delimiters are never scanned again.
    let output='',at=0;
    while(at<text.length){
        if(text.startsWith('{{',at)){
            const from=at;let depth=0;
            do{if(text.startsWith('{{',at)){depth++;at+=2;}else if(text.startsWith('}}',at)){depth--;at+=2;}else at++;}while(at<text.length&&depth);
            output+=text.slice(from,at);continue;
        }
        if(text.startsWith('image###...###',at)){output+=start+'...'+end;at+=14;continue;}
        if(text.startsWith('image###',at)){output+=start;at+=8;continue;}
        if((at===0||text[at-1]==='\n')&&text.startsWith('###',at)&&(at+3===text.length||text[at+3]==='\n')){output+=end;at+=3;continue;}
        output+=text[at++];
    }
    return output;
}
