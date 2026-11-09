import {createPromptAutosave} from './prompt-autosave.js';
import {randomId} from '../platform/browser-crypto.js';
import {editBinding} from '../profiles/character-bindings.js';
import {bindingNode as n,bindingAction as action,bindingIcon as icon,bindingAvatar,bindingField as field,bindingSwitch,bindingViewport} from './character-binding-controls.js';
export function createBindingOwnerEditor({management,route,draft,onChat,onError,onState=()=>{}}){
    const root=n('section',undefined,'miao-binding-owner'),status=n('p','正在加载资料…','miao-muted'),feedback=n('div'),list=bindingViewport('绑定角色'),forms=n('div'),footer=n('footer',undefined,'miao-binding-footer');
    status.setAttribute('aria-live','polite');root.append(status);let entry,disposed=false,editing=null,pending=null,loaded=false;
    const scope=management.host.scope(),active=()=>!disposed&&management.host.scope()===scope;
    const dirty=()=>{draft.dirty=!!draft.form&&draft.form.changed!==false||!!draft.operation||Object.keys(draft.defaults||{}).length>0;onState();};
    function fail(error){if(!active())return;status.textContent=['unknown','unconfirmed'].includes(error.saveState)?'保存结果待确认；请先查证。':error.message;feedback.replaceChildren();
        if(draft.operation)action(feedback,['unknown','unconfirmed'].includes(error.saveState)?'查证保存结果':'重试保存',retry,fail);
        if(error.saveState==='conflict'){
            const comparison=n('section',undefined,'miao-binding-conflict');comparison.append(n('h4','保存冲突比较'));
            const base=entry.archive.bindings.find(b=>b.uuid===draft.form?.uuid),remote=error.latest?.bindings?.find(b=>b.uuid===draft.form?.uuid);
            if(base&&remote)for(const [key,label] of [['name','名称'],['aliases','别名'],['positive','固定正面'],['negative','固定负面']])comparison.append(n('p',label+'：'+(JSON.stringify(base[key])===JSON.stringify(remote[key])?'已保存版本未改动':'已保存版本有变化')+'；本地草稿已保留'));
            action(comparison,'以已保存版本为新基线保留草稿',async()=>{const previous=entry,operation=draft.operation;entry=await management.open(route.target,{fresh:true});draft.baseHash=entry.hash;
                if(operation&&!operation.form){let next=entry.archive;for(const binding of operation.archive.bindings){const base=previous.archive.bindings.find(b=>b.uuid===binding.uuid);if(!base)continue;const patch={};for(const key of ['defaultEnabled','archived'])if(binding[key]!==base[key])patch[key]=binding[key];if(Object.keys(patch).length)next=editBinding(next,patch,binding.uuid);}operation.archive=next;operation.errorState='failed';}
                else draft.operation=null;dirty();paint();if(draft.form?.uuid&&draft.form.changed!==false)formSave.schedule();},fail);
            action(comparison,'继续编辑',()=>comparison.remove(),fail);feedback.append(comparison);
        }onError(error);onState();
    }
    function lock(value){forms.inert=value&&!!draft.operation?.form&&!draft.operation?.auto;root.setAttribute('aria-busy',String(value));for(const el of root.querySelectorAll('button,input[type=checkbox]')){el.dataset.saveBlocked=String(!!draft.operation&&list.contains(el));el.disabled=value||el.dataset.saveBlocked==='true';}onState();}
    async function write(archive){const result=await management.save({...entry,hash:draft.baseHash??entry.hash},archive);entry=result;draft.baseHash=draft.form?result.hash:null;return result;}
    function operate(operation){if(pending)return pending;if(draft.operation&&draft.operation!==operation)return Promise.reject(Error('请先查证未确认的保存'));if(!active())return Promise.reject(Error('账户已改变'));draft.operation=operation;dirty();lock(true);
        pending=(async()=>{
            try{
                // Retry the exact candidate with its original baseline. Storage verifies read-back before rewriting.
                await write(operation.archive);if(management.host.scope()!==scope)throw Error('账户已改变');
                draft.operation=null;formSave.recover();if(operation.form&&!operation.auto){draft.form=null;draft.baseHash=null;}else if(operation.auto&&draft.form){const current={...draft.form};delete current.changed;const submitted={...operation.formSnapshot};delete submitted.changed;if(JSON.stringify(current)===JSON.stringify(submitted))draft.form.changed=false;}if(operation.defaults)draft.defaults={};dirty();if(active()){feedback.replaceChildren();status.textContent='';if(operation.form&&!operation.auto)paint();else paintRows();}
            }catch(error){if(error.baseEntry)entry=error.baseEntry;if(error.baseEntry&&operation.archive.schemaVersion!==entry.archive.schemaVersion)operation.archive={...operation.archive,schemaVersion:entry.archive.schemaVersion,owner:entry.archive.owner,revision:entry.archive.revision};operation.errorState=error.saveState||'failed';dirty();throw error;}
            finally{pending=null;if(active())lock(false);}
        })();onState();return pending;
    }
    function retry(){if(!draft.operation)return Promise.resolve();return operate(draft.operation);}
    function form(binding,{focus=true}={}){if(draft.form&&draft.form.uuid!==binding?.uuid)throw Error('请先保存或取消当前角色草稿');editing?.remove();const old=draft.form?.uuid===binding?.uuid?draft.form:null,newUuid=old?.newUuid??(binding?undefined:randomId()),box=n('section',undefined,'miao-binding-editor');editing=box;forms.append(box);
        const name=field(box,'角色名',old?.name??binding?.name,{maxLength:160}),aliases=field(box,'别名',old?.aliases??binding?.aliases.join('、'),{maxLength:3200,placeholder:'特殊称号、与其他角色同名等情况，可以在此备注'}),positive=field(box,'固定正面',old?.positive??binding?.positive,{multiline:true,placeholder:'开头写boy / girl / other等性别，无需数字（1boy），后接发色、瞳色等固定样貌，不写服装、表情等跟随剧情发展的 Tag，最后一个Tag无需额外添加逗号'}),negative=field(box,'固定负面',old?.negative??binding?.negative,{multiline:true});
        positive.classList.add('miao-binding-positive');
        function changed(){draft.baseHash??=entry.hash;draft.form={newUuid,uuid:binding?.uuid,name:name.value,aliases:aliases.value,positive:positive.value,negative:negative.value,changed:true};dirty();if(binding)formSave.schedule();}
        for(const input of [name,aliases,positive,negative]){input.oninput=changed;input.addEventListener('compositionstart',formSave.compositionStart);input.addEventListener('compositionend',formSave.compositionEnd);}
        if(!binding)action(box,'创建角色',async()=>{changed();await save();},fail);action(box,binding?'完成编辑':'放弃新增',async()=>{if(binding)await formSave.flush();await flushPending();draft.form=null;draft.baseHash=null;dirty();box.remove();editing=null;},fail);if(focus)name.focus();
    }
    async function save(auto=false){await flushPending();if(draft.operation){await retry();return;}if(draft.form&&draft.form.changed!==false){const d=structuredClone(draft.form),next=editBinding(entry.archive,{name:d.name.trim(),aliases:d.aliases.split(/[、\n,，;；]/).map(v=>v.trim()).filter(Boolean),positive:d.positive.trim(),negative:d.negative.trim()},d.uuid,{newUuid:d.newUuid});await operate({archive:next,form:true,auto,formSnapshot:d});}
        if(Object.keys(draft.defaults||{}).length){const next=structuredClone(entry.archive);for(const b of next.bindings)if(typeof draft.defaults[b.uuid]==='boolean'&&b.defaultEnabled!==draft.defaults[b.uuid]){b.defaultEnabled=draft.defaults[b.uuid];b.revision++;}await operate({archive:next,defaults:true});}
    }
    const formSave=createPromptAutosave({run:async()=>{if(draft.form?.uuid&&draft.form.changed!==false)await save(true);},onError:error=>{if(!active())return;status.textContent=error.message;if(draft.operation)fail(error);}});
    async function flushPending(){if(pending)await pending;}
    function paintRows(){if(!active())return;const focus=document.activeElement?.getAttribute('aria-label');route.bindingScroll=list.scrollTop;list.replaceChildren();const archived=entry.archive.bindings.filter(b=>b.archived),details=n('details'),summary=n('summary',`已归档的角色（${archived.length}）`);details.open=!!route.archivedOpen;details.ontoggle=()=>{route.archivedOpen=details.open;};details.append(summary);
        for(const binding of entry.archive.bindings){const row=n('div',undefined,'miao-binding-row'),actions=n('div',undefined,'miao-binding-row-actions');row.dataset.bindingUuid=binding.uuid;row.append(n('strong',`${binding.shortId} · ${binding.name}`),actions);
            if(!binding.archived)bindingSwitch(actions,'默认启用'+binding.shortId,binding.defaultEnabled,async value=>{if(draft.operation)throw Error('请先处理未确认保存');const next=editBinding(entry.archive,{defaultEnabled:value},binding.uuid);await operate({archive:next});},fail);
            icon(actions,'编辑 '+binding.shortId+' '+binding.name,'pen-to-square',()=>form(binding),fail);
            icon(actions,(binding.archived?'恢复 ':'归档 ')+binding.shortId+' '+binding.name,binding.archived?'box-open':'box-archive',async()=>{if(draft.form)throw Error('请先保存或取消当前角色草稿');const wasArchived=binding.archived;await operate({archive:editBinding(entry.archive,{archived:!wasArchived},binding.uuid)});if(active()){const next=list.querySelector('button,input,summary');next?.focus({preventScroll:true});}},fail);
            (binding.archived?details:list).append(row);
        }if(archived.length)list.append(details);if(!entry.archive.bindings.length)list.append(n('p','尚未添加绑定角色','miao-muted'));list.scrollTop=route.bindingScroll||0;
        if(focus)[...list.querySelectorAll('[aria-label]')].find(el=>el.getAttribute('aria-label')===focus)?.focus({preventScroll:true});
    }
    function paint(){if(!active())return;root.replaceChildren(status,feedback);const header=n('div',undefined,'miao-owner-heading');header.append(bindingAvatar(management.host,route.target),n('h3',route.target.name));const tools=n('div',undefined,'miao-binding-owner-tools');icon(tools,'添加绑定角色','plus',()=>form(),fail);root.append(header,tools,list,forms,footer);forms.replaceChildren();footer.replaceChildren();paintRows();
        if(route.target.type==='card')action(footer,'管理此卡的聊天记录',()=>onChat(route.target),fail);footer.append(n('p','角色资料与默认开关适用于此对象的所有聊天；聊天只覆盖开关。','miao-muted'));
        if(draft.form?.newUuid){const confirmed=entry.archive.bindings.find(b=>b.uuid===draft.form.newUuid);if(confirmed)draft.form.uuid=confirmed.uuid;}
        if(draft.form)form(entry.archive.bindings.find(b=>b.uuid===draft.form.uuid),{focus:false});if(draft.operation){status.textContent='有未确认的保存，请重试或查证';action(feedback,'重试／查证保存',retry,fail);}lock(false);
    }
    void management.open(route.target,{fresh:true}).then(result=>{if(!active())return;entry=result;loaded=true;status.textContent=result.legacyChanged?'旧版 v1 资料有新变更，写入已停止；请核对完整宿主备份。':'';paint();onState();}).catch(error=>{if(active()){fail(error);action(root,'重试读取',()=>management.open(route.target,{fresh:true}).then(result=>{entry=result;loaded=true;paint();}),fail);}});
    return {element:root,save:async()=>{try{await save();}catch(error){fail(error);throw error;}},flush:async()=>{await formSave.flush();await flushPending();},flushPending,canSave:()=>loaded&&(!!draft.form||!!draft.operation||Object.keys(draft.defaults||{}).length>0),hasPending:()=>!!pending,hasFailure:()=>!!draft.operation,dispose(){formSave.dispose();disposed=true;editing=null;}};
}
