import {sha256} from '../platform/browser-crypto.js';
import {readImageMetadata,generationInfo} from '../images/image-metadata.js';
import {vibeModelKeys,validBase64} from './vibe.js';
// Official public image client, schema v1 (checked 2026-11-07); IDs hash source strings.
export async function validateVibeFile(data){
    if(data?.identifier!==undefined){
        if(!['novelai-vibe-transfer','novelai-vibe-transfer-bundle'].includes(data.identifier)||data.version!==1)throw Error('不支持的 Vibe 文件结构或版本');
        if(data.identifier==='novelai-vibe-transfer-bundle'){
            if(!Array.isArray(data.vibes)||!data.vibes.length||data.vibes.length>128)throw Error('Vibe Bundle 需包含 1～128 项');
        }else{
            if(!['image','encoding'].includes(data.type)||!/^[a-f0-9]{64}$/.test(data.id||''))throw Error('官方 Vibe 类型或指纹无效');
            const original=data.type==='image'?data.image:Object.values(data.encodings||{}).flatMap(v=>Object.values(v||{}))[0]?.encoding;
            if(typeof original!=='string'||await sha256(original)!==data.id)throw Error('官方 Vibe 内容与指纹不一致');
        }
    }
    if(Array.isArray(data?.vibes))for(const vibe of data.vibes)await validateVibeFile(vibe);
    return data;
}
export async function pngVibeData(blob,{mode='auto',readMetadata=readImageMetadata}={}){
    if(!['auto','image','encodings'].includes(mode))throw Error('PNG 导入方式无效');if(mode==='image')return null;
    const metadata=await readMetadata(blob),pack=metadata.text?.find(item=>item.keyword==='naidata');
    if(pack){if(!validBase64(pack.text))throw Error('PNG 内嵌 Vibe 数据无效');let data;try{data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(pack.text),c=>c.charCodeAt(0))));}catch{throw Error('PNG 内嵌 Vibe JSON 无效');}if(!data.identifier)throw Error('不支持的 PNG 内嵌 Vibe 结构');return validateVibeFile(data);}
    const comment=metadata.text?.find(item=>item.keyword==='Comment')?.parameters,encodings=comment?.reference_image_multiple;
    if(Array.isArray(encodings)&&encodings.length){
        if(encodings.length>128)throw Error('PNG 内嵌 Vibe 超过 128 项');
        const model=vibeModelKeys[generationInfo(metadata).modelId];if(!model)throw Error('无法确认 PNG 内嵌 Vibe 的模型；请使用「Vibe 编码」选择原图');
        return {vibes:encodings.map((encoding,i)=>{if(!validBase64(encoding))throw Error('PNG 内嵌 Vibe 编码无效');return {name:'PNG 内嵌 Vibe '+(i+1),encodings:{[model]:{unknown:{encoding,params:{information_extracted:1}}}}};})};
    }
    if(mode==='encodings')throw Error('图片中没有已编码 Vibe，请使用「Vibe 编码」');return null;
}
