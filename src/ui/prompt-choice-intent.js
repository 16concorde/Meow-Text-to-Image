// Paint the latest interaction without publishing an unconfirmed value to runtime.
export function createChoiceIntent(read){
    let revision=0,intent=null;
    return {
        begin(value){if(intent?.pending&&intent.value===value||!intent&&read()===value)return null;intent={value,revision:++revision,pending:true,error:null};return {...intent};},
        value:()=>intent?.pending?intent.value:read(),
        settle(attempt,error){if(!intent||attempt.revision!==intent.revision)return false;
            if(!error&&read()===attempt.value){intent=null;return true;}
            error??=Object.assign(Error('选择保存尚未确认，请检查保存结果'),{status:'unconfirmed'});
            intent={...intent,pending:['unknown','unconfirmed'].includes(error.status??error.saveState),error};return true;
        },
        refresh({published=false}={}){if(published&&intent?.error?.stage==='publish'&&read()===intent.value)intent=null;},
        retry(){if(!intent?.error)return null;intent={...intent,revision:++revision,pending:true,error:null};return {...intent};},
        state:()=>intent?{...intent}:null,
        hasPending:()=>!!intent?.pending,
        hasFailure:()=>!!intent?.error,
    };
}
