import {editBinding,bindingSwitchKey,bindingRoster,validateBindingArchive,BINDING_LIMITS} from '../profiles/character-bindings.js';
const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};

export function createCharacterBindingsView({session,settings,onError,onSaved=()=>{}}){
    const root=node('section',undefined,'miao-character-bindings'),status=node('p','加载角色档案…','miao-muted');root.append(status);
    let epoch=0,busy=false;
    function action(parent,label,fn){const b=node('button',label,'miao-button');b.type='button';b.onclick=async()=>{if(busy)return;busy=true;b.disabled=true;try{await fn();}catch(error){status.textContent=error.message;onError(error);}finally{busy=false;b.disabled=false;}};parent.append(b);return b;}
    function field(parent,label,value,textarea=false){const wrap=node('label',undefined,'miao-field'),input=node(textarea?'textarea':'input');input.value=value??'';input.setAttribute('aria-label',label);input.maxLength=textarea?BINDING_LIMITS.text:BINDING_LIMITS.name;wrap.append(node('span',label),input);parent.append(wrap);return input;}
    async function paint(reload=false){
        const token=++epoch;if(reload)session.invalidate();
        try{
            const state=await session.load();if(token!==epoch)return;
            root.replaceChildren(status);status.textContent='（功能制作与测试中，先别使用）角色资料归角色卡／用户设定所有；当前聊天只覆盖启停，不单独保存外貌。';
            const id=state.identity;
            if(id.unsupported){root.append(node('p','群聊暂不支持角色绑定'));return;}
            for(const [type,label] of [['card','当前角色卡'],['user','当前用户设定']])root.append(node('p',`${label}：${id.owners.find(o=>o.type===type)?.label||'未选择'}`));
            root.append(node('p','当前聊天：'+(id.chat||'未打开')));
            root.append(node('p',settings.promptConfig?.mode==='external'?'外部世界书模式：可编辑档案，内置绑定指令不会注入。':`生图模式：${settings.promptConfig?.tagMode==='binding'?'角色绑定':'完整 Tag（默认）'}`));
            root.append(node('p','头像文件标识变化（重命名、复制、换头像等）可能产生新归属；请导出备份。同一头像仅改显示名不会改变 ID。','miao-muted'));
            const values={},rows=session.rows(),list=node('pre',undefined,'miao-binding-roster');
            function showRoster(){const preview=rows.map(b=>{const v=values[bindingSwitchKey(b.owner,b)];return {...b,enabled:typeof v==='boolean'?v:b.defaultEnabled};});const text=bindingRoster(preview);list.textContent=`当前有效绑定：${preview.filter(b=>b.enabled).length}\n${text||'（无）'}`;}
            for(const [type,title] of [['card','角色卡绑定'],['user','用户设定绑定']]){
                const section=node('section',undefined,'miao-section');section.append(node('h3',title));root.append(section);
                const entry=state.entries.find(e=>e.archive.owner.type===type);
                if(!entry){section.append(node('p',type==='card'?'请先打开要绑定的角色卡，再设置绑定':'请先选择有效的用户设定'));continue;}
                const archive=entry.archive;
                function editor(binding){
                    const form=node('div',undefined,'miao-binding-editor');section.append(form);
                    const name=field(form,'角色名',binding?.name),aliases=field(form,'别名（用顿号分隔）',binding?.aliases.join('、'));
                    aliases.maxLength=BINDING_LIMITS.name*BINDING_LIMITS.aliases;
                    const positive=field(form,'固定正面',binding?.positive,true),negative=field(form,'固定负面',binding?.negative,true);
                    form.append(node('p','保存档案始终更新此角色卡／用户设定的唯一资料；正负面不写入聊天开关。','miao-muted'));
                    action(form,'保存角色档案',async()=>{await session.saveArchive(editBinding(archive,{name:name.value.trim(),aliases:aliases.value.split(/[、\n]/),positive:positive.value.trim(),negative:negative.value.trim()},binding?.uuid));onSaved();await paint();});
                    action(form,'取消编辑',()=>form.remove());name.focus();
                }
                for(const binding of archive.bindings){
                    const row=node('div',undefined,'miao-binding-row');row.append(node('strong',binding.shortId+' · '+binding.name+(binding.archived?'（已归档）':'')));section.append(row);
                    if(!binding.archived){
                        const current=rows.find(b=>b.uuid===binding.uuid&&b.owner.type===type),k=bindingSwitchKey(archive.owner,binding);values[k]=current.source==='chat'?current.enabled:'inherit';
                        const wrap=node('label',undefined,'miao-prompt-switch'),toggle=node('input');toggle.type='checkbox';toggle.setAttribute('role','switch');toggle.setAttribute('aria-label','启用'+binding.shortId);toggle.checked=current.enabled;wrap.append(toggle,node('span',undefined,'miao-prompt-switch-track'));row.append(wrap);
                        const source=node('span',current.source==='chat'?'当前聊天覆盖':'使用'+(type==='card'?'角色卡':'用户设定')+'默认','miao-muted');row.append(source);
                        toggle.onchange=()=>{values[k]=toggle.checked;source.textContent='开关待保存';showRoster();};
                        action(row,'恢复继承 '+binding.shortId,()=>{values[k]='inherit';toggle.checked=binding.defaultEnabled;source.textContent='继承待保存';showRoster();});
                    }
                    action(row,'✎ 编辑 '+binding.shortId,()=>editor(binding));
                    action(row,(binding.archived?'恢复 ':'归档 ')+binding.shortId,async()=>{await session.saveArchive(editBinding(archive,{archived:!binding.archived},binding.uuid));onSaved();await paint();});
                }
                action(section,'添加'+title,()=>editor());
                action(section,'导出'+title,()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(archive,null,2)],{type:'application/json'})),a=node('a');a.href=url;a.download=`meow-${type}-bindings.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
                const importLabel=node('label','导入备份（校验后预览并合并）','miao-field'),input=node('input');input.type='file';input.accept='.json,application/json';importLabel.append(input);section.append(importLabel);
                input.onchange=async()=>{try{
                    const file=input.files[0];if(!file)return;if(file.size>BINDING_LIMITS.bytes)throw Error('导入文件超过 4 MiB');
                    const imported=validateBindingArchive(JSON.parse(await file.text()),archive.owner),merged=structuredClone(archive);
                    for(const item of imported.bindings){const existing=merged.bindings.find(b=>b.uuid===item.uuid||b.shortId===item.shortId);if(existing){if(existing.uuid!==item.uuid||existing.shortId!==item.shortId)throw Error('导入 ID 冲突，不能重新分配历史身份');Object.assign(existing,item,{revision:Math.max(existing.revision,item.revision)+1});}else {if(Number(item.shortId.slice(1))<archive.nextSequence)throw Error('导入试图复用历史 ID');merged.bindings.push(item);}}
                    merged.nextSequence=Math.max(merged.nextSequence,imported.nextSequence);validateBindingArchive(merged);
                    const preview=node('div',undefined,'miao-binding-editor');preview.append(node('p',`导入 ${imported.bindings.length} 个角色，合并后共 ${merged.bindings.length} 个；匹配的角色正文将被更新。`));section.append(preview);
                    for(const item of imported.bindings){const old=archive.bindings.find(b=>b.uuid===item.uuid);const changed=old?['name','aliases','positive','negative','defaultEnabled','archived'].filter(k=>JSON.stringify(old[k])!==JSON.stringify(item[k])):[];preview.append(node('p',`${old?'更新':'新增'} ${item.shortId} · ${item.name}${old?'（变化字段：'+(changed.join('、')||'无')+'）':''}`));}
                    action(preview,'确认合并备份',async()=>{await session.saveArchive(merged);onSaved();await paint();});action(preview,'取消导入',()=>preview.remove());
                }catch(error){status.textContent=error.message;onError(error);}finally{input.value='';}};
            }
            const actions=node('div',undefined,'miao-actions');root.append(actions);
            action(actions,'保存当前开关至角色卡／用户设定（全局）',async()=>{await session.saveSwitches(values,'global');onSaved();await paint();});
            action(actions,'保存当前开关至当前聊天（覆盖全局）',async()=>{await session.saveSwitches(values,'chat');onSaved();await paint();}).disabled=!id.chat;
            action(actions,'重载角色档案',()=>paint(true));root.append(list);showRoster();
            root.append(node('p','每档最多 100 个角色，正负面各 16000 字符，单文件最多 4 MiB。归档保留 ID；历史快照单图保存且不自动清理。','miao-muted'));
        }catch(error){root.replaceChildren(status);status.textContent=error.message;action(root,'重试加载',()=>paint(true));}
    }
    root.addEventListener('miao-bindings-changed',()=>{void paint(true);});void paint();return root;
}
