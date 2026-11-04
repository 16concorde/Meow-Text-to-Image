import {defaultNsfwKeywords,validateNsfwKeywords} from '../prompts/nsfw-trigger.js';
import {savedEnabled,withNsfwKeywords} from '../prompts/tree-settings.js';
const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
export function createNsfwKeywordsView({settings,save}){
    const root=node('section',undefined,'miao-nsfw-keywords'),list=node('div',undefined,'miao-keyword-chips'),editor=node('div',undefined,'miao-keyword-editor'),status=node('p','','miao-muted');
    root.setAttribute('aria-label','NSFW 触发关键词');status.setAttribute('role','status');
    root.append(node('strong','触发关键词'),list,editor,node('p','开启 03 后，仅最近两条有效聊天消息命中时发送。标签按字面包含匹配；默认单字「操」也会命中「操作」，可删除或替换。','miao-muted'),status);
    let editing=null,busy=false;
    const button=(text,label,run)=>{const b=node('button',text,'miao-button');b.type='button';b.setAttribute('aria-label',label);b.onclick=run;return b;};
    function read(){return validateNsfwKeywords(settings.promptConfig.nsfwTrigger?.keywords);}
    async function commit(keywords){
        if(busy)return;let next;
        try{next=withNsfwKeywords(settings.promptConfig,keywords);}catch(error){status.textContent=error.message;return;}
        busy=true;const controls=[...root.querySelectorAll('button,input')];controls.forEach(n=>n.disabled=true);
        try{await save(next);editing=null;editor.replaceChildren();status.textContent='已保存触发关键词';paint();}
        catch(error){status.textContent=error.message;}
        finally{busy=false;controls.forEach(n=>n.disabled=false);}
    }
    function edit(index){
        if(busy)return;if(editing!==null){status.textContent='请先保存或取消当前标签草稿';return;}let words;try{words=read();}catch(error){status.textContent=error.message;return;}
        editing=index;editor.replaceChildren();const input=node('input');input.type='text';input.value=index===-1?'':words[index];input.setAttribute('aria-label','触发关键词文本');input.maxLength=128;
        const cancel=()=>{if(!busy){editing=null;editor.replaceChildren();status.textContent='';}};
        const submit=()=>{let values;try{values=[...read()];if(index===-1)values.push(input.value);else values[index]=input.value;}catch(error){status.textContent=error.message;return;}void commit(values);};
        input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();e.stopPropagation();submit();}if(e.key==='Escape'){e.preventDefault();e.stopPropagation();cancel();}};
        editor.append(input,button('保存标签','保存触发关键词',submit),button('取消','取消关键词编辑',cancel));input.focus();
    }
    function paint(){
        root.dataset.armed=String(savedEnabled(settings.promptConfig,'nsfw'));list.replaceChildren();let words;
        try{words=read();}catch{status.textContent='触发配置无效，原配置已保留；可确认恢复默认标签后重试。';}
        if(words){
            if(!words.length)list.append(node('span','暂无触发关键词，03 不会自动激活','miao-muted'));
            words.forEach((word,index)=>{const chip=node('span',undefined,'miao-keyword-chip');chip.append(button(word,'编辑触发关键词：'+word,()=>edit(index)),button('×','删除触发关键词：'+word,()=>{if(busy)return;if(editing!==null){status.textContent='请先保存或取消当前标签草稿';return;}void commit(read().filter((_,i)=>i!==index));}));list.append(chip);});
            list.append(button('+ 添加','添加触发关键词',()=>edit(-1)));
        }
        list.append(button('恢复默认标签','恢复默认触发关键词',()=>{if(!busy&&window.confirm('恢复默认触发关键词？当前标签列表将被替换。'))void commit([...defaultNsfwKeywords]);}));
    }
    paint();return {element:root,refresh:()=>{root.dataset.armed=String(savedEnabled(settings.promptConfig,'nsfw'));}};
}
