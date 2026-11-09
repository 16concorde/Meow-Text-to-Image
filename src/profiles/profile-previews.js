import {bindingReferences} from '../prompts/character-binding-prompt.js';
import {buildRequest} from '../core/core.js';
import {randomId} from '../platform/browser-crypto.js';
import {selectVibes} from '../vibe/vibe.js';

export const SAMPLE_PROMPT=`a  girl, (16-year-old:1.1),(flat breasts:0.7)

(white hair:1.3),  (waist-length hair:1.1),
(slightly messy hair:0.5), (long uneven bangs:1.3),(split bangs:1.1),hair down,

(face-framing strands clearly separated from main hair:1.3),

(Grey-blue eyes:1.2), ​:3,

(gray-blue striped sweater:1.3), Loose-fitting sweater,black shorts,(horizontal stripes:1.2),​(dark blue ribbon choker:0.4),`;
export function ensureProfileIds(profiles){
    // IDs route pending jobs; assigning one must never discard a saved image.
    // Explicit UI copies clear their own preview before they reach this helper.
    const used=new Set();for(const profile of profiles){if(!profile.id||used.has(profile.id))profile.id=randomId();used.add(profile.id);}
}
export function moveProfile(settings,id,offset){
    const list=settings.profiles,from=list.findIndex(profile=>profile.id===id),to=from+offset;
    if(from<0||![-1,1].includes(offset)||to<0||to>=list.length)return false;
    const active=list[settings.active],[profile]=list.splice(from,1);list.splice(to,0,profile);settings.active=Math.max(0,list.indexOf(active));return true;
}
export function planProfileRemoval(settings,ids){
    const selected=new Set(ids),removed=settings.profiles.filter(profile=>selected.has(profile.id));
    if(!selected.size)throw Error('请先勾选需要删除的串');
    if(removed.length!==selected.size)throw Error('所选配置已变化，请重新选择');
    const profiles=settings.profiles.filter(profile=>!selected.has(profile.id));
    if(!profiles.length)throw Error('至少保留一个配置');
    const current=settings.profiles[settings.active],before=settings.profiles.slice(0,settings.active).filter(profile=>!selected.has(profile.id)).length;
    return {profiles,removed,active:profiles.includes(current)?profiles.indexOf(current):Math.min(before,profiles.length-1)};
}
export function sampleRequest(profile,library=[],prompt=SAMPLE_PROMPT){
    if(typeof prompt!=='string'||!prompt.trim())throw Error('请填写例图提示词');
    if(bindingReferences(prompt).length)throw Error('配置例图不支持绑定 ID，请改为完整人物 Tag');
    const request=buildRequest({...profile,width:512,height:512,seed:246813579},prompt,[],{fixedSize:true});
    request.vibes=selectVibes(profile,library,()=>0);return request;
}
// Only effective image-generation semantics participate in freshness. Layout and
// display metadata are intentionally absent; seeds are fixed for comparison.
function requestSignature(request){
    const keys=['prompt','negative_prompt','model','sampler','scheduler','steps','scale','cfg_rescale','variety_boost','naiCharacters','naiCharacterNegatives'];
    const effective=Object.fromEntries(keys.filter(key=>request[key]!==undefined).map(key=>[key,request[key]]));
    effective.width=effective.height=512;effective.seed=246813579;
    effective.vibes=(request.vibes||[]).map(({id,key,strength})=>({id,key,strength:Number(strength??0.6)}));
    return JSON.stringify({version:2,request:effective});
}
export function sampleSignature(profile,library=[],prompt=SAMPLE_PROMPT){return requestSignature(sampleRequest(profile,library,prompt));}
function freshness(profile,signature){
    const preview=profile.preview;if(!preview?.url)return false;
    if(preview.signature===signature)return true;
    // Old signatures contain their effective request; old snapshots may use a
    // randomized generation seed. Neither should invalidate a previously saved image.
    let old=preview.request;
    if(!old)try{const parsed=JSON.parse(preview.signature);if(parsed.prompt&&parsed.model)old=parsed;}catch{}
    if(!old)return null;
    return requestSignature(old)===signature;
}
export function createProfilePreviews({profiles,library,prompt=()=>SAMPLE_PROMPT,onQueued=()=>{},enqueue,generate,saveImage,persist,onChange=()=>{},onError=()=>{},isCurrent=()=>true}){
    const jobs=new Map();
    const current=(id,signature)=>{const p=isCurrent()&&profiles().find(item=>item.id===id);try{return p&&sampleSignature(p,library(),prompt())===signature?p:null;}catch{return null;}};
    return {
        state(profile){const job=jobs.get(profile.id);let fresh=null;try{fresh=freshness(profile,sampleSignature(profile,library(),prompt()));}catch{fresh=false;}
            return {url:profile.preview?.url,busy:!!job?.busy,needsSave:!!job?.unsaved,status:job?.busy?job.status:job?.unsaved?'保存未确认':job?.error?'生成失败':profile.preview?.url?(fresh===false?'待更新':''):''};},
        refresh(profile,{ifChanged=false,scope}={}){
            let signature,request;try{signature=sampleSignature(profile,library(),prompt());request=sampleRequest(profile,library(),prompt());}catch(error){onError(error);return Promise.resolve();}
            const existing=jobs.get(profile.id);
            if(ifChanged&&existing?.unsaved&&profile.preview?.url){
                if(existing.busy)return existing.promise;
                existing.busy=true;existing.status='查证例图保存';onChange({profileId:profile.id});
                existing.promise=Promise.resolve().then(()=>{if(!isCurrent()||jobs.get(profile.id)!==existing||!profiles().some(p=>p.id===profile.id))return;return persist({profileId:profile.id});}).then(()=>{existing.unsaved=false;existing.error=null;}).catch(error=>{existing.error=error.message;onError(error);}).finally(()=>{existing.busy=false;onChange({profileId:profile.id});});return existing.promise;
            }
            if(ifChanged&&profile.preview?.url&&freshness(profile,signature)===true){if(existing?.error){jobs.delete(profile.id);onChange({profileId:profile.id});}return Promise.resolve();}
            const previous=jobs.get(profile.id);if(previous?.busy&&previous.signature===signature)return previous.promise;
            if(!ifChanged)request.seed=Math.floor(Math.random()*4294967296);
            const job={busy:true,status:'排队中',signature};jobs.set(profile.id,job);onChange({profileId:profile.id});onQueued();
            const valid=()=>{if(!current(profile.id,signature)||jobs.get(profile.id)!==job)throw Error('配置已变化，例图已取消');return true;};
            job.promise=enqueue(async()=>{
                if(!current(profile.id,signature)||jobs.get(profile.id)!==job)return;
                const data=await generate(request,{...scope,onStatus:status=>{job.status=status;onChange({profileId:profile.id});}},valid);
                const url=await saveImage(data,scope);
                const target=current(profile.id,signature);if(!target||jobs.get(profile.id)!==job)return;
                job.unsaved=true;target.preview={url,signature,request:structuredClone(request),created:Date.now()};onChange({profileId:profile.id});
                try{await persist({profileId:profile.id});job.unsaved=false;onChange({profileId:profile.id});}catch(error){throw Error('例图已生成，保存尚未确认；请查证例图保存：'+error.message);}
            }).catch(error=>{job.error=String(error.message||error);if(isCurrent()&&jobs.get(profile.id)===job)onError(error);}).finally(()=>{job.busy=false;onChange({profileId:profile.id});});
            return job.promise;
        },
    };
}
