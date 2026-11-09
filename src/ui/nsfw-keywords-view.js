import {setUIIcon,uiIcons} from './fontawesome-icons.js';
import {defaultNsfwKeywords,validateNsfwKeywords} from '../prompts/nsfw-trigger.js';
import {withNsfwKeywords} from '../prompts/tree-settings.js';
const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
export function createNsfwKeywordsView({settings,save}){
    const root=node('section',undefined,'miao-nsfw-keywords'),header=node('div',undefined,'miao-keyword-header'),list=node('div',undefined,'miao-keyword-chips'),editor=node('div',undefined,'miao-keyword-editor'),status=node('p','','miao-muted');
    root.setAttribute('aria-label','NSFW 触发关键词');status.setAttribute('role','status');
    let disposed=false,expanded=false,editing=false,composing=false,tail=Promise.resolve();
    const button=(text,label,run)=>{const b=node('button',text,'miao-button');b.type='button';b.setAttribute('aria-label',label);b.onclick=run;return b;};
    const title=node('span'),expand=button('','展开触发关键词',()=>{if(input.value.trim()&&!expanded)return;if(input.value.trim()){status.textContent='请先添加或取消当前关键词草稿';return;}expanded=!expanded;paint();}),edit=button('','编辑触发关键词',()=>{editing=expanded=true;paint();input.focus();});
    list.id='miao-nsfw-keyword-list';list.tabIndex=0;list.setAttribute('role','region');list.setAttribute('aria-label','触发关键词列表');expand.setAttribute('aria-controls',list.id);header.append(expand,title,edit);setUIIcon(edit,uiIcons.edit);expand.classList.add('miao-tree-icon');edit.classList.add('miao-tree-icon');
    const input=node('input');input.type='text';input.maxLength=128;input.setAttribute('aria-label','触发关键词文本');input.addEventListener('compositionstart',()=>composing=true);input.addEventListener('compositionend',()=>composing=false);
    async function commit(change){
        const job=tail.catch(()=>{}).then(async()=>{try{await save(withNsfwKeywords(settings.promptConfig,change([...validateNsfwKeywords(settings.promptConfig.nsfwTrigger.keywords)])));if(!disposed){status.textContent='';paint();}}catch(error){if(!disposed)status.textContent=error.message;throw error;}});tail=job;return job;
    }
    const add=async()=>{if(composing)return;const value=input.value.trim();try{await commit(words=>[...words,value]);if(input.value.trim()===value)input.value='';input.focus();}catch{}};
    input.onkeydown=e=>{if(e.isComposing||composing)return;if(e.key==='Enter'){e.preventDefault();e.stopPropagation();void add();}if(e.key==='Escape'){e.preventDefault();e.stopPropagation();input.value='';status.textContent='';}};
    const restore=button('恢复默认','恢复默认触发关键词',()=>{if(window.confirm('恢复默认触发关键词？将替换当前列表。'))void commit(()=>[...defaultNsfwKeywords]).catch(()=>{});});
    const done=button('完成','完成关键词编辑',async()=>{if(input.value.trim()){status.textContent='请先添加或取消当前关键词草稿';input.focus();return;}try{await tail;editing=false;paint();edit.focus();}catch{}});
    editor.append(input,button('添加','添加触发关键词',add),restore,done);root.append(header,list,editor,status);
    function paint(){
        const words=settings.promptConfig.nsfwTrigger.keywords;title.textContent='触发关键词';setUIIcon(expand,expanded?uiIcons.collapse:uiIcons.expand);expand.setAttribute('aria-expanded',String(expanded));expand.setAttribute('aria-label',(expanded?'收起':'展开')+'触发关键词');list.hidden=!expanded;editor.hidden=!expanded||!editing;edit.hidden=editing;list.replaceChildren();
        if(!words.length)list.append(node('span','暂无触发关键词','miao-muted'));
        words.forEach(word=>{const chip=node('span',undefined,'miao-keyword-chip');const text=node('span',word,'miao-keyword-text');if([...word].length>16)text.classList.add('miao-keyword-long');chip.append(text);if(editing){const remove=button('','删除触发关键词：'+word,async()=>{try{await commit(current=>current.filter(w=>w!==word));input.focus();}catch{}});setUIIcon(remove,uiIcons.close);chip.append(remove);}list.append(chip);});
    }
    paint();return {element:root,refresh:()=>{if(!disposed)paint();},dispose(){disposed=true;},commit:async()=>{if(input.value.trim())throw Error('请先添加或取消关键词草稿');await tail;}};
}
