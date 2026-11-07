import {decodeImage} from '../images/image-export.js';
import {makeThumbnail,blobBase64} from '../images/image-thumbnails.js';
const PIXELS=16777216;
export function vibeImageData(value){
    if(typeof value!=='string')throw Error('图片需为 base64 或图片 data URL');
    const url=value.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/i),raw=url?url[2]:value;
    if(!raw||raw.length>16*1024*1024||raw.length%4===1||!/^[A-Za-z0-9+/]+={0,2}$/.test(raw))throw Error('图片 base64 无效或超过 12 MB');
    let binary;try{binary=atob(raw);}catch{throw Error('图片 base64 无效');}const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0)),view=new DataView(bytes.buffer);let mime,width,height;
    const ascii=(at,length)=>String.fromCharCode(...bytes.subarray(at,at+length));
    if(bytes.length>=24&&[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v)&&ascii(12,4)==='IHDR'){mime='image/png';width=view.getUint32(16);height=view.getUint32(20);}
    else if(bytes[0]===255&&bytes[1]===216){mime='image/jpeg';for(let at=2;at+8<bytes.length;){if(bytes[at++]!==255)continue;const marker=bytes[at++];if(marker===217||marker===218)break;if(marker===0||marker===255||marker>=208&&marker<=215)continue;const size=view.getUint16(at);if(size<2||at+size>bytes.length)break;if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)){height=view.getUint16(at+3);width=view.getUint16(at+5);break;}at+=size;}}
    else if(bytes.length>=30&&ascii(0,4)==='RIFF'&&ascii(8,4)==='WEBP'){mime='image/webp';const type=ascii(12,4);if(type==='VP8X'){width=1+bytes[24]+(bytes[25]<<8)+(bytes[26]<<16);height=1+bytes[27]+(bytes[28]<<8)+(bytes[29]<<16);}else if(type==='VP8L'&&bytes[20]===47){width=1+bytes[21]+((bytes[22]&63)<<8);height=1+(bytes[22]>>6)+(bytes[23]<<2)+((bytes[24]&15)<<10);}else if(type==='VP8 '&&bytes[23]===157&&bytes[24]===1&&bytes[25]===42){width=view.getUint16(26,true)&16383;height=view.getUint16(28,true)&16383;}}
    if(!mime||!width||!height||width>16384||height>16384||width*height>PIXELS)throw Error('图片格式无效或像素超过 1600 万');
    if(url&&url[1].toLowerCase()!==mime)throw Error('图片 MIME 与实际字节不一致');
    return {raw,mime,width,height,bytes,url:'data:'+mime+';base64,'+raw};
}
export async function prepareVibePreview(item,{decode=decodeImage,thumbnail=makeThumbnail,encode=blobBase64}={}){
    const next={...item};let original;
    if(next.image){let image;try{original=vibeImageData(next.image);image=await decode(new Blob([original.bytes],{type:original.mime}));const width=image.naturalWidth||image.width,height=image.naturalHeight||image.height;if(!width||!height||width*height>PIXELS)throw Error('图片像素超过限制');}catch{next.image=null;original=null;}finally{image?.close?.();}}
    if(next.thumbnail){let image;try{const data=vibeImageData(next.thumbnail);image=await decode(new Blob([data.bytes],{type:data.mime}));next.thumbnail=data.url;next.previewState='ready';return next;}catch{next.thumbnail=null;}finally{image?.close?.();}}
    if(original){try{const blob=await thumbnail(new Blob([original.bytes],{type:original.mime}));next.thumbnail=vibeImageData('data:'+blob.type+';base64,'+await encode(blob)).url;}catch{next.thumbnail=original.url;}next.previewState='ready';return next;}
    if(!Object.keys(next.encodings||{}).length)throw Error('Vibe 没有可解码的图像或有效编码');next.previewState='encoding-only';return next;
}
