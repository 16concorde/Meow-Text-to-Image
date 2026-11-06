import {randomId} from '../platform/browser-crypto.js';
import {copiedBindingArchive} from '../profiles/character-bindings-migration.js';
import {editBinding,validateBindingArchive,BINDING_LIMITS,bindingSwitchKey} from '../profiles/character-bindings.js';
import {bindingNode as n,bindingAction as action,bindingAvatar,bindingField as field,bindingSwitch,bindingDownload} from './character-binding-controls.js';
export function createBindingOwnerEditor({management,route,draft,onChat,onError,onState}){
    const root=n('section',undefined,'miao-binding-owner'),status=n('p','正在加载资料…','miao-muted');root.append(status);let entry,disposed=false,editing=null;
    const fail=error=>{if(error.baseEntry)entry=error.baseEntry;status.textContent=error.message+(error.saveState==='conflict'?'；草稿已保留，请比较已保存资料后重新应用。':'');
        if(error.saveState==='conflict'&&entry){const comparison=n('section',undefined,'miao-binding-conflict');comparison.append(n('h4','保存冲突比较'));const remote=error.latest?.bindings?.find(b=>b.uuid===draft.form?.uuid),base=entry.archive.bindings.find(b=>b.uuid===draft.form?.uuid);if(remote&&base)for(const [key,label] of [['name','名称'],['aliases','别名'],['positive','固定正面'],['negative','固定负面']]){const changed=JSON.stringify(base[key])!==JSON.stringify(remote[key]);comparison.append(n('p',label+'：'+(changed?'已保存版本有变化':'已保存版本未改动')+(draft.form?'；本地草稿已保留':'')));}action(comparison,'以已保存版本为新基线保留草稿',()=>{draft.baseHash=null;return refresh();},()=>{});action(comparison,'放弃草稿并读取已保存版本',()=>refresh({preserve:false}),()=>{});action(comparison,'继续编辑',()=>comparison.remove(),()=>{});root.append(comparison);}
        onError(error);
    };
    async function refresh({preserve=true}={}){status.textContent='正在读取已保存资料，不更改编号…';try{entry=await management.open(route.target,{fresh:true});if(disposed)return;if(!preserve){draft.form=null;draft.defaults={};draft.baseHash=null;}paint();}catch(error){if(disposed)return;status.textContent=error.message;root.replaceChildren(status);action(root,'重试读取',()=>refresh(),fail);action(root,'数据管理／归属修复',()=>onState('repair'),fail);}}
    function form(binding){if(draft.form&&draft.form.uuid!==binding?.uuid)throw Error('请先保存或取消当前角色草稿');editing?.remove();const old=draft.form?.uuid===binding?.uuid?draft.form:null,newUuid=old?.newUuid??(binding?undefined:randomId());const box=n('section',undefined,'miao-binding-editor');editing=box;root.append(box);
        const name=field(box,'角色名',old?.name??binding?.name,{maxLength:160}),aliases=field(box,'别名（用顿号分隔）',old?.aliases??binding?.aliases.join('、'),{maxLength:3200}),positive=field(box,'固定正面',old?.positive??binding?.positive,{multiline:true}),negative=field(box,'固定负面',old?.negative??binding?.negative,{multiline:true});
        function changed(){draft.baseHash??=entry.hash;draft.form={newUuid,uuid:binding?.uuid,name:name.value,aliases:aliases.value,positive:positive.value,negative:negative.value};draft.dirty=true;}
        for(const input of [name,aliases,positive,negative])input.oninput=changed;
        action(box,'保存角色资料',async()=>{changed();await saveForm();},fail);action(box,'取消编辑',()=>{draft.form=null;draft.dirty=Object.keys(draft.defaults||{}).length>0;box.remove();editing=null;},fail);name.focus();
    }
    async function saveArchive(archive){const result=await management.save({...entry,hash:draft.baseHash??entry.hash},archive);entry=result;draft.baseHash=null;status.textContent=result.summaryPending?'资料已保存，检索更新待重试':'已保存并读回确认';return result;}
    async function saveForm(){if(!draft.form)return;const d=draft.form;const next=editBinding(entry.archive,{name:d.name.trim(),aliases:d.aliases.split(/[、\n]/),positive:d.positive.trim(),negative:d.negative.trim()},d.uuid,{newUuid:d.newUuid});await saveArchive(next);draft.form=null;draft.dirty=Object.keys(draft.defaults||{}).length>0;paint();}
    async function saveDefaults(){let next=structuredClone(entry.archive);for(const b of next.bindings)if(typeof draft.defaults?.[b.uuid]==='boolean'&&b.defaultEnabled!==draft.defaults[b.uuid]){b.defaultEnabled=draft.defaults[b.uuid];b.revision++;}await saveArchive(next);draft.defaults={};draft.dirty=!!draft.form;paint();}
    function paint(){
        if(disposed)return;root.replaceChildren(status);status.textContent=entry.legacyChanged?'旧版 v1 资料有新变更；请进入数据管理比较并确认，当前显示 v2 已保存版本。':entry.summaryPending?'资料已保存，检索更新待重试':'角色资料与默认开关适用于此对象的所有聊天；聊天只覆盖开关。';
        const header=n('div',undefined,'miao-owner-heading');header.append(bindingAvatar(management.host,route.target),n('h3',route.target.name),n('small',route.target.locator));if(route.target.type==='user'){const native=management.host.context().powerUserSettings?.persona_descriptions?.[route.target.locator];if(native?.title){const note=n('details');note.append(n('summary','查看完整用户备注'),n('pre',String(native.title)));header.append(note);}}
        root.append(header,n('p',`绑定 ${entry.archive.bindings.length}/${BINDING_LIMITS.count}（归档仍计数）；所属：${entry.archive.owner.ownerId||'首次保存时建立'}`));
        if(route.target.type==='card')action(root,'管理此卡的聊天开关',()=>onChat(route.target),fail);
        for(const binding of entry.archive.bindings){const row=n('div',undefined,'miao-binding-row');row.append(n('strong',`${binding.shortId} · ${binding.name}${binding.archived?'（已归档）':''}`));
            if(!binding.archived)bindingSwitch(row,'默认启用'+binding.shortId,draft.defaults?.[binding.uuid]??binding.defaultEnabled,value=>{draft.defaults??={};draft.baseHash??=entry.hash;draft.defaults[binding.uuid]=value;draft.dirty=true;});
            action(row,'✎ 编辑 '+binding.shortId,()=>form(binding),fail);action(row,(binding.archived?'恢复 ':'归档 ')+binding.shortId,async()=>{if(draft.form)throw Error('请先保存或取消当前角色草稿');await saveArchive(editBinding(entry.archive,{archived:!binding.archived},binding.uuid));paint();},fail);root.append(row);
        }
        action(root,'添加绑定角色',()=>form(),fail);action(root,'保存默认开关',saveDefaults,fail);
        action(root,'刷新已保存资料',()=>draft.dirty?onState('refresh',{preserve:()=>refresh(),discard:()=>refresh({preserve:false})}):refresh(),fail);
        const more=n('details');more.append(n('summary','更多／数据管理'));root.append(more);
        more.append(n('p','完整宿主 data 迁移须包含卡、用户设定、user/files 与聊天。单卡 PNG 不包含固定正负面。旧版本只看到迁移前资料，不会与 v2 实时同步。'));
        action(more,'导出此对象档案',()=>bindingDownload(entry.archive,'meow-binding-owner.json'),fail);
        const file=field(more,'导入档案备份','');file.type='file';file.accept='.json';file.onchange=async()=>{try{const f=file.files[0];if(!f)return;if(f.size>BINDING_LIMITS.bytes)throw Error('档案超过 4 MiB');const imported=validateBindingArchive(JSON.parse(await f.text()));if(imported.owner.type!==entry.archive.owner.type)throw Error('请在对应的对象类型中导入');const preview=n('section',undefined,'miao-binding-editor');more.append(preview);preview.append(n('p',`预览：${imported.bindings.length} 条角色；原身份恢复仅限同一 owner，独立复制会生成新 UUID。`));
            const same=JSON.stringify(imported.owner)===JSON.stringify(entry.archive.owner);
            if(same)action(preview,'确认合并原身份',async()=>{const next=structuredClone(entry.archive);for(const b of imported.bindings){const old=next.bindings.find(x=>x.uuid===b.uuid||x.shortId===b.shortId);if(old){if(old.uuid!==b.uuid||old.shortId!==b.shortId)throw Error('短 ID 冲突');Object.assign(old,b,{revision:Math.max(old.revision,b.revision)+1});}else {if(Number(b.shortId.slice(1))<next.nextSequence)throw Error('不能复用历史编号');next.bindings.push(b);}}next.nextSequence=Math.max(next.nextSequence,imported.nextSequence);validateBindingArchive(next);await saveArchive(next);paint();},fail);
            action(preview,'作为独立角色资料导入',async()=>{let next=entry.archive.bindings.length?structuredClone(entry.archive):copiedBindingArchive(entry.archive,imported);if(entry.archive.bindings.length)for(const b of imported.bindings)next=editBinding(next,{name:b.name,aliases:b.aliases,positive:b.positive,negative:b.negative,archived:b.archived,defaultEnabled:b.defaultEnabled});await saveArchive(next);paint();},fail);action(preview,'取消导入',()=>preview.remove(),fail);
        }catch(error){fail(error);}finally{file.value='';}};
        action(more,'归属修复／资料包',()=>onState('repair'),fail);
        if(entry.record?.copySource)action(more,'从来源独立复制绑定资料',async()=>{entry=await management.copyFrom(route.target,entry.record.copySource);paint();},fail);
        if(draft.form?.newUuid){const confirmed=entry.archive.bindings.find(b=>b.uuid===draft.form.newUuid);if(confirmed)draft.form.uuid=confirmed.uuid;}
        if(draft.form){const binding=entry.archive.bindings.find(b=>b.uuid===draft.form.uuid);form(binding);}
    }
    void refresh();return {element:root,save:async()=>{await saveForm();if(Object.keys(draft.defaults||{}).length)await saveDefaults();},dispose(){disposed=true;editing=null;}};
}
