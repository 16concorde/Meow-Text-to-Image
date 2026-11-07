// An IME-aware field draft; navigation and generation await every valid queued edit.
export function createPromptAutosave({run,onError=()=>{},delay=350,maxWait=1200}){
    let timer,maxTimer,composing=false,dirty=false,tail=Promise.resolve(),failure=null,disposed=false,active=0;
    const clear=()=>{clearTimeout(timer);clearTimeout(maxTimer);timer=maxTimer=null;};
    const flush=async()=>{
        clear();
        do{
            if(composing)throw Error('请先完成输入法输入');
            if(dirty){
                dirty=false;
                tail=tail.catch(()=>{}).then(async()=>{
                    if(composing){dirty=true;return;}
                    active++;try{return await run();}finally{active--;}
                }).then(()=>{failure=null;},error=>{failure=error;throw error;});
            }
            const pending=tail;
            await pending;
            if(composing)throw Error('请先完成输入法输入');
            if(pending!==tail)continue;
            if(failure)throw failure;
            if(!dirty)return;
        }while(true);
    };
    const schedule=()=>{if(disposed)return;dirty=true;failure=null;if(composing)return;clearTimeout(timer);timer=setTimeout(()=>{void flush().catch(onError);},delay);maxTimer??=setTimeout(()=>{void flush().catch(onError);},maxWait);};
    return {schedule,flush,hasPending:()=>dirty||composing||active>0,hasFailure:()=>!!failure,recover(){failure=null;},retry(){failure=null;dirty=true;return flush();},compositionStart(){composing=true;clear();},compositionEnd(){composing=false;schedule();},dispose(){disposed=true;clear();}};
}
