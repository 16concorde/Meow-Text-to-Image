import {createBindingDraftStore} from '../platform/character-binding-drafts.js';
import {bindingNode as n,bindingAction as action} from './character-binding-controls.js';
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
    function paint(){
        const token=++epoch;page?.dispose();page=null;root.replaceChildren();const toolbar=n('div',undefined,'miao-actions'),status=n('p','','miao-muted');status.dataset.managementStatus='true';root.append(toolbar,status);
        if(stack.length)action(toolbar,'返回上一级',back,fail);
        try{
            const draft=draftFor(route);
            if(route.page==='home'){
                root.append(n('p',draftStore.available()?'未保存草稿可在本机恢复 7 天；跨设备请保存到宿主文件。':'当前环境草稿仅保留在内存，关页前请保存角色资料。'));
                root.append(n('h3','角色绑定'),n('p','（功能制作与测试中，先别使用）资料由角色卡／用户设定共享，聊天只覆盖启停。'));
                if(hostGroup())root.append(n('p','群聊暂不支持绑定生成；仍可管理单个角色卡与用户设定。'));
                action(root,'用户设定管理',()=>go({page:'select',type:'user'}),fail);action(root,'角色管理',()=>go({page:'select',type:'card'}),fail);action(root,'聊天管理',()=>go({page:'chat-home'}),fail);
                root.append(n('p',settings.promptConfig?.mode==='external'?'外部世界书模式：可管理资料，内置绑定指令不注入。':'管理其他对象不会改变当前聊天的绑定名单。'));
            }else if(route.page==='select')page=createBindingSelector({management,type:route.type,route,onError:fail,onSelect:target=>{
                if(route.forChat)go({page:'chats',target});else if(route.previewFor)go({...route.previewFor,page:'chat',previewPersona:target.locator});else go({page:'owner',target});
            }});
            else if(route.page==='owner')page=createBindingOwnerEditor({management,route,draft,onError:fail,onChat:target=>go({page:'chats',target}),onState:async(state,options)=>{
                if(state==='refresh'){const value=await choose('刷新只重新读取资料，不更改编号。如何处理草稿？',[['keep','保留草稿并刷新'],['discard','放弃后刷新'],['cancel','取消']]);if(value==='keep')await options.preserve();if(value==='discard')await options.discard();}

            }});
            else if(route.page==='chat-home'){
                const current=chatSettings.current();if(!current)root.append(n('p','请先在酒馆打开聊天'));
                action(root,'载入当前聊天',()=>{const now=chatSettings.current();if(!now)throw Error('请先在酒馆打开聊天');go({page:'chat',chatRef:now});},fail).disabled=!current;
                action(root,'选择角色卡的聊天',()=>go({page:'select',type:'card',forChat:true}),fail);
            }else if(['chats','chat'].includes(route.page))page=createBindingChatView({management,chatSettings,route,draft,onError:fail,onSelectChat:chatRef=>go({page:'chat',chatRef}),onOwner:target=>target?go({page:'owner',target}):go({page:'select',type:'user',previewFor:{...route}})});

            if(page)root.append(page.element);
        }catch(error){fail(error);}root.closest('.miao-panel-body')?.scrollTo({top:0});
        if(token!==epoch)return;
    }
    const hostGroup=()=>!!management.host.context().groupId;
    const keydown=e=>{if(e.key==='Enter'&&e.target.matches('input,textarea,select')){e.stopPropagation();return;}if(e.key!=='Escape')return;if(back()){e.preventDefault();e.stopImmediatePropagation();}};
    root.back=back;root.guardLeave=guardLeave;root.diagnostics=()=>({history:stack.length,drafts:memory.drafts.size,listeners:management.listenerCount(),cache:management.cache.stats()});
    root.dispose=()=>{if(disposed)return;void persistDrafts();clearTimeout(draftTimer);disposed=true;epoch++;page?.dispose();unsubscribe();root.removeEventListener('input',scheduleDraft);root.removeEventListener('change',scheduleDraft);root.removeEventListener('click',scheduleDraft);document.removeEventListener('visibilitychange',onVisibility);observer?.disconnect();parentDialog?.removeEventListener('close',root.dispose);root.removeEventListener('keydown',keydown,true);if(backHook&&window.__TAURITAVERN_HANDLE_BACK__===backHook)window.__TAURITAVERN_HANDLE_BACK__=previousBack;if(confirmation)confirmation('cancel');};
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
