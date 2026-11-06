import {randomId} from '../platform/browser-crypto.js';
import {editBinding,BINDING_LIMITS} from '../profiles/character-bindings.js';
import {bindingNode as n,bindingAction as action,bindingAvatar,bindingField as field,bindingSwitch} from './character-binding-controls.js';
export function createBindingOwnerEditor({management,route,draft,onChat,onError,onState}){
    const root=n('section',undefined,'miao-binding-owner'),status=n('p','正在加载资料…','miao-muted');root.append(status);let entry,disposed=false,editing=null;
    const fail=error=>{if(error.baseEntry)entry=error.baseEntry;status.textContent=error.message+(error.saveState==='conflict'?'；草稿已保留，请比较已保存资料后重新应用。':'');
        if(error.saveState==='conflict'&&entry){const comparison=n('section',undefined,'miao-binding-conflict');comparison.append(n('h4','保存冲突比较'));const remote=error.latest?.bindings?.find(b=>b.uuid===draft.form?.uuid),base=entry.archive.bindings.find(b=>b.uuid===draft.form?.uuid);if(remote&&base)for(const [key,label] of [['name','名称'],['aliases','别名'],['positive','固定正面'],['negative','固定负面']]){const changed=JSON.stringify(base[key])!==JSON.stringify(remote[key]);comparison.append(n('p',label+'：'+(changed?'已保存版本有变化':'已保存版本未改动')+(draft.form?'；本地草稿已保留':'')));}action(comparison,'以已保存版本为新基线保留草稿',()=>{draft.baseHash=null;return refresh();},()=>{});action(comparison,'放弃草稿并读取已保存版本',()=>refresh({preserve:false}),()=>{});action(comparison,'继续编辑',()=>comparison.remove(),()=>{});root.append(comparison);}
        onError(error);
    };
    async function refresh({preserve=true}={}){status.textContent='正在读取已保存资料，不更改编号…';try{entry=await management.open(route.target,{fresh:true});if(disposed)return;if(!preserve){draft.form=null;draft.defaults={};draft.baseHash=null;}paint();}catch(error){if(disposed)return;status.textContent=error.message;root.replaceChildren(status);onError(error);action(root,'重试读取',()=>refresh(),fail);}}
    function form(binding){if(draft.form&&draft.form.uuid!==binding?.uuid)throw Error('请先保存或取消当前角色草稿');editing?.remove();const old=draft.form?.uuid===binding?.uuid?draft.form:null,newUuid=old?.newUuid??(binding?undefined:randomId());const box=n('section',undefined,'miao-binding-editor');editing=box;root.append(box);
        const name=field(box,'角色名',old?.name??binding?.name,{maxLength:160}),aliases=field(box,'别名（用顿号分隔）',old?.aliases??binding?.aliases.join('、'),{maxLength:3200}),positive=field(box,'固定正面',old?.positive??binding?.positive,{multiline:true}),negative=field(box,'固定负面',old?.negative??binding?.negative,{multiline:true});
        function changed(){draft.baseHash??=entry.hash;draft.form={newUuid,uuid:binding?.uuid,name:name.value,aliases:aliases.value,positive:positive.value,negative:negative.value};draft.dirty=true;}
        for(const input of [name,aliases,positive,negative])input.oninput=changed;
        action(box,'保存角色资料',async()=>{changed();await saveForm();},fail);action(box,'取消编辑',()=>{draft.form=null;draft.dirty=Object.keys(draft.defaults||{}).length>0;box.remove();editing=null;},fail);name.focus();
    }
    async function saveArchive(archive){const result=await management.save({...entry,hash:draft.baseHash??entry.hash},archive);entry=result;draft.baseHash=null;status.textContent='已保存并读回确认';return result;}
    async function saveForm(){if(!draft.form)return;const d=draft.form;const next=editBinding(entry.archive,{name:d.name.trim(),aliases:d.aliases.split(/[、\n]/),positive:d.positive.trim(),negative:d.negative.trim()},d.uuid,{newUuid:d.newUuid});await saveArchive(next);draft.form=null;draft.dirty=Object.keys(draft.defaults||{}).length>0;paint();}
    async function saveDefaults(){let next=structuredClone(entry.archive);for(const b of next.bindings)if(typeof draft.defaults?.[b.uuid]==='boolean'&&b.defaultEnabled!==draft.defaults[b.uuid]){b.defaultEnabled=draft.defaults[b.uuid];b.revision++;}await saveArchive(next);draft.defaults={};draft.dirty=!!draft.form;paint();}
    function paint(){
        if(disposed)return;root.replaceChildren(status);status.textContent=entry.legacyChanged?'旧版 v1 资料有新变更，写入已停止；请核对完整宿主备份。':'角色资料与默认开关适用于此对象的所有聊天；聊天只覆盖开关。';
        const header=n('div',undefined,'miao-owner-heading');header.append(bindingAvatar(management.host,route.target),n('h3',route.target.name),n('small',route.target.locator));if(route.target.type==='user'){const native=management.host.context().powerUserSettings?.persona_descriptions?.[route.target.locator];if(native?.title){const note=n('details');note.append(n('summary','查看完整用户备注'),n('pre',String(native.title)));header.append(note);}}
        root.append(header,n('p',`绑定 ${entry.archive.bindings.length}/${BINDING_LIMITS.count}（归档仍计数）；所属：${entry.archive.owner.ownerId||'首次保存时建立'}`));
        if(route.target.type==='card')action(root,'管理此卡的聊天开关',()=>onChat(route.target),fail);
        for(const binding of entry.archive.bindings){const row=n('div',undefined,'miao-binding-row');row.append(n('strong',`${binding.shortId} · ${binding.name}${binding.archived?'（已归档）':''}`));
            if(!binding.archived)bindingSwitch(row,'默认启用'+binding.shortId,draft.defaults?.[binding.uuid]??binding.defaultEnabled,value=>{draft.defaults??={};draft.baseHash??=entry.hash;draft.defaults[binding.uuid]=value;draft.dirty=true;});
            action(row,'✎ 编辑 '+binding.shortId,()=>form(binding),fail);action(row,(binding.archived?'恢复 ':'归档 ')+binding.shortId,async()=>{if(draft.form)throw Error('请先保存或取消当前角色草稿');await saveArchive(editBinding(entry.archive,{archived:!binding.archived},binding.uuid));paint();},fail);root.append(row);
        }
        action(root,'添加绑定角色',()=>form(),fail);action(root,'保存默认开关',saveDefaults,fail);
        action(root,'刷新已保存资料',()=>draft.dirty?onState('refresh',{preserve:()=>refresh(),discard:()=>refresh({preserve:false})}):refresh(),fail);
        if(draft.form?.newUuid){const confirmed=entry.archive.bindings.find(b=>b.uuid===draft.form.newUuid);if(confirmed)draft.form.uuid=confirmed.uuid;}
        if(draft.form){const binding=entry.archive.bindings.find(b=>b.uuid===draft.form.uuid);form(binding);}
    }
    void refresh();return {element:root,save:async()=>{await saveForm();if(Object.keys(draft.defaults||{}).length)await saveDefaults();},dispose(){disposed=true;editing=null;}};
}
