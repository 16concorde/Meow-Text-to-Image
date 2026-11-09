import {createChoiceIntent} from './prompt-choice-intent.js';
import {createNsfwKeywordsView} from './nsfw-keywords-view.js';
import {treeById,treeRoots} from '../prompts/tree-defaults.js';
import {effectiveEnabled,savedEnabled,withTreeEnabled} from '../prompts/tree-settings.js';
import {renderTask} from '../prompts/prompt-runtime-renderer.js';
import {openPromptEditor} from './prompt-editor.js';
import {setUIIcon,uiIcons} from './fontawesome-icons.js';
let instance=0;
const n=(tag,text,cls)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;};
export function createPromptModulesView({settings,save,onError,parent,expanded=new Set()}){
    const root=n('section',undefined,'miao-section miao-prompt-tree');root.append(n('h3','提示词条目'));const states=[],jobs=new Set(),groupId='miao-prompt-choice-'+(++instance);let emptyRadio,disposed=false,genericFailure=null,genericRevision=0;
    const choices=Object.fromEntries(['tagMode','orientation'].map(field=>[field,createChoiceIntent(()=>settings.promptConfig[field])]));const feedback=new Map();
    const track=job=>{jobs.add(job);job.finally(()=>jobs.delete(job)).catch(()=>{});void job.catch(()=>{});return job;};
    const commit=(next,paths)=>{const revision=++genericRevision;genericFailure=null;const job=Promise.resolve().then(()=>save(next,{paths}));track(job);void job.then(()=>{if(!disposed)paint();},error=>{if(disposed)return;if(revision===genericRevision)genericFailure=error;onError(error);paint();});return job;};
    function choose(field,value,{retry=false}={}){const model=choices[field],attempt=retry?model.retry():model.begin(value);if(!attempt){paint();return;}
        paint();const job=Promise.resolve().then(()=>save({...settings.promptConfig,[field]:attempt.value},{paths:[[field]],silentChoice:true}));track(job);
        void job.then(()=>{if(disposed)return;model.settle(attempt);paint();},error=>{if(disposed)return;model.settle(attempt,error);paint();});
    }
    function choiceFeedback(field,container){const box=n('div',undefined,'miao-choice-feedback'),status=n('p','','miao-muted'),retry=n('button','重试保存','miao-button');status.setAttribute('role','status');retry.type='button';retry.onclick=()=>choose(field,null,{retry:true});box.append(status,retry);container.append(box);feedback.set(field,{box,status,retry});}
    const icon=(label,glyph)=>{const b=n('button',undefined,'miao-tree-icon');b.type='button';b.setAttribute('aria-label',label);b.title=label;setUIIcon(b,glyph);return b;};
    function paint(){
        if(disposed)return;for(const [field,{box,status,retry}] of feedback){const state=choices[field].state();box.hidden=!state?.error;status.textContent=state?.error?.message??'';retry.hidden=!state?.error;retry.textContent=state?.pending?'检查保存结果':state?.error?.stage==='publish'?'重试提示词更新':'重试保存';}
        for(const state of states){
            const {item,branch,toggle,radio,expand,children,keywords,preview}=state,config=settings.promptConfig,active=effectiveEnabled(config,item.nodeId);
            branch.hidden=!!item.parentId&&!effectiveEnabled(config,item.parentId);
            if(children){children.hidden=!expanded.has(item.nodeId);setUIIcon(expand,children.hidden?uiIcons.expand:uiIcons.collapse);expand.setAttribute('aria-expanded',String(!children.hidden));expand.setAttribute('aria-label',(children.hidden?'展开':'收起')+item.label);expand.title=expand.getAttribute('aria-label');}
            if(toggle)toggle.checked=savedEnabled(config,item.nodeId);if(radio)radio.checked=item.tagMode?choices.tagMode.value()===item.tagMode:choices.orientation.value()===item.choice;
            keywords?.refresh();if(preview)preview.textContent=renderTask(item.slots.body,config,effectiveEnabled(config,'egg'));branch.dataset.effective=String(active);
        }if(emptyRadio)emptyRadio.checked=choices.orientation.value()==='' ;
    }
    function row(item,depth,container){
        const branch=n('div',undefined,'miao-tree-node'+(depth===1?' miao-tree-root':''));branch.dataset.depth=depth;if(item.nodeId)branch.dataset.nodeId=item.nodeId;
        const header=n('div',undefined,'miao-prompt-module'),info=n('div',undefined,'miao-tree-info'),leading=n('span',undefined,'miao-tree-leading'),title=n('div',undefined,'miao-tree-title'),editSlot=n('span',undefined,'miao-tree-edit-slot'),controlSlot=n('span',undefined,'miao-tree-control-slot');
        info.style.setProperty('--miao-tree-depth',String(depth-1));title.append(n('strong',item.label));info.append(leading,title);header.append(info,editSlot,controlSlot);branch.append(header);container.append(branch);return {branch,header,info,leading,title,editSlot,controlSlot};
    }
    function append(id,container,depth=1){
        const item=treeById[id];
        if(id==='orientation'){const group=n('fieldset',undefined,'miao-orientation-group');group.setAttribute('role','radiogroup');group.setAttribute('aria-label','性向选择');const legend=n('legend','性向选择','miao-sr-only');group.append(legend);container.append(group);const empty=row({label:'不指定'},depth,group);emptyRadio=n('input');emptyRadio.type='radio';emptyRadio.name=groupId+'-orientation';emptyRadio.setAttribute('aria-label','不指定');emptyRadio.onchange=()=>choose('orientation','');empty.controlSlot.append(emptyRadio);item.children.forEach(child=>append(child,group,depth));choiceFeedback('orientation',group);return;}
        const parts=row(item,depth,container),{branch,header,info,leading,title,editSlot,controlSlot}=parts;let expand,children,keywords,preview,toggle,radio;
        if(!item.toggleable&&!item.tagMode&&item.kind!=='choice-option'&&id!=='task')title.append(n('small','受上级影响或受限选择','miao-muted miao-tree-dependency'));
        if(item.children.length||id==='task'||id==='nsfw'){
            header.classList.add('miao-tree-expandable');expand=icon('展开'+item.label,uiIcons.expand);expand.classList.add('miao-tree-expand');leading.append(expand);children=n('div',undefined,'miao-tree-children');children.id=groupId+'-tree-'+id.replaceAll('.','-');expand.setAttribute('aria-controls',children.id);branch.append(children);
            const change=async()=>{if(expanded.has(id)){try{await keywords?.commit();}catch(error){onError(error);return;}if(children.contains(document.activeElement))expand.focus();expanded.delete(id);}else expanded.add(id);paint();};expand.onclick=change;let start=null,moved=false;
            header.onpointerdown=event=>{start={x:event.clientX,y:event.clientY};moved=false;};header.onpointermove=event=>{if(start&&Math.hypot(event.clientX-start.x,event.clientY-start.y)>6)moved=true;};header.onpointercancel=()=>{moved=true;};
            header.onclick=event=>{if(event.composedPath().some(node=>node instanceof Element&&node.matches('button,input,select,textarea,label,a'))||moved||document.getSelection()?.toString())return;void change();};
            if(id==='task'){preview=n('pre','','miao-task-preview');children.append(preview);}
            if(id==='tags'){const group=n('div');group.setAttribute('role','radiogroup');group.setAttribute('aria-label','Tag 模式');children.append(group);choiceFeedback('tagMode',children);item.children.forEach(child=>append(child,treeById[child].tagMode?group:children,depth+1));}else item.children.forEach(child=>append(child,children,depth+1));
            if(id==='nsfw'){keywords=createNsfwKeywordsView({settings,save});children.append(keywords.element);}
        }
        if(item.tagMode&&id.startsWith('tags.')||item.kind==='choice-option'){radio=n('input');radio.type='radio';radio.name=groupId+(item.tagMode?'-tagMode':'-orientation');radio.setAttribute('aria-label','选择'+item.label);radio.onchange=()=>choose(item.tagMode?'tagMode':'orientation',item.tagMode??item.choice);controlSlot.append(radio);}
        if(item.toggleable&&item.control!=='base'){const wrap=n('label',undefined,'miao-prompt-switch');toggle=n('input');toggle.type='checkbox';toggle.setAttribute('role','switch');toggle.setAttribute('aria-label','启用'+item.label);wrap.append(toggle,n('span',undefined,'miao-prompt-switch-track'));controlSlot.append(wrap);toggle.onchange=()=>{void commit(withTreeEnabled(settings.promptConfig,id,toggle.checked),[['enabledById',id]]);};}
        if(Object.keys(item.slots).length&&item.editable!==false){const edit=icon('编辑'+item.label,uiIcons.edit);edit.classList.add('miao-tree-edit');edit.onclick=()=>openPromptEditor({parent:parent(),settings,key:id,label:item.label,save,onError,onSaved:paint});editSlot.append(edit);}
        states.push({item,branch,toggle,radio,expand,children,keywords,preview});
    }
    treeRoots.forEach(id=>append(id,root));paint();
    root.commit=async()=>{for(;;){while(jobs.size)await Promise.allSettled([...jobs]);if(genericFailure)throw genericFailure;for(const model of Object.values(choices)){const error=model.state()?.error;if(error)throw error;}for(const state of states)await state.keywords?.commit();if(!jobs.size)return;}};
    root.refresh=(options={})=>{for(const model of Object.values(choices))model.refresh(options);if(options.published&&genericFailure?.stage==='publish')genericFailure=null;paint();};
    root.hasPending=()=>!!jobs.size||Object.values(choices).some(model=>model.hasPending());root.hasFailure=()=>!!genericFailure||Object.values(choices).some(model=>model.hasFailure());root.dispose=()=>{disposed=true;for(const state of states)state.keywords?.dispose();};return root;
}
