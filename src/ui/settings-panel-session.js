import {panelSettingsPatch as configPatch} from '../platform/panel-settings-patches.js';
import {applyConfigPatch} from '../prompts/prompt-patches.js';
import {createPromptAutosave} from './prompt-autosave.js';
const liveFields=new Set(['promptConfig','startTag','endTag','pattern']);
const snapshot=settings=>Object.fromEntries(Object.entries(settings).filter(([key])=>!liveFields.has(key)).map(([key,value])=>[key,structuredClone(value)]));
function reconcile(target,next){
    if(Array.isArray(target)&&Array.isArray(next)){
        const old=[...target];target.splice(0,target.length,...next.map((value,i)=>{const existing=value?.id?old.find(item=>item?.id===value.id):old[i];return existing&&value&&typeof existing==='object'&&typeof value==='object'?reconcile(existing,value):structuredClone(value);}));return target;
    }
    for(const key of Object.keys(target))if(!Object.hasOwn(next,key)&&!liveFields.has(key))delete target[key];
    for(const [key,value] of Object.entries(next)){
        if(value&&target[key]&&typeof value==='object'&&typeof target[key]==='object'&&Array.isArray(value)===Array.isArray(target[key]))reconcile(target[key],value);else target[key]=structuredClone(value);
    }return target;
}
// Editable settings stay in this view; runtime switches only after host read-back confirmation.
export function createSettingsPanelSession({settings,persist,onState=()=>{}}){
    let confirmed=snapshot(settings),failure=null;const view=structuredClone(confirmed);
    for(const key of liveFields)Object.defineProperty(view,key,{enumerable:true,get:()=>settings[key]});
    const synchronize=remote=>{const local=configPatch(confirmed,snapshot(view));confirmed=structuredClone(remote);reconcile(view,applyConfigPatch(remote,local));};
    const autosave=createPromptAutosave({delay:0,maxWait:0,onError:error=>{failure=error;onState(error.message,true);},run:async()=>{
        const submitted=snapshot(view),base=structuredClone(confirmed),patch=configPatch(base,submitted);if(!patch.length)return;
        onState('保存中…',false);
        try{await persist(patch,base);const pending=configPatch(submitted,snapshot(view));confirmed=snapshot(settings);reconcile(view,applyConfigPatch(confirmed,pending));failure=null;onState('',false);}catch(error){failure=error;onState(error.message,true);throw error;}
    }});
    return {view,request(){autosave.schedule();const job=autosave.flush();void job.catch(()=>{});return job;},flush:autosave.flush,retry:autosave.retry,canResolveConflict:()=>!!failure?.latest,async resolveConflict(){
        if(!failure?.latest)throw Error('没有可处理的并发冲突');
        const latest={...confirmed,...structuredClone(failure.latest)},patch=configPatch(confirmed,snapshot(view));
        for(const change of patch){let before=confirmed,remote=latest;for(const key of change.path){if(Array.isArray(before)&&(!Array.isArray(remote)||before.length!==remote.length||before.some((item,i)=>item?.id!==remote[i]?.id)))throw Error('列表结构已变化，草稿保留；请先处理其他页面中的列表调整');before=before?.[key];remote=remote?.[key];}}
        confirmed=latest;reconcile(view,applyConfigPatch(latest,patch));failure=null;await autosave.retry();
    },refresh(){synchronize(snapshot(settings));},hasPending:()=>autosave.hasPending(),hasFailure:()=>!!failure,dispose:autosave.dispose};
}
