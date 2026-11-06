export class HostNotReadyError extends Error {
    constructor(status='host-not-ready'){super(status==='cancelled'?'启动已取消':'酒馆设置仍在准备中，请稍后重新加载');this.status=status;}
}
// Event names alone are not readiness evidence: read the host's live binding again.
export function waitForHostSettingsReady({isReady,source,event,signal,timeoutMs=60000,setTimer=setTimeout,clearTimer=clearTimeout}){
    return new Promise((resolve,reject)=>{
        let done=false,timer;
        const finish=error=>{if(done)return;done=true;clearTimer(timer);if(event)source?.removeListener(event,check);signal?.removeEventListener('abort',abort);error?reject(error):resolve();};
        const check=()=>{if(isReady()===true)finish();};
        const abort=()=>finish(new HostNotReadyError('cancelled'));
        if(signal?.aborted){abort();return;}
        if(isReady()===true){finish();return;}
        if(event)source?.on(event,check);
        if(done)return;
        signal?.addEventListener('abort',abort,{once:true});
        timer=setTimer(()=>finish(new HostNotReadyError()),timeoutMs);
        check();
    });
}
