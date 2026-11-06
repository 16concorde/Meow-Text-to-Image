import {createNsfwKeywordsView} from './nsfw-keywords-view.js';
import {treeById, treeRoots} from '../prompts/tree-defaults.js';
import {effectiveEnabled, savedEnabled, withTreeEnabled} from '../prompts/tree-settings.js';
import {openPromptEditor} from './prompt-editor.js';
const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};

export function createPromptModulesView({settings,save,onError,parent,expanded=new Set()}){
    const root=node('section',undefined,'miao-section miao-prompt-tree');
    root.append(node('h3','提示词条目'));
    if(settings.promptConfig.version!==2||settings.promptConfig.treeRevision!==4){root.append(node('p','旧配置尚未完成安全转换；原配置保留，请从宿主设置备份核对后升级。'));return root;}
    const states=[];
    let busy=false;
    async function commit(next){
        if(busy)return;
        busy=true;root.setAttribute('aria-busy','true');for(const {toggle,select} of states){if(toggle)toggle.disabled=true;if(select)select.disabled=true;}
        try{await save(next);}catch(error){onError(error);}finally{busy=false;root.removeAttribute('aria-busy');paint();}
    }
    function paint(){
        for(const {item,branch,status,toggle,select,radio,expand,children,keywords} of states){
            const config=settings.promptConfig,active=effectiveEnabled(config,item.nodeId);
            branch.hidden=!!item.parentId&&(!effectiveEnabled(config,item.parentId)||!!item.condition?.some(id=>!effectiveEnabled(config,id)));
            if(children){
                children.hidden=!active||!expanded.has(item.nodeId);
                expand.disabled=busy||!active;
                expand.textContent=children.hidden?'▸':'▾';
                expand.setAttribute('aria-expanded',String(!children.hidden));
                expand.setAttribute('aria-label',(children.hidden?'展开':'收起')+item.label);
            }
            status.textContent=(Object.keys(config.textOverridesById?.[item.nodeId]||{}).length?'已自定义':'默认')+' · '+(active?'生效':savedEnabled(config,item.nodeId)?'受父级、条件或选择限制':'已关闭');
            if(active&&(item.nodeId==='nsfw'||item.nodeId==='selfcheck.nsfw'||item.nodeId==='nsfw.rules'||item.nodeId==='orientation'||item.kind==='choice-option'))status.textContent=status.textContent.replace(' · 生效',' · 配置允许（发送需03关键词命中）');
            if(item.condition)status.textContent+='（依赖'+item.condition.map(id=>treeById[id].label).join('、')+'）';
            if(toggle){toggle.checked=savedEnabled(config,item.nodeId);toggle.disabled=busy;}
            if(select){select.value=config.orientation;select.disabled=busy;}
            if(radio){radio.checked=active;radio.disabled=busy;}
            keywords?.refresh();
        }
    }
    function append(id,container,depth=1){
        const item=treeById[id],branch=node('div',undefined,'miao-tree-node');branch.dataset.nodeId=id;branch.dataset.displayId=item.displayId;branch.dataset.depth=depth;
        const row=node('div',undefined,'miao-prompt-module'),title=node('div',undefined,'miao-tree-title'),actions=node('div',undefined,'miao-tree-actions');
        title.append(node('strong',item.displayId+' '+item.label));row.append(title,actions);branch.append(row);container.append(branch);
        let expand,children,keywords;
        if(id==='nsfw'){keywords=createNsfwKeywordsView({settings,save});branch.append(keywords.element);}
        if(item.children.length){
            expand=node('button',undefined,'miao-tree-expand miao-button');expand.type='button';expand.setAttribute('aria-label','展开'+item.label);
            children=node('div',undefined,'miao-tree-children');children.id='miao-tree-'+id.replaceAll('.','-');expand.setAttribute('aria-controls',children.id);
            expand.onclick=()=>{if(expanded.has(id))expanded.delete(id);else expanded.add(id);paint();};title.append(expand);branch.append(children);
            item.children.forEach(child=>append(child,children,depth+1));
        }
        const status=node('span','','miao-muted miao-tree-status');row.append(status);
        let toggle,select,radio;
        if(id==='tags.full'||id==='tags.binding'){
            radio=node('input');radio.type='radio';radio.name='miao-tag-mode';radio.setAttribute('aria-label','选择'+item.label);
            radio.onchange=()=>{void commit({...settings.promptConfig,tagMode:id==='tags.full'?'full':'binding'});};actions.append(radio);
        }
        if(item.toggleable){
            const wrap=node('label',undefined,'miao-prompt-switch');toggle=node('input');toggle.type='checkbox';toggle.setAttribute('role','switch');toggle.setAttribute('aria-label','启用'+item.label);wrap.append(toggle,node('span',undefined,'miao-prompt-switch-track'));actions.append(wrap);
            toggle.onchange=()=>{void commit(withTreeEnabled(settings.promptConfig,id,toggle.checked));};
        }
        if(Object.keys(item.slots).length){
            const edit=node('button',undefined,'miao-button miao-tree-edit');edit.type='button';edit.setAttribute('aria-label','编辑'+item.label);edit.title='编辑'+item.label;const icon=node('i',undefined,'fa-solid fa-pencil');icon.setAttribute('aria-hidden','true');edit.append(icon);
            edit.onclick=()=>openPromptEditor({parent:parent(),settings,key:id,label:item.label,save,onError,onSaved:paint});actions.prepend(edit);
        }
        if(item.kind==='choice-group'){
            const choice=node('label','发送的性向','miao-field');select=node('select');select.setAttribute('aria-label','发送的性向');
            for(const [value,text] of [['','不指定'],['BG','BG'],['BL','BL'],['GL','GL'],['INTERSEX','双性']]){const option=node('option',text);option.value=value;select.append(option);}
            select.onchange=()=>{void commit({...settings.promptConfig,orientation:select.value});};choice.append(select);branch.append(choice);
        }
        states.push({item,branch,status,toggle,select,radio,expand,children,keywords});
    }
    treeRoots.forEach(id=>append(id,root));paint();return root;

}
