import {createPromptAutosave} from './prompt-autosave.js';
const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const hints={彩蛋位置:'填写希望触发彩蛋的位置标记，请手动核对使用预设的 <XML> 标签',张数:'填写希望生成的图片数量，例如 2~3。'};
export function createResourceMacrosView({read,save,onError}){
    const root=node('section',undefined,'miao-section miao-prompt-basics'),fields=node('div',undefined,'miao-prompt-fields'),status=node('p','','miao-muted');status.setAttribute('role','status');status.id='miao-prompt-basic-status';
    root.append(node('h3','基础配置'),fields,status);
    let snapshot,controls=[];const composing=new Set();
    const retry=node('button','重试保存','miao-button');retry.type='button';retry.hidden=true;root.append(retry);
    const report=error=>{status.textContent=error.message;retry.hidden=false;for(const {input} of controls)input.setAttribute('aria-invalid','true');onError(error);};
    const autosave=createPromptAutosave({onError:report,run:async()=>{
        if(!snapshot)return;
        const submitted=Object.fromEntries(controls.map(({macro,input})=>[macro.id,input.value]));
        const values=Object.fromEntries(controls.filter(({macro,input})=>macro.value!==input.value).map(({macro,input})=>[macro.id,input.value]));
        if(!Object.keys(values).length)return;
        status.textContent='保存中…';retry.hidden=true;
        const result=await save(snapshot,values);synchronize(result,submitted);
        status.textContent='已保存，提示词已更新';
        // Never rebuild fields after saving: input, selection and IME belong to the user.
        setTimeout(()=>{if(status.textContent==='已保存，提示词已更新')status.textContent='';},1800);
    }});
    function synchronize(result,submitted){
        for(const control of controls){const value=result.macros.find(m=>m.id===control.macro.id)?.value;if(value===undefined)continue;const baseline=submitted?.[control.macro.id]??control.macro.value;
            if(control.input.value===baseline&&!composing.has(control.input)&&control.input.value!==value){const {selectionStart,selectionEnd}=control.input;control.input.value=value;if(document.activeElement===control.input)control.input.setSelectionRange(selectionStart,selectionEnd);}
            control.macro={...control.macro,value};
        }snapshot=result;
    }
    retry.onclick=()=>{void autosave.retry().catch(report);};
    const ready=Promise.resolve().then(read).then(value=>{
        snapshot=value;
        for(const macro of value.macros){
            const wrap=node('label',undefined,'miao-field'),input=node('input');input.type='text';input.value=macro.value;input.maxLength=16000;input.setAttribute('aria-label',macro.name);input.dataset.promptParam=macro.id;
            const hint=node('small',hints[macro.name]||'','miao-muted');hint.id='miao-param-hint-'+macro.id;input.setAttribute('aria-describedby',hint.id+' '+status.id);
            input.oninput=()=>{input.removeAttribute('aria-invalid');autosave.schedule();};input.onchange=()=>{void autosave.flush().catch(report);};input.addEventListener('compositionstart',()=>{composing.add(input);autosave.compositionStart();});input.addEventListener('compositionend',()=>{composing.delete(input);autosave.compositionEnd();});
            wrap.append(node('span',macro.name),input,hint);fields.append(wrap);controls.push({macro,input});
        }
    }).catch(report);
    return {element:root,refresh:async()=>{await ready;synchronize(await read());},retry:autosave.retry,commit:async()=>{await ready;await autosave.flush();},dispose:autosave.dispose};
}
