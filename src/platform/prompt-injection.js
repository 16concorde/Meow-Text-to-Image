import {publishPrompt} from './prompt-placement.js';
import {composePrompt} from '../prompts/prompt-composer.js';
import {savedEnabled} from '../prompts/tree-settings.js';
import {getNsfwActivationText,matchNsfwKeywords} from '../prompts/nsfw-trigger.js';
export const PROMPT_ID='miao_nai_image_instruction';
export function createPromptInjection({context,settings,bindings,onError,onRecovered=()=>{},onRetry=()=>{},flush,imageLayout=()=>false,captureProtocol=()=>settings.promptConfig?.capture,match=matchNsfwKeywords,isReady=()=>true}){
    let frame=null,cache=null,epoch=0,fault=null;
    const configPlacement=()=>settings.promptConfig?.injection??{depth:0};
    const capture=type=>getNsfwActivationText(context().chat,type);
    const api={
        clear(){fault=null;epoch++;frame=null;cache=null;context().setExtensionPrompt?.(PROMPT_ID,'',1,0,false,0);return '';},
        update(){try{
            if(fault&&fault.config===settings.promptConfig)return '';
            if(!isReady())return api.clear();
            const host=context();
            let text='';
            if(settings.enabled&&settings.promptConfig?.mode==='builtin'){
                const config=settings.promptConfig;
                if(config.tagMode==='binding'&&savedEnabled(config,'tags')&&bindings?.state&&bindings.state()!=='ready')return api.clear();
                let nsfwMatched=false;
                if(config.version===2&&savedEnabled(config,'nsfw')){
                    const input=frame?.text??capture('normal'),key=JSON.stringify(config.nsfwTrigger.keywords);
                    if(!cache||cache.text!==input||cache.key!==key)cache={text:input,key,matched:match(input,config.nsfwTrigger.keywords)};
                    nsfwMatched=cache.matched;
                }else cache=null;
                text=composePrompt(config,{capture:frame?.capture,imageLayoutAI:frame?.imageLayoutAI??imageLayout(),nsfwMatched,bindingRoster:config.tagMode==='binding'&&savedEnabled(config,'tags')?bindings?.roster():''});
            }else cache=null;
            if(typeof host.setExtensionPrompt!=='function')throw Error('宿主不支持 setExtensionPrompt');
            const result=publishPrompt(host,PROMPT_ID,text,configPlacement());onRecovered('inject');return result;
        }catch(error){try{context().setExtensionPrompt?.(PROMPT_ID,'',1,0,false,0);}catch{}error.stage??='inject';fault={config:settings.promptConfig};onError(error);throw error;}},
        async ready(){const token=++epoch;try{if(isReady()&&settings.enabled&&settings.promptConfig?.mode==='builtin'&&settings.promptConfig?.tagMode==='binding'&&settings.promptConfig.enabledById?.tags!==false)await bindings?.prepare();if(token!==epoch)return false;onRecovered('binding-prepare');return true;}catch(error){if(token===epoch){api.clear();error.stage??='binding-prepare';onError(error);}throw error;}},
        async begin(type='normal'){fault=null;onRetry();if(flush)await flush(type);if(!isReady()&&settings.promptConfig?.mode==='builtin')throw Error('内置提示词尚未确认或发布失败，请先处理配置');if(await api.ready())return api.beginPrepared(type);throw Error('聊天或绑定上下文已变化，请重新发送');},
        async reload(){api.clear();if(await api.ready())return api.update();},
        beginPrepared(type='normal'){frame={type,replacedTail:type==='regenerate'?context().chat?.at(-1):null,text:capture(type),capture:structuredClone(captureProtocol(type)),imageLayoutAI:imageLayout()};cache=null;return api.update();},
        input(){if(bindings?.state?.()==='error')return '';if(bindings?.state&&settings.promptConfig?.tagMode==='binding'&&bindings.state()!=='ready')return api.reload();if(frame)frame={...frame,type:'normal',text:capture('normal'),capture:frame.capture};return api.update();},
        deleted(){if(frame?.type==='regenerate'&&!context().chat?.includes(frame.replacedTail))frame={...frame,type:'normal',text:capture('normal'),capture:frame.capture};return api.update();},
        changed(){if(!frame)return api.update();},
        reset(){frame=null;cache=null;return api.update();},
    };
    return api;
}
// The host awaits preparation before building the single configured injection.
export function bindPromptInjection({source,eventTypes,injection,onError}){
    const bind=(name,run)=>{if(eventTypes[name])source.on(eventTypes[name],(...args)=>{try{return run(...args);}catch{onError?.();}});};

    bind('GENERATION_AFTER_COMMANDS',(type,options,dryRun)=>{if(dryRun||type==='quiet'||type==='impersonate')return injection.reset();else return injection.begin(type);});
    for(const name of ['MESSAGE_SENT','USER_MESSAGE_RENDERED'])bind(name,()=>injection.input());
    bind('MESSAGE_DELETED',()=>injection.deleted());
    for(const name of ['MESSAGE_EDITED','MESSAGE_UPDATED','MESSAGE_SWIPED'])bind(name,()=>injection.changed());
    for(const name of ['GENERATION_ENDED','GENERATION_STOPPED'])bind(name,()=>injection.reset());
}
