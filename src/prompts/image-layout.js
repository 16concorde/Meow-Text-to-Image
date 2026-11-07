export const IMAGE_LAYOUT_VERSION=1;
export const imageOrientations=Object.freeze({landscape:Object.freeze({width:1216,height:832}),portrait:Object.freeze({width:832,height:1216})});
const own=(value)=>Object.hasOwn(imageOrientations,value);
// Only a bounded, contiguous header at the first non-empty line is metadata.
export function parseImageLayout(content){
    const rawContent=String(content??''),lines=rawContent.match(/[^\r\n]*(?:\r\n|\n|\r|$)/g)||[];let offset=0,headers=0,invalid=false,orientation=null,seen=false;
    for(const line of lines){const value=line.trim();if(!value){offset+=line.length;if(seen&&offset>1024)return {rawContent,cleanPrompt:'',orientation:null,metadataStatus:'blocked',header:rawContent.slice(0,offset),contentStart:offset,error:'图片构图头部超过限制，请只保留一行横竖标记'};continue;}
        if(!/^@orientation\b/i.test(value))break;
        seen=true;headers++;if(headers>4||line.length>160||offset+line.length>1024)return {rawContent,cleanPrompt:'',orientation:null,metadataStatus:'blocked',header:rawContent.slice(0,offset),contentStart:offset,error:'图片构图头部超过限制，请只保留一行横竖标记'};
        const match=/^@orientation\s*:\s*(landscape|portrait)\s*$/i.exec(value),next=match?.[1]?.toLowerCase();if(!next||orientation&&orientation!==next)invalid=true;if(next)orientation=next;offset+=line.length;
    }
    if(!seen)return {rawContent,cleanPrompt:rawContent.trim(),orientation:null,metadataStatus:'missing',header:'',contentStart:0};
    return {rawContent,cleanPrompt:rawContent.slice(offset).trim(),orientation:invalid?null:orientation,metadataStatus:invalid?'invalid':'valid',header:rawContent.slice(0,offset),contentStart:offset};
}
export function imageBlockIdentity(block){const layout=block.layout;return !layout||layout.metadataStatus==='missing'?block.prompt:'@miao-layout-v1:'+JSON.stringify([layout.header,block.prompt]);}
export function imageLayoutSettings(profile){
    const mode=profile.imageSizeMode??'fixed',fallback=profile.imageOrientationFallback??'portrait';if(!['fixed','ai'].includes(mode)||!own(fallback))throw Error('图片构图模式或回退方向无效');return {mode,fallback};
}
export function resolveImageDimensions(profile,{layout=parseImageLayout(''),orientationOverride,history,fixedSize=false}={}){
    if(layout.metadataStatus==='blocked')throw Error(layout.error);const {mode,fallback}=imageLayoutSettings(profile);let width,height,orientation=null,source;
    if(orientationOverride!==undefined){if(!own(orientationOverride))throw Error('单图构图只允许 landscape 或 portrait');orientation=orientationOverride;({width,height}=imageOrientations[orientation]);source='manual';}
    else if(history?.width!==undefined&&history?.height!==undefined){({width,height}=history);source='history';orientation=width>height?'landscape':height>width?'portrait':null;}
    else if(fixedSize||mode==='fixed'){({width,height}=profile);source=fixedSize?'fixed-path':'fixed';orientation=width>height?'landscape':height>width?'portrait':null;}
    else{orientation=layout.metadataStatus==='valid'?layout.orientation:fallback;({width,height}=imageOrientations[orientation]);source=layout.metadataStatus==='valid'?'model':'fallback';}
    return {version:IMAGE_LAYOUT_VERSION,mode:fixedSize?'fixed':mode,parsedOrientation:layout.orientation,metadataStatus:layout.metadataStatus,orientation,source,width:+width,height:+height};
}
export function aiLayoutEnabled(settings){
    const profiles=settings.profiles??[],selected=settings.profileSelectionMode==='random'?profiles.filter(p=>settings.randomProfileIds?.includes(p.id)):[profiles[settings.active]];
    if(settings.eggProfileEnabled)selected.push(profiles.find(p=>p.id===settings.eggProfileId));return selected.some(p=>p?.imageSizeMode==='ai');
}
export function imageLayoutInstruction(capture){return `【逐图选择横竖构图】\n每个 ${capture.start} ... ${capture.end} 图片块内的第一行仅写 @orientation: landscape 或 @orientation: portrait，下一行开始写绘图 Tag。landscape 对应横构图，portrait 对应竖构图；每张正文配图与彩蛋分别选择，不输出任意尺寸、其他参数或解释。横向互动、人物并排或环境较多可选横图，纵向主体与动作可选竖图；按画面需要决定，不按人数强制选择。`;}
