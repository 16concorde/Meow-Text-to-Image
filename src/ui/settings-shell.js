// Settings-only backdrop and layout lifecycle; never changes the host's popup policy.
export function bindSettingsShell({panel,dialog,requestClose}){
    let downOutside=false,disposed=false;
    const outside=e=>{const r=dialog.getBoundingClientRect();return e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom;};
    const nested=()=>dialog.querySelector('.miao-prompt-editor,.miao-confirmation-layer,.miao-binding-confirm')||[...dialog.ownerDocument.querySelectorAll('dialog[open]')].at(-1)!==dialog;
    const down=e=>{downOutside=e.target===dialog&&outside(e)&&!nested();};
    const up=e=>{const close=downOutside&&e.target===dialog&&outside(e)&&!nested();downOutside=false;if(close)void requestClose('backdrop');};
    const cancel=e=>{if(dialog.dataset.panelPage||nested())return;e.preventDefault();e.stopImmediatePropagation();void requestClose('cancel');};
    const fit=()=>{if(disposed)return;dialog.dataset.section=panel.dataset.section;dialog.dataset.layout=matchMedia('(max-width:680px)').matches?'mobile':'desktop';};
    const observer=new MutationObserver(fit);observer.observe(panel,{attributes:true,attributeFilter:['data-section']});fit();window.addEventListener('resize',fit);dialog.addEventListener('pointerdown',down);dialog.addEventListener('pointerup',up);dialog.addEventListener('cancel',cancel);
    return ()=>{disposed=true;observer.disconnect();window.removeEventListener('resize',fit);dialog.removeEventListener('pointerdown',down);dialog.removeEventListener('pointerup',up);dialog.removeEventListener('cancel',cancel);};
}
