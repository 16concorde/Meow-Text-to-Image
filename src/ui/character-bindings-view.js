import {createBindingDraftStore} from '../platform/character-binding-drafts.js';
import {copiedBindingArchive,mergedBindingArchive} from '../profiles/character-bindings-migration.js';
import {bindingNode as n,bindingAction as action,bindingDownload,bindingField as field} from './character-binding-controls.js';
import {createBindingSelector} from './character-binding-selector.js';
import {createBindingOwnerEditor} from './character-binding-editor.js';
import {createBindingChatView} from './character-binding-chat-view.js';
const viewMemory=new WeakMap();
export function createCharacterBindingsView({session,settings,onError}){
    const management=session.management,chatSettings=session.chatSettings,root=n('section',undefined,'miao-character-bindings');
    if(!management||!chatSettings){root.append(n('p','管理服务不可用，请重新加载扩展'));root.dispose=()=>{};return root;}
    const viewScope=management.host.scope(),previousMemory=viewMemory.get(management);
    const memory=previousMemory?.scope===viewScope?previousMemory:{scope:viewScope,drafts:new Map()};viewMemory.set(management,memory);
    const draftStore=createBindingDraftStore({scope:management.host.scope,enabled:()=>management.host.scope()===viewScope&&management.host.canPersistDrafts()});let draftTimer;
    const persistDrafts=()=>management.host.scope()!==viewScope?Promise.resolve():draftStore.save(memory.drafts).catch(error=>{const status=root.querySelector('[data-management-status]');if(status)status.textContent=error.message;});
    let route={page:'home'},stack=[],page=null,disposed=false,epoch=0,confirmation=null,previousBack,backHook,observer,parentDialog;
    const routeKey=r=>r.page==='owner'?JSON.stringify(['owner',r.target.type,r.target.locator]):r.page==='chat'?chatSettings.key({...r.chatRef,cardOwnerId:undefined}):null;
    function draftFor(r){const key=routeKey(r);if(!key)return {};if(!memory.drafts.has(key)){if(memory.drafts.size>=8){const clean=[...memory.drafts].find(([,d])=>!d.dirty);if(!clean)throw Error('已有 8 份未保存草稿，请先保存或放弃后再打开对象');memory.drafts.delete(clean[0]);}memory.drafts.set(key,{defaults:{},values:{}});}return memory.drafts.get(key);}
    const fail=error=>{const status=root.querySelector('[data-management-status]');if(status)status.textContent=error.message;onError(error);};
    function choose(message,options){if(confirmation)return Promise.resolve('cancel');const layer=n('section',undefined,'miao-binding-confirm');layer.setAttribute('role','dialog');layer.setAttribute('aria-label','未保存资料');layer.append(n('p',message));root.append(layer);return new Promise(resolve=>{confirmation=value=>{layer.remove();confirmation=null;resolve(value);};for(const [value,label] of options)action(layer,label,()=>confirmation(value),fail);layer.querySelector('button')?.focus();});}
    async function guardLeave(){await persistDrafts();await draftStore.settled();if(confirmation){confirmation('cancel');return false;}const draft=memory.drafts.get(routeKey(route));if(!draft?.dirty)return true;const choice=await choose('有未保存的资料；离开前如何处理？',[['save','保存'],['discard','放弃'],['cancel','继续编辑']]);if(choice==='save'){try{await page.save();await persistDrafts();await draftStore.settled();return !draft.dirty;}catch(error){fail(error);return false;}}if(choice==='discard'){memory.drafts.delete(routeKey(route));await persistDrafts();await draftStore.settled();return true;}return false;}
    function go(next,{replace=false}={}){if(disposed)return;void persistDrafts();if(!replace)stack.push({...route});route=next;paint();}
    function back(){if(confirmation){confirmation('cancel');return true;}if(!stack.length)return false;void persistDrafts();route=stack.pop();paint();return true;}
    async function dataPage(target){const token=epoch;const status=n('p','正在读取身份索引…');root.append(status);try{
        const records=await management.records();if(disposed||token!==epoch)return;status.textContent='完整 data 迁移需要卡、用户设定、user/files 和聊天一起迁移。资料包仅含角色档案与映射，不含快照、聊天覆盖或凭证；旧版只读取迁移前资料。';
        if(target){
            const legacy=await management.legacyStatus(target);if(disposed||token!==epoch)return;if(legacy?.changed){root.append(n('p',`检测到旧版 v1 变更：${legacy.old.archive.bindings.length} 条；当前 v2 不会被静默覆盖。`));action(root,'导出旧版资料比较',()=>bindingDownload(legacy.old.archive,'meow-legacy-comparison.json'),fail);action(root,'确认保留 v2 并记录已查阅旧版变更',async()=>{await management.resolveLegacy(target);paint();},fail);action(root,'确认合并旧版变更到 v2',async()=>{if(await choose('将按 UUID 和短 ID 合并旧版资料，角色正负面和默认值可能更新；冲突会停止。',[['merge','确认合并'],['cancel','取消']])==='merge'){await management.resolveLegacy(target,{merge:true});paint();}},fail);}
            if(target.type==='card'){action(root,'恢复卡内身份对应资料',async()=>{await management.embedded(target);go({page:'owner',target},{replace:true});},fail);action(root,'将卡内资料作为独立副本恢复',async()=>{await management.embedded(target,{independent:true});go({page:'owner',target},{replace:true});},fail);}action(root,'查证最近保存／导出恢复候选',async()=>{const recovery=await management.recovery(target);if(!recovery)throw Error('没有可发现的恢复记录');status.textContent=recovery.current?.hash===recovery.operation.hash?'最近保存已获读回确认':'恢复候选仍保留；正式资料可能不同，请比较后再保存';bindingDownload(recovery.archive,'meow-binding-recovery.json');},fail);action(root,'为此对象建立独立档案',async()=>{if(await choose('将为此对象分配新的所属身份；原资料保留为可恢复档案，不会删除旧快照。',[['new','确认建立独立档案'],['cancel','取消']])!=='new')return;await management.independent(target);go({page:'owner',target},{replace:true});},fail);
            const repair=n('section',undefined,'miao-binding-repair-list'),query=n('input'),rows=n('div');query.type='search';query.placeholder='搜索资料定位或所属 ID';query.setAttribute('aria-label','搜索待关联资料');query.value=route.repairQuery||'';repair.append(query,rows);root.append(repair);
            function paintRepair(){route.repairQuery=query.value;const matches=records.filter(r=>r.type===target.type&&(r.locator+' '+r.ownerId).normalize('NFKC').toLowerCase().includes(query.value.normalize('NFKC').trim().toLowerCase()));route.repairCursor=Math.min(route.repairCursor||0,Math.max(0,Math.ceil(matches.length/40)-1));rows.replaceChildren();for(const record of matches.slice(route.repairCursor*40,(route.repairCursor+1)*40)){const row=n('div');row.append(n('p',record.locator+' · '+(record.state==='missing'?'失联／已删除':record.state==='pending'?'身份待确认':'已登记')));action(row,'关联原资料：'+record.locator,async()=>{await management.repair(target,record.ownerId);go({page:'owner',target},{replace:true});},fail);action(row,'独立复制资料：'+record.locator,async()=>{await management.copyFrom(target,record.ownerId);go({page:'owner',target},{replace:true});},fail);rows.append(row);}action(rows,'关联资料上一页',()=>{route.repairCursor--;paintRepair();},fail).disabled=!route.repairCursor;action(rows,'关联资料下一页',()=>{route.repairCursor++;paintRepair();},fail).disabled=(route.repairCursor+1)*40>=matches.length;}
            query.oninput=()=>{route.repairCursor=0;paintRepair();};paintRepair();
        }
        action(root,'导出 Meow 资料包',async()=>{const value=await management.exportPackage();if(new TextEncoder().encode(JSON.stringify(value)).length>16*1024*1024)throw Error('资料包超过 16 MiB，请按对象分别导出');bindingDownload(value,'meow-binding-package-v2.json');},fail);
        if(memory.package){
            const preview=memory.package,area=n('section',undefined,'miao-binding-package-preview');root.append(area);area.append(n('p',`校验通过：${preview.length} 个档案；默认不覆盖冲突，每次选择一个目标确认导入。`));
            const selected=preview[route.importIndex];
            if(selected&&target){
                area.append(n('p',`来源：${selected.locator} → 目标：${target.name}／${target.locator}`));
                action(area,'确认独立复制到此对象',async()=>{const entry=await management.open(target,{create:true});const archive=copiedBindingArchive(entry.archive,selected.archive);await management.save(entry,archive);status.textContent='独立复制已保存，原身份未修改';},fail);
                const existing=records.find(r=>r.type===target.type&&r.locator===target.locator&&r.ownerId===selected.ownerId);
                if(existing)action(area,'确认合并恢复同一身份',async()=>{const entry=await management.open(target,{fresh:true});await management.save(entry,mergedBindingArchive(entry.archive,selected.archive));status.textContent='原身份资料已合并恢复';},fail);
            }
            const cursor=route.packageCursor||0;for(let i=cursor*40;i<Math.min(preview.length,(cursor+1)*40);i++){const item=preview[i];const row=n('div',undefined,'miao-binding-package-row');row.append(n('p',`${item.locator}：${item.conflict?'已有身份，默认跳过':'新增资料'}，${item.archive.bindings.length} 条`));action(row,'选择导入目标：'+item.locator,()=>go({page:'select',type:item.type,importFor:{page:'data',importIndex:i}}),fail);area.append(row);}
            action(area,'资料包上一页',()=>{route.packageCursor=cursor-1;paint();},fail).disabled=cursor===0;action(area,'资料包下一页',()=>{route.packageCursor=cursor+1;paint();},fail).disabled=(cursor+1)*40>=preview.length;
            action(area,'关闭资料包预览',()=>{memory.package=null;paint();},fail);
        }
        const input=field(root,'导入 Meow 资料包','');input.type='file';input.accept='.json';input.onchange=async()=>{try{const file=input.files[0];if(!file)return;if(file.size>16*1024*1024)throw Error('资料包超过 16 MiB');const preview=await management.previewPackage(JSON.parse(await file.text()));if(disposed||token!==epoch)return;memory.package=preview;route.packageCursor=0;paint();}catch(error){fail(error);}finally{input.value='';}};
    }catch(error){status.textContent=error.message;action(root,'重试',()=>{paint();},fail);}}
    function paint(){
        const token=++epoch;page?.dispose();page=null;root.replaceChildren();const toolbar=n('div',undefined,'miao-actions'),status=n('p','','miao-muted');status.dataset.managementStatus='true';root.append(toolbar,status);
        if(stack.length)action(toolbar,'返回上一级',back,fail);
        try{
            const draft=draftFor(route);
            if(route.page==='home'){
                root.append(n('p',draftStore.available()?'未保存草稿可在本机恢复 7 天；跨设备请保存到宿主文件。':'当前环境草稿仅保留在内存，关页前请保存角色资料。'));
                root.append(n('h3','角色绑定'),n('p','（功能制作与测试中，先别使用）资料由角色卡／用户设定共享，聊天只覆盖启停。'));
                if(hostGroup())root.append(n('p','群聊暂不支持绑定生成；仍可管理单个角色卡与用户设定。'));
                action(root,'用户设定管理',()=>go({page:'select',type:'user'}),fail);action(root,'角色管理',()=>go({page:'select',type:'card'}),fail);action(root,'聊天管理',()=>go({page:'chat-home'}),fail);action(root,'数据管理／资料包',()=>go({page:'data'}),fail);
                root.append(n('p',settings.promptConfig?.mode==='external'?'外部世界书模式：可管理资料，内置绑定指令不注入。':'管理其他对象不会改变当前聊天的绑定名单。'));
            }else if(route.page==='select')page=createBindingSelector({management,type:route.type,route,onError:fail,onSelect:target=>{
                if(route.importFor)go({...route.importFor,target});else if(route.forChat)go({page:'chats',target});else if(route.previewFor)go({...route.previewFor,page:'chat',previewPersona:target.locator});else go({page:'owner',target});
            }});
            else if(route.page==='owner')page=createBindingOwnerEditor({management,route,draft,onError:fail,onChat:target=>go({page:'chats',target}),onState:async(state,options)=>{
                if(state==='refresh'){const value=await choose('刷新只重新读取资料，不更改编号。如何处理草稿？',[['keep','保留草稿并刷新'],['discard','放弃后刷新'],['cancel','取消']]);if(value==='keep')await options.preserve();if(value==='discard')await options.discard();}
                else go({page:'data',target:route.target});
            }});
            else if(route.page==='chat-home'){
                const current=chatSettings.current();if(!current)root.append(n('p','请先在酒馆打开聊天'));
                action(root,'载入当前聊天',()=>{const now=chatSettings.current();if(!now)throw Error('请先在酒馆打开聊天');go({page:'chat',chatRef:now});},fail).disabled=!current;
                action(root,'选择角色卡的聊天',()=>go({page:'select',type:'card',forChat:true}),fail);
            }else if(['chats','chat'].includes(route.page))page=createBindingChatView({management,chatSettings,route,draft,onError:fail,onSelectChat:chatRef=>go({page:'chat',chatRef}),onOwner:target=>target?go({page:'owner',target}):go({page:'select',type:'user',previewFor:{...route}})});
            else if(route.page==='data')void dataPage(route.target);
            if(page)root.append(page.element);
        }catch(error){fail(error);}root.closest('.miao-panel-body')?.scrollTo({top:0});
        if(token!==epoch)return;
    }
    const hostGroup=()=>!!management.host.context().groupId;
    const keydown=e=>{if(e.key==='Enter'&&e.target.matches('input,textarea,select')){e.stopPropagation();return;}if(e.key!=='Escape')return;if(back()){e.preventDefault();e.stopImmediatePropagation();}};
    root.back=back;root.guardLeave=guardLeave;root.diagnostics=()=>({history:stack.length,drafts:memory.drafts.size,listeners:management.listenerCount(),cache:management.cache.stats()});
    root.dispose=()=>{if(disposed)return;void persistDrafts();clearTimeout(draftTimer);disposed=true;epoch++;page?.dispose();memory.package=null;unsubscribe();root.removeEventListener('input',scheduleDraft);root.removeEventListener('change',scheduleDraft);root.removeEventListener('click',scheduleDraft);document.removeEventListener('visibilitychange',onVisibility);observer?.disconnect();parentDialog?.removeEventListener('close',root.dispose);root.removeEventListener('keydown',keydown,true);if(backHook&&window.__TAURITAVERN_HANDLE_BACK__===backHook)window.__TAURITAVERN_HANDLE_BACK__=previousBack;if(confirmation)confirmation('cancel');};
    const unsubscribe=management.subscribe(change=>{
        if(disposed||['saved','initialized','identity'].includes(change.kind))return;
        const status=root.querySelector('[data-management-status]');if(status)status.textContent='宿主资料已变化，可刷新列表或当前对象；未保存草稿保留。';
        if(['CHAT_RENAMED','CHARACTER_RENAMED'].includes(change.name)){
            let changed=false;
            for(const r of [route,...stack]){
                const oldKey=routeKey(r);let updated=false;
                if(change.name==='CHAT_RENAMED'&&r.chatRef?.target.locator===change.locator&&r.chatRef.fileName===change.oldChatFile){r.chatRef={...r.chatRef,fileName:change.chatFile};updated=true;}
                if(change.name==='CHARACTER_RENAMED'){
                    if(r.chatRef?.target.locator===change.oldLocator){r.chatRef={...r.chatRef,target:{...r.chatRef.target,locator:change.locator}};updated=true;}
                    if(r.target?.type==='card'&&r.target.locator===change.oldLocator){r.target={...r.target,locator:change.locator};updated=true;}
                }
                const newKey=routeKey(r);if(updated&&oldKey!==newKey&&memory.drafts.has(oldKey)){memory.drafts.set(newKey,memory.drafts.get(oldKey));memory.drafts.delete(oldKey);}
                if(r===route&&updated)changed=true;
            }
            if(changed)paint();
        }
        if(change.locator)for(const row of root.querySelectorAll('.miao-owner-row'))if(row.dataset.nativeLocator===change.locator){const target={type:change.type,locator:change.locator};const img=row.querySelector('img');if(img)img.src=management.host.thumbnail(target);}
    });
    const scheduleDraft=()=>{clearTimeout(draftTimer);draftTimer=setTimeout(()=>{void persistDrafts();},300);};
    const onVisibility=()=>{if(document.visibilityState==='hidden')void persistDrafts();};
    for(const event of ['input','change','click'])root.addEventListener(event,scheduleDraft);document.addEventListener('visibilitychange',onVisibility);
    void draftStore.load().then(entries=>{if(disposed)return;let restored=false;for(const [key,value] of entries){const existing=memory.drafts.get(key);if(existing&&!existing.dirty){Object.assign(existing,value);if(routeKey(route)===key)restored=true;}else if(!existing&&memory.drafts.size<8)memory.drafts.set(key,value);}if(restored)paint();}).catch(error=>{const status=root.querySelector('[data-management-status]');if(status)status.textContent=error.message;});
    root.addEventListener('keydown',keydown,true);
    setTimeout(()=>{if(disposed||!root.isConnected)return;previousBack=window.__TAURITAVERN_HANDLE_BACK__;backHook=()=>{if(back())return true;const previous=previousBack;root.dispose();return previous?.()||false;};window.__TAURITAVERN_HANDLE_BACK__=backHook;parentDialog=root.closest('dialog');parentDialog?.addEventListener('close',root.dispose,{once:true});observer=new MutationObserver(()=>{if(!root.isConnected)root.dispose();});observer.observe(document.body,{childList:true,subtree:true});},0);
    paint();return root;
}
