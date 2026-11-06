export class SaveUnconfirmedError extends Error {
    constructor(){super('保存尚未确认，配置仍待保存，请检查连接后重试');this.status='unconfirmed';}
}
export class SaveFailedError extends Error {
    constructor(){super('保存失败，请重试');this.status='failed';}
}
export class SaveCancelledError extends Error {
    constructor(status='cancelled'){super(status==='superseded'?'保存已被更新的配置取代':'保存已取消，请重新加载配置');this.status=status;}
}
const equalJSONValue=(a,b)=>{
    if(a===b)return true;
    if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
    const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(k=>Object.hasOwn(b,k)&&equalJSONValue(a[k],b[k]));
};
export const jsonEqual=(a,b)=>equalJSONValue(a===undefined?undefined:JSON.parse(JSON.stringify(a)),b===undefined?undefined:JSON.parse(JSON.stringify(b)));
// Consume only the selected extension field. Never merge a server settings response into memory.
export async function verifyPersistedSettings({fetchSettings,id,select,expected}){
    const response=await fetchSettings();
    if(!response.ok)return false;
    const data=await response.json();if(typeof data.settings!=='string')return false;
    const value=JSON.parse(data.settings)?.extension_settings?.[id];
    if(value===undefined||expected===undefined)return false;
    const selected=select(value);return selected!==undefined&&jsonEqual(selected,expected);
}

// One coordinator owns all extension writes. A caller deadline ends waiting, not an in-flight host call.
export function createSettingsSaveCoordinator({saveNow,source,event,timeoutMs=30000,isCurrent=()=>true,setTimer=setTimeout,clearTimer=clearTimeout,minVerifyIntervalMs=0,now=Date.now}){
    let tail=Promise.resolve(),revision=0,disposed=false,listening=false;
    const transactions=new Set();
    const listen=()=>{if(event&&!listening){source.on(event,wake);listening=true;}};
    const unlisten=()=>{if(!transactions.size&&listening){source.removeListener(event,wake);listening=false;}};
    const valid=tx=>!disposed&&transactions.has(tx)&&isCurrent()&&tx.isCurrent();
    const remove=tx=>{clearTimer(tx.timer);clearTimer(tx.checkTimer);transactions.delete(tx);unlisten();};
    const cancel=(tx,status)=>{remove(tx);tx.status=status;tx.reject(new SaveCancelledError(status));};
    const check=async tx=>{
        if(!valid(tx)){if(transactions.has(tx))cancel(tx,'cancelled');return;}
        if(!tx.started)return;
        if(tx.checking){tx.again=true;return;}
        const wait=tx.checkedAt===undefined?0:minVerifyIntervalMs-(now()-tx.checkedAt);
        if(wait>0){if(!tx.checkTimer)tx.checkTimer=setTimer(()=>{tx.checkTimer=null;void check(tx);},wait);return;}
        tx.checking=true;tx.checkedAt=now();
        try{
            do{
                tx.again=false;
                let matches=false;try{matches=await tx.verifyPersisted();}catch{/* A failed read is not proof that saving failed. */}
                if(!valid(tx)){if(transactions.has(tx))cancel(tx,'cancelled');return;}
                if(matches){
                    remove(tx);tx.status='confirmed';
                    try{tx.onConfirmed();tx.resolve();}catch{tx.reject(new SaveFailedError());}
                    return;
                }
            }while(tx.again&&valid(tx)&&minVerifyIntervalMs===0);
        }finally{tx.checking=false;if(tx.again&&valid(tx))void check(tx);}
    };
    // Do not return the transaction promise: the host awaits its event listeners.
    function wake(){for(const tx of transactions)void check(tx);}
    function submit({key,prepare=()=>{},verifyPersisted,onConfirmed=()=>{},isCurrent=()=>true}){
        if(disposed)return Promise.reject(new SaveCancelledError());
        if(typeof verifyPersisted!=='function')return Promise.reject(new SaveUnconfirmedError());
        if(key)for(const old of transactions)if(old.key===key)cancel(old,'superseded');
        let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
        const tx={key,revision:++revision,prepare,verifyPersisted,onConfirmed,isCurrent,resolve,reject,status:'queued',started:false};
        transactions.add(tx);listen();
        tx.timer=setTimer(()=>{
            if(!valid(tx)){cancel(tx,'cancelled');return;}
            tx.status='unconfirmed';tx.reject(new SaveUnconfirmedError());void check(tx);
            // The global subscription retains ownership for a late readback until superseded/disposed.
        },timeoutMs);
        const run=async()=>{
            if(!valid(tx)){if(transactions.has(tx))cancel(tx,'cancelled');return;}
            try{
                prepare();tx.started=true;tx.status='saving';
                const result=await saveNow();
                if(!valid(tx)){if(transactions.has(tx))cancel(tx,'cancelled');return;}
                if(result===false){remove(tx);tx.status='failed';tx.reject(new SaveFailedError());return;}
                void check(tx);
            }catch(error){
                if(valid(tx)){remove(tx);tx.status=error instanceof SaveCancelledError?error.status:'failed';tx.reject(error instanceof SaveCancelledError?error:new SaveFailedError());}
                else if(transactions.has(tx))cancel(tx,'cancelled');
            }
        };
        tail=tail.then(run,run);
        return promise;
    }
    return {submit,dispose(){disposed=true;for(const tx of [...transactions])cancel(tx,'cancelled');unlisten();}};
}

// Standalone compatibility wrapper; long-lived extension transactions use the shared coordinator.
export async function persistHostSettings(options){
    const coordinator=createSettingsSaveCoordinator(options);
    try{return await coordinator.submit(options);}finally{coordinator.dispose();}
}
