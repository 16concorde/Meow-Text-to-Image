import {promptTemplates} from '../prompts/prompt-templates.js';
import {promptText,withPromptOverride} from '../prompts/prompt-overrides.js';
const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
export function openPromptEditor({parent,settings,key,label,save,onSaved=()=>{}}){
    if(parent.querySelector('.miao-prompt-editor'))return;
    const initial=promptText(settings.promptConfig,key),layer=node('div',undefined,'miao-prompt-editor'),card=node('section',undefined,'miao-prompt-editor-card');
    card.setAttribute('role','dialog');card.setAttribute('aria-modal','true');card.setAttribute('aria-label','编辑 · '+label);
    const heading=node('h3','编辑 · '+label),input=node('textarea'),status=node('p','','miao-muted'),actions=node('div',undefined,'miao-actions');
    input.value=initial;input.setAttribute('aria-label','模块原文');input.spellcheck=false;
    const previous=document.activeElement,blocked=[...parent.children].map(n=>[n,n.inert]);for(const [n] of blocked)n.inert=true;
    let busy=false;
    const finish=()=>{observer.disconnect();parent.removeEventListener('close',finish);document.removeEventListener('keydown',keyHandler,true);parent.removeEventListener('cancel',cancel,true);viewport?.removeEventListener('resize',fit);viewport?.removeEventListener('scroll',fit);if(window.__TAURITAVERN_HANDLE_BACK__===back)window.__TAURITAVERN_HANDLE_BACK__=oldBack;layer.remove();for(const [n,inert] of blocked)n.inert=inert;if(previous?.isConnected)previous.focus();};
    const discard=()=>{if(!busy&&(input.value===initial||window.confirm('放弃当前未保存的修改？')))finish();};
    const cancel=e=>{e.preventDefault();e.stopImmediatePropagation();discard();};
    const keyHandler=e=>{if(e.key==='Escape')cancel(e);else if(e.key==='Tab'){const items=[...card.querySelectorAll('button:not(:disabled),textarea,summary')],first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first||!e.shiftKey&&document.activeElement===last){e.preventDefault();(e.shiftKey?last:first).focus();}}else if(e.key==='Enter')e.stopPropagation();};
    const button=(text,run)=>{const b=node('button',text,'miao-button');b.type='button';b.onclick=run;actions.append(b);return b;};
    button('恢复默认',()=>{if(!busy){input.value=promptTemplates[key].content;input.focus();}});
    button('取消',discard);
    const submit=button('保存',async()=>{if(busy)return;busy=true;submit.disabled=true;input.readOnly=true;try{await save(withPromptOverride(settings.promptConfig,key,input.value));onSaved();finish();}catch(error){status.textContent=error.message;}finally{busy=false;submit.disabled=false;input.readOnly=false;}});
    const macros=node('details'),summary=node('summary','可用酒馆宏');macros.append(summary);
    for(const macro of ['{{getvar::人格}}','{{getvar::对象}}','{{getvar::张数}}','{{getvar::cot_xml}}','{{getvar::彩蛋标签}}','{{getglobalvar::彩蛋要求}}']){const b=node('button',macro,'miao-button');b.type='button';b.onclick=()=>{if(busy)return;input.setRangeText(macro,input.selectionStart,input.selectionEnd,'end');input.focus();};macros.append(b);}
    card.append(heading,node('p','编辑当前模块原文；保存后用于后续生成。','miao-muted'),input,macros,status,actions);layer.append(card);parent.append(layer);
    const viewport=window.visualViewport,fit=()=>{layer.style.setProperty('--miao-editor-height',Math.max(180,(viewport?.height||window.innerHeight)-Math.max(0,parent.getBoundingClientRect().top-(viewport?.offsetTop||0))-16)+'px');};fit();viewport?.addEventListener('resize',fit);viewport?.addEventListener('scroll',fit);
    const observer=new MutationObserver(()=>{if(!layer.isConnected)finish();});observer.observe(document.body,{childList:true,subtree:true});parent.addEventListener('close',finish);
    const oldBack=window.__TAURITAVERN_HANDLE_BACK__,back=()=>{discard();return true;};window.__TAURITAVERN_HANDLE_BACK__=back;
    parent.addEventListener('cancel',cancel,true);document.addEventListener('keydown',keyHandler,true);input.focus();return {element:layer};
}
