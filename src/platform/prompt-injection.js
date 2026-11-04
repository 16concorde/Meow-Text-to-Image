import {composePrompt} from '../prompts/prompt-composer.js';
import {migrateTreeSettings,savedEnabled} from '../prompts/tree-settings.js';
import {getNsfwActivationText,matchNsfwKeywords} from '../prompts/nsfw-trigger.js';
export const PROMPT_ID='miao_nai_image_instruction';
export function createPromptInjection({context,settings,onError,match=matchNsfwKeywords}){
    let frame=null,cache=null;
    const capture=type=>getNsfwActivationText(context().chat,type);
    const api={
        update(){try{
            const host=context();
            let text='';
            if(settings.enabled&&settings.promptConfig?.mode==='builtin'){
                const config=settings.promptConfig.version===2?migrateTreeSettings(settings.promptConfig):settings.promptConfig;
                let nsfwMatched=false;
                if(config.version===2&&savedEnabled(config,'nsfw')){
                    const input=frame?.text??capture('normal'),key=JSON.stringify(config.nsfwTrigger.keywords);
                    if(!cache||cache.text!==input||cache.key!==key)cache={text:input,key,matched:match(input,config.nsfwTrigger.keywords)};
                    nsfwMatched=cache.matched;
                }else cache=null;
                text=composePrompt(config,{nsfwMatched});
            }else cache=null;
            if(typeof host.setExtensionPrompt!=='function')throw Error('宿主不支持 setExtensionPrompt');
            host.setExtensionPrompt(PROMPT_ID,text,1,0,false,0);return text;
        }catch(error){onError(error);throw error;}},
        begin(type='normal'){frame={type,replacedTail:type==='regenerate'?context().chat?.at(-1):null,text:capture(type)};cache=null;return api.update();},
        input(){if(frame)frame={type:'normal',text:capture('normal')};return api.update();},
        deleted(){if(frame?.type==='regenerate'&&!context().chat?.includes(frame.replacedTail))frame={type:'normal',text:capture('normal')};return api.update();},
        changed(){if(!frame)return api.update();},
        reset(){frame=null;cache=null;return api.update();},
    };
    return api;
}
// All callbacks synchronously update the sole D0 ID, before the host builds its prompt.
export function bindPromptInjection({source,eventTypes,injection,onError}){
    const bind=(name,run)=>{if(eventTypes[name])source.on(eventTypes[name],(...args)=>{try{run(...args);}catch{onError?.();}});};
    for(const name of ['CHAT_LOADED','CHAT_CHANGED'])bind(name,()=>injection.reset());
    bind('GENERATION_AFTER_COMMANDS',(type,options,dryRun)=>{if(dryRun||type==='quiet'||type==='impersonate')injection.reset();else injection.begin(type);});
    for(const name of ['MESSAGE_SENT','USER_MESSAGE_RENDERED'])bind(name,()=>injection.input());
    bind('MESSAGE_DELETED',()=>injection.deleted());
    for(const name of ['MESSAGE_EDITED','MESSAGE_UPDATED','MESSAGE_SWIPED'])bind(name,()=>injection.changed());
    for(const name of ['GENERATION_ENDED','GENERATION_STOPPED'])bind(name,()=>injection.reset());
}
