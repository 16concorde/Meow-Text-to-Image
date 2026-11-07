import {redactErrorText,errorTitle} from '../platform/request-errors.js';
// Keep the host's native toast classes and theme; never patch global toastr.
export function createNotifications(settings,host,{prepare=()=>{}}={}){
    const send=type=>(...args)=>{if(type==='error'||!settings.hideNonErrorNotifications){prepare();const toast=host[type](...args);toast?.addClass?.('miao-toast');return toast;}};
    return {info:send('info'),success:send('success'),warning:send('warning'),error:send('error')};
}

export function createErrorNotifier(notices,{now=Date.now,log=(...args)=>console.error(...args)}={}){
    let seenErrors=new WeakSet();const faults=new Map();
    function showError(error,{category,source=error?.source||'extension',objectId=error?.objectId||''}={}){
        const message=(error?.stage?'[prompt-config:'+error.stage+'] ':'')+redactErrorText(error?.message||error),title=category||errorTitle(error);
        if(error&&typeof error==='object'){if(seenErrors.has(error)||error.cause&&seenErrors.has(error.cause))return;seenErrors.add(error);}
        const stage=error?.stage||'',code=error?.code||error?.status||'',key=JSON.stringify([source,stage,code,objectId,message.slice(0,2200)]);
        if(faults.has(key)){faults.get(key).count++;return;}
        if(faults.size>=64)faults.delete(faults.keys().next().value);faults.set(key,{source,stage,objectId,count:1,at:now()});
        const safe=Error(message);safe.name=error?.name||'Error';if(error?.cause)safe.cause=Error(redactErrorText(error.cause.message||error.cause));log('[Meow]',safe);
        notices.error(message.length>2200?message.slice(0,2200)+'\n（内容过长已截断）':message,title,{escapeHtml:true,timeOut:12000,tapToDismiss:true});
    }
    showError.recover=({source,stage,objectId}={})=>{seenErrors=new WeakSet();for(const [key,fault] of faults)if((source===undefined||source===fault.source)&&(stage===undefined||stage===fault.stage)&&(objectId===undefined||objectId===fault.objectId))faults.delete(key);};
    showError.activeCount=()=>faults.size;return showError;
}
