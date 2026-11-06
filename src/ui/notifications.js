import {redactErrorText,errorTitle} from '../platform/request-errors.js';
// Keep the host's native toast classes and theme; never patch global toastr.
export function createNotifications(settings,host,{prepare=()=>{}}={}){
    const send=type=>(...args)=>{if(type==='error'||!settings.hideNonErrorNotifications){prepare();const toast=host[type](...args);toast?.addClass?.('miao-toast');return toast;}};
    return {info:send('info'),success:send('success'),warning:send('warning'),error:send('error')};
}

export function createErrorNotifier(notices,{now=Date.now,log=(...args)=>console.error(...args)}={}){
const seenErrors=new WeakSet();let lastError='',lastErrorAt=0;
return function showError(error,{category}={}) {
    const message=(error?.stage?'[prompt-config:'+error.stage+'] ':'')+redactErrorText(error?.message||error),title=category||errorTitle(error),time=now();
    if(error&&typeof error==='object'){if(seenErrors.has(error)||error.cause&&seenErrors.has(error.cause))return;seenErrors.add(error);}
    if(message===lastError&&time-lastErrorAt<2000)return;lastError=message;lastErrorAt=time;
    const safe=Error(message);safe.name=error?.name||'Error';if(error?.cause)safe.cause=Error(redactErrorText(error.cause.message||error.cause));log('[Meow]',safe);
    const text=message.length>2200?message.slice(0,2200)+'\n（内容过长已截断）':message;
    notices.error(text,title,{escapeHtml:true,timeOut:12000,tapToDismiss:true});
}
}
