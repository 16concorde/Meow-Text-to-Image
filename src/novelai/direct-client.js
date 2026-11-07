import {prepareVibePreview} from '../vibe/vibe-image.js';
import {jsonEqual} from '../platform/settings-save.js';
import {normalizeNAICharacterRequest} from '../prompts/multi-character.js';
import {reportNAIFailure} from './nai-diagnostics.js';
import {generationTimeoutSeconds} from '../generation/generation-timeout.js';
import {prepareGeneration,sendPrepared} from '../generation/generation-lifecycle.js';
import {importVibeData,resolveVibes,vibeSummary,vibeModelKeys,stripImage} from '../vibe/vibe.js';
import {randomId,sha256} from '../platform/browser-crypto.js';
import {hostFetch} from '../platform/host-fetch.js';
import {checkedFetch,stageError,redactErrorText} from '../platform/request-errors.js';
import {varietyBoostSigma,effectiveGuidanceRescale} from '../core/core.js';
import {connectionSnapshot,assertConnection} from './nai-connection.js';
import {parseNAIImage,payloadSecrets,requestSummary} from './nai-response.js';

export function base64Bytes(bytes){let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(binary);}
export function naiPayload(request,references={}){
    request=normalizeNAICharacterRequest(request);
    // NAI character protocol: AI placement, with matching positive/UC order.
    const characters=request.naiCharacters||[],center=()=>({x:0.5,y:0.5});
    const captions=negative=>characters.map((prompt,i)=>({char_caption:negative?(request.naiCharacterNegatives?.[i]??''):prompt,centers:[center()]}));
    return {action:'generate',input:request.prompt,model:request.model,parameters:{params_version:3,width:request.width,height:request.height,steps:request.steps,scale:request.scale,seed:request.seed,sampler:request.sampler,noise_schedule:request.scheduler,n_samples:1,negative_prompt:request.negative_prompt,qualityToggle:false,ucPreset:0,sm:false,sm_dyn:false,dynamic_thresholding:false,legacy:false,legacy_v3_extend:false,add_original_image:false,controlnet_strength:1,deliberate_euler_ancestral_bug:false,prefer_brownian:true,cfg_rescale:effectiveGuidanceRescale(request.model,request.cfg_rescale),uncond_scale:1,skip_cfg_above_sigma:varietyBoostSigma(request),use_coords:false,characterPrompts:characters.map((prompt,i)=>({prompt,uc:request.naiCharacterNegatives?.[i]??'',center:center()})),...references,v4_prompt:{caption:{base_caption:request.prompt,char_captions:captions(false)},use_coords:false,use_order:true},v4_negative_prompt:{caption:{base_caption:request.negative_prompt,char_captions:captions(true)}}}};
}
export function createDirectClient({settings,save,getHeaders,getKey,unzipPNG,fetchImpl=fetch,onDiagnostic=()=>{},runtime,persist=async()=>save(),preparePreview=prepareVibePreview}){
    settings.vibeLibrary??=[];
    let importing=false,pendingIndex=false;const pendingWrites=new Map(),previewReady=new Set(),previewPending=new Map();
    const filename=id=>{if(!/^[a-f0-9-]{36}$/i.test(id||''))throw Error('无效 Vibe ID');return `miao-vibe-${id}.json`;};
    const filePath=id=>'/user/files/'+filename(id);
    const st=async(endpoint,body)=>{
        return checkedFetch('vibe-file','/api/files/'+endpoint,{method:'POST',headers:getHeaders(),body:JSON.stringify(body)},{fetchImpl:(url,options)=>hostFetch(url,options,{fetchImpl})});
    };
    const read=async id=>{
        if(!settings.vibeLibrary.some(item=>item.id===id))throw Error('Vibe 已从列表删除');
        const response=await checkedFetch('vibe-file',filePath(id),{cache:'no-store'},{fetchImpl});
        const item=await response.json();if(item.id!==id)throw Error('Vibe 文件标识不匹配');return item;
    };
    const write=async(item,{base,retry=false}={})=>{
        pendingWrites.set(item.id,{item:structuredClone(item),base});
        let matches=false;
        if(retry||base){const response=await fetchImpl(filePath(item.id),{cache:'no-store'});if(response.ok){const remote=await response.json();matches=jsonEqual(remote,item);if((base&&!jsonEqual(remote,base)||retry&&!base)&&!matches)throw Error('Vibe 文件已变化，未覆盖其他页面内容');}}
        if(!matches){
            const data=base64Bytes(new TextEncoder().encode(JSON.stringify(item))),result=await (await st('upload',{name:filename(item.id),data})).json();
            if('/'+String(result.path).replace(/^\//,'')!==filePath(item.id))throw Error('酒馆返回了意外的 Vibe 文件路径');
        }
        const response=await checkedFetch('vibe-file',filePath(item.id),{cache:'no-store'},{fetchImpl});if(!jsonEqual(await response.json(),item))throw Error('Vibe 文件写入尚未读回确认，请查证保存');
        const previous=structuredClone(settings.vibeLibrary);const summary=vibeSummary(item),index=settings.vibeLibrary.findIndex(v=>v.id===item.id);
        if(index<0)settings.vibeLibrary.push(summary);else settings.vibeLibrary[index]=summary;
        try{await persist();pendingIndex=false;}catch(error){settings.vibeLibrary=previous;pendingIndex=true;throw error;}pendingWrites.delete(item.id);return summary;
    };
    const prepareNAI=async(endpoint,body,{expectedKeyHash,connection=connectionSnapshot(settings),summary=''}={})=>{
        connection={...connection};assertConnection(settings,connection);
        const custom=connection.naiConnection==='custom';
        if(custom&&connection.endpointError)throw Error(connection.endpointError);
        if(custom&&endpoint==='encode-vibe'&&!connection.encodeEnabled)throw Error(connection.encodeError||'自定义接口已禁用在线 Vibe 编码；仍可导入和使用已有编码的 Vibe 文件');
        const url=custom?(endpoint==='encode-vibe'?connection.resolvedEncodeURL:connection.resolvedGenerationURL):'https://image.novelai.net/ai/'+endpoint;
        if(custom&&!url)throw Error(endpoint==='encode-vibe'?'自定义接口未配置有效的 Vibe 编码地址':'请先设置有效的自定义生图 URL');
        const key=await getKey(expectedKeyHash,connection);if(!key)throw Error('请先在「生成」页重新填写并保存当前连接的 API Key，用于当前浏览器直连');
        const source=endpoint==='encode-vibe'?'nai-encode':'nai-generation',serialized=JSON.stringify(body);
        const secrets=[key,...payloadSecrets(body)];
        const options={method:'POST',credentials:'omit',referrerPolicy:'no-referrer',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:serialized};
        let phase='prepared',httpStatus;
        const onError=custom?error=>{error.message=redactErrorText(error.message,secrets);return reportNAIFailure(error,{phase,source,protocol:new URL(url).protocol,httpStatus,runtime,onDiagnostic});}:undefined;
        return {source,secrets,onError,send:signal=>{
            assertConnection(settings,connection);phase='fetch';httpStatus=undefined;
            return checkedFetch(source,url,{...options,signal,...(custom?{redirect:'error'}:{})},{fetchImpl,secrets,custom,summary:summary?requestSummary(summary,secrets):''}).then(async response=>{
                httpStatus=response.status;phase='body';let bytes;
                try{bytes=await response.arrayBuffer();}catch(error){if(!custom)throw error;throw stageError(source,Object.assign(Error('读取响应正文失败；结果尚不确定，不会自动重试'),{name:['TypeError','AbortError','TimeoutError'].includes(error?.name)?error.name:'Error'}));}
                phase='parse';return bytes;
            });
        }};
    };
    const prepareGenerate=async(request,scope={})=>{
        scope={...scope,connection:{...(scope.connection||connectionSnapshot(settings))}};
        assertConnection(settings,scope.connection);
        request=normalizeNAICharacterRequest(structuredClone(request));
        if(!Array.isArray(request.vibes)||request.vibes.length>4)throw Error('Vibe 列表格式错误，本插件最多启用 4 个');
        const library=[];for(const binding of request.vibes){const item=await read(binding.id);library.push({id:item.id,name:item.name,encodings:item.encodings});}
        const prepared=await prepareNAI('generate-image',naiPayload(request,resolveVibes(request.model,request.vibes,library)),{...scope,summary:request});
        return {...prepared,postprocess:bytes=>parseNAIImage(bytes,{unzipPNG,secrets:prepared.secrets})};
    };
    const findEncoding=async({image,model,information})=>{
        const raw=stripImage(image),fingerprint=await sha256(raw),modelKey=vibeModelKeys[model];if(!modelKey||!Number.isFinite(+information)||+information<0||+information>1)throw Error('请选择 V4/V4.5 模型和 0～1 的信息提取量');
        for(const summary of [...settings.vibeLibrary]){const item=await read(summary.id);if(item.image&&await sha256(stripImage(item.image))===fingerprint&&Object.values(item.encodings?.[modelKey]||{}).some(v=>v.params?.information_extracted===+information&&v.encoding))return item;}
        return null;
    };
    const prepareEncode=async({id,image,name,model,information},scope={})=>{
        const connection=scope.connection||connectionSnapshot(settings);
        assertConnection(settings,connection);

        information=Number(information);const modelKey=vibeModelKeys[model];
        if(!modelKey||!Number.isFinite(information)||information<0||information>1)throw Error('请选择 V4/V4.5 模型，信息提取量为 0～1');
        const item=id?await read(id):await preparePreview({name:String(name||'Vibe').slice(0,100),image:stripImage(image),encodings:{}}),key='miao-'+information;
        if(!id){if(pendingWrites.size||pendingIndex)throw Error('请先检查上一次保存结果');const cached=await findEncoding({image:item.image,model,information});if(cached)return {cached:true,value:vibeSummary(cached)};if(settings.vibeLibrary.length>=128)throw Error('最多保存 128 个 Vibe');item.id=randomId();}
        if(item.encodings?.[modelKey]?.[key])return {cached:true,value:vibeSummary(item)};
        if(!item.image)throw Error('这个 Vibe 没有原图，无法重新编码');const original=stripImage(item.image);
        const prepared=await prepareNAI('encode-vibe',{image:original,model,information_extracted:information},{...scope,connection});
        return {...prepared,postprocess:async bytes=>{
            const encoding=base64Bytes(new Uint8Array(bytes));if(!encoding)throw Error('NAI 未返回 Vibe 编码');
            const latest=id?await read(id):item,base=id?structuredClone(latest):undefined;if(latest.image!==item.image)throw Error('Vibe 原图已改变，编码未覆盖当前文件');(latest.encodings[modelKey]??={})[key]={encoding,params:{information_extracted:information}};return write(latest,{base});
        }};
    };
    return {
        async list(){return structuredClone(settings.vibeLibrary);},
        async findEncoding(input){const item=await findEncoding(input);return item?vibeSummary(item):null;},
        pending:()=>pendingWrites.size+(pendingIndex?1:0),
        async retry(){for(const operation of [...pendingWrites.values()])await write(operation.item,{base:operation.base,retry:true});await persist();pendingIndex=false;return structuredClone(settings.vibeLibrary);},
        async preview(id,{fresh=false}={}){
            if(fresh)previewReady.delete(id);if(previewReady.has(id))return structuredClone(settings.vibeLibrary.find(item=>item.id===id));
            if(previewPending.has(id))return previewPending.get(id);
            const job=(async()=>{const item=await read(id),prepared=await preparePreview(item);let summary;
                if(prepared.thumbnail!==item.thumbnail)summary=await write(prepared,{base:item});else summary={...vibeSummary(prepared)};
                previewReady.add(id);return summary;
            })();previewPending.set(id,job);try{return await job;}finally{previewPending.delete(id);}
        },
        async export(ids){
            if(!Array.isArray(ids)||!ids.length||new Set(ids).size!==ids.length)throw Error('请勾选要导出的 Vibe');
            const items=[];for(const id of ids)items.push((importVibeData(await read(id)))[0]);
            return items;
        },
        async import({data,name,image}){
            if(importing)throw Error('已有 Vibe 正在导入，请等待完成后再试');if(pendingWrites.size||pendingIndex)throw Error('有未确认的 Vibe 保存，请先检查保存结果');
            const items=image?importVibeData({name,image:stripImage(image),encodings:{}},name):importVibeData(data,name);
            if(settings.vibeLibrary.length+items.length>128)throw Error('最多保存 128 个 Vibe，请先清理列表');
            const saved=[];importing=true;
            try{const prepared=[];for(const item of items){const next=await preparePreview(item);next.id=randomId();prepared.push(next);}for(const item of prepared)pendingWrites.set(item.id,{item:structuredClone(item)});for(const item of prepared)saved.push(await write(item));}
            catch(error){throw Error(`已导入 ${saved.length} / ${items.length} 个 Vibe，${items.length-saved.length} 项未完成，可检查保存结果：${error.message}`);}
            finally{importing=false;}
            return saved;
        },
        async rename({id,name}){const item=await read(id);const base=structuredClone(item);item.name=String(name||'Vibe').slice(0,100);return write(item,{base});},
        async delete(id){await st('delete',{path:filePath(id)});settings.vibeLibrary=settings.vibeLibrary.filter(item=>item.id!==id);previewReady.delete(id);await persist();},
        prepareGenerate,prepareEncode,
        async encode(body,scope={}){
            const prepared=await prepareGeneration(()=>prepareEncode(body,scope),scope);
            if(prepared.cached)return prepared.value;
            return sendPrepared(prepared,{...scope,timeoutMs:180000});
        },
        async generate(request,scope={}){
            const prepared=await prepareGeneration(()=>prepareGenerate(request,scope),scope);
            return sendPrepared(prepared,{...scope,timeoutMs:scope.timeoutMs??generationTimeoutSeconds(settings.generationTimeoutSeconds)*1000});
        },
    };
}
