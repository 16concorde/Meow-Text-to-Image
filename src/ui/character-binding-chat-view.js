import {bindingSwitchKey} from '../profiles/character-bindings.js';
import {BINDING_PAGE_SIZE as SIZE,bindingNode as n,bindingAction as action,bindingIcon as icon,bindingSwitch,bindingViewport} from './character-binding-controls.js';
export function createBindingChatView({chatSettings,management,route,draft,onOwner,onSelectChat,onError,onState=()=>{}}){
    const root=n('section',undefined,'miao-binding-chat'),status=n('p','正在加载…','miao-muted'),feedback=n('div');status.setAttribute('aria-live','polite');root.append(status);let disposed=false,state,pending=null,timer,statusTimer,epoch=0;
    const scope=management.host.scope(),active=()=>!disposed&&management.host.scope()===scope;
    const dirty=()=>{draft.dirty=Object.keys(draft.values||{}).length>0||!!draft.globalOperation;onState();};
    function fail(error){if(!active())return;status.textContent=['unknown','unconfirmed'].includes(error.saveState)?'保存结果待确认，请先查证。':error.message;feedback.replaceChildren();action(feedback,'重试／查证保存',save,fail);
        if(error.latestState){const comparison=n('section',undefined,'miao-binding-conflict');comparison.append(n('h4','聊天开关冲突比较'));for(const row of chatSettings.rows(error.latestState)){const key=bindingSwitchKey(row.owner,row),intent=draft.values?.[key];if(intent!==undefined)comparison.append(n('p',row.shortId+' · '+row.name+'：当前版本'+(row.enabled?'开':'关')+'；本地意图'+(intent==='inherit'?'恢复全局':intent?'开':'关')));}
            action(comparison,'读取当前版本并保留开关意图',()=>{state=error.latestState;draft.chatBaseline={baseHash:state.baseHash,integrity:state.integrity,scope:state.scope};dirty();paint();},fail);
            action(comparison,'放弃本地开关并读取当前版本',()=>{state=error.latestState;draft.values={};draft.failed=false;draft.chatBaseline=null;dirty();paint();},fail);action(comparison,'继续编辑',()=>comparison.remove(),fail);feedback.append(comparison);
        }
        if(error.saveState==='conflict'&&draft.globalOperation){const op=draft.globalOperation;action(feedback,'读取对象当前版本并保留全局开关意图',async()=>{const latest=await management.open(op.entry.target,{fresh:true}),next=structuredClone(latest.archive);for(const binding of next.bindings){const base=op.entry.archive.bindings.find(b=>b.uuid===binding.uuid),desired=op.archive.bindings.find(b=>b.uuid===binding.uuid);if(base&&desired&&base.defaultEnabled!==desired.defaultEnabled&&binding.defaultEnabled!==desired.defaultEnabled){binding.defaultEnabled=desired.defaultEnabled;binding.revision++;}}op.entry=latest;op.archive=next;dirty();paint();},fail);}
        onError(error);onState();}
    async function load(){const token=++epoch;try{
        if(route.page==='chats'){
            const list=await chatSettings.list(route.target);if(!active()||token!==epoch)return;root.replaceChildren(n('h3',route.target.name+'／选择聊天'));const input=n('input'),toolbar=n('div',undefined,'miao-binding-search'),rows=bindingViewport('聊天列表'),pages=n('div',undefined,'miao-binding-pages');input.type='search';input.placeholder='搜索聊天名称';input.setAttribute('aria-label','搜索聊天名称');input.value=route.query||'';toolbar.append(input);icon(toolbar,'刷新列表','rotate-right',load,fail);root.append(toolbar,status,rows,pages);let composing=false;
            function paint(){if(!active())return;route.query=input.value;const matches=list.filter(c=>c.name.normalize('NFKC').toLowerCase().includes(input.value.normalize('NFKC').trim().toLowerCase()));route.cursor=Math.min(route.cursor||0,Math.max(0,Math.ceil(matches.length/SIZE)-1));rows.replaceChildren();pages.replaceChildren();status.textContent=list.length?matches.length?`共 ${matches.length} 个聊天`:'搜索没有结果':'没有任何聊天';for(const chat of matches.slice(route.cursor*SIZE,(route.cursor+1)*SIZE)){const row=action(rows,chat.name+(chatSettings.isCurrent(chat)?'（酒馆当前打开）':''),()=>{route.scroll=rows.scrollTop;route.focus=chat.fileName;onSelectChat(chat);},fail);row.classList.add('miao-chat-row');row.dataset.chatFile=chat.fileName;}action(pages,'上一页',()=>{route.cursor--;route.scroll=0;paint();},fail).disabled=!route.cursor;pages.append(n('span',`${route.cursor+1} / ${Math.max(1,Math.ceil(matches.length/SIZE))}`));action(pages,'下一页',()=>{route.cursor++;route.scroll=0;paint();},fail).disabled=(route.cursor+1)*SIZE>=matches.length;rows.scrollTop=route.scroll||0;if(route.focus){[...rows.children].find(row=>row.dataset.chatFile===route.focus)?.focus({preventScroll:true});route.focus=null;}}
            const schedule=()=>{clearTimeout(timer);if(composing)return;route.cursor=0;route.scroll=0;timer=setTimeout(paint,150);};input.oninput=schedule;input.oncompositionstart=()=>{composing=true;clearTimeout(timer);};input.oncompositionend=()=>{composing=false;schedule();};rows.onscroll=()=>{route.scroll=rows.scrollTop;};paint();return;
        }
        state=await chatSettings.read(route.chatRef,{previewPersona:route.previewPersona});if(!active()||token!==epoch)return;route.chatRef=state.ref;paint();
    }catch(error){if(active()&&token===epoch){status.textContent='加载失败：'+error.message;onError(error);action(feedback,'重试读取聊天',load,fail);if(!feedback.isConnected)root.append(feedback);}}}
    function lock(value){root.setAttribute('aria-busy',String(value));for(const el of root.querySelectorAll('button,input[type=checkbox]')){el.dataset.saveBlocked=String((!!draft.failed||!!draft.globalOperation)&&!feedback.contains(el));el.disabled=value||el.dataset.readonly==='true'||el.dataset.saveBlocked==='true';}onState();}
    async function flushPending(){if(pending)await pending;}
    function run(job){if(pending)return pending;lock(true);status.textContent='正在保存…';pending=(async()=>{try{await job();if(active()){paint();status.textContent='此聊天开关已保存并读回确认';clearTimeout(statusTimer);statusTimer=setTimeout(()=>{if(active()&&status.textContent==='此聊天开关已保存并读回确认')status.textContent=route.chatRef.fileName;},1500);}}finally{pending=null;if(active())lock(false);}})();onState();return pending;}
    async function save(){if(pending)await pending;if(!state)throw Error('聊天尚未加载');
        if(Object.keys(draft.values||{}).length)await run(async()=>{
            // Always fresh-read before a retry, and compare to the original namespace baseline.
            if(draft.failed){const fresh=await chatSettings.read(state.ref,{previewPersona:route.previewPersona});
                const same=Object.entries(draft.values).every(([key,value])=>value==='inherit'?!Object.hasOwn(fresh.settings.values,key):fresh.settings.values[key]===value);
                if(same){state=fresh;draft.values={};draft.failed=false;draft.chatBaseline=null;dirty();return;}
                if(fresh.baseHash!==(draft.chatBaseline?.baseHash??state.baseHash)||fresh.integrity!==(draft.chatBaseline?.integrity??state.integrity))throw Object.assign(Error('聊天元数据已改变，请继续编辑并比较，未覆盖远端开关'),{saveState:'conflict',latestState:fresh});state=fresh;
            }
            try{state=await chatSettings.save(state,draft.values,{allowOpen:false});draft.values={};draft.failed=false;draft.chatBaseline=null;dirty();}catch(error){draft.failed=true;dirty();if(error.saveState==='conflict'&&!error.latestState)try{error.latestState=await chatSettings.read(state.ref,{previewPersona:route.previewPersona});}catch{}throw error;}
        });
        if(draft.globalOperation)await applyGlobal(draft.globalOperation);
    }
    function change(values){if(pending||draft.failed)throw Error('请先处理未确认的保存');draft.chatBaseline??={baseHash:state.baseHash,integrity:state.integrity,scope:state.scope};draft.values={...draft.values,...values};dirty();return save();}
    async function applyGlobal(op){return run(async()=>{const result=await management.save(op.entry,op.archive);state.entries=state.entries.map(entry=>entry.target.type===result.target.type&&entry.target.locator===result.target.locator?result:entry);draft.globalOperation=null;dirty();});}
    function paint(){if(!active())return;const focused=root.contains(document.activeElement)?{label:document.activeElement.getAttribute('aria-label'),text:document.activeElement.textContent}:null;root.replaceChildren(status,feedback);feedback.replaceChildren();status.textContent=route.chatRef.fileName;const writable=chatSettings.writable(route.chatRef);
        if(!writable){root.append(n('p','打开此聊天后可修改开关','miao-muted'));action(root,'打开此聊天',async()=>{await chatSettings.openChat(route.chatRef);await load();},fail);}
        if(state.collision)root.append(n('p','此聊天复制了其他聊天的 UUID；保存时会分配独立聊天身份，保留原覆盖。','miao-muted'));
        const rows=chatSettings.rows(state);
        for(const entry of state.entries){const group=n('section',undefined,'miao-binding-chat-group'),heading=n('div',undefined,'miao-binding-group-heading'),list=bindingViewport(entry.target.name+'的聊天开关');heading.append(n('h3',entry.target.name));root.append(group);group.append(heading,list);list.scrollTop=route.chatScroll?.[entry.target.type]||0;list.onscroll=()=>{route.chatScroll??={};route.chatScroll[entry.target.type]=list.scrollTop;};
            action(heading,entry.target.type==='card'?'编辑此卡角色资料':'编辑此用户设定',()=>onOwner(entry.target),fail);
            for(const row of rows.filter(b=>b.owner.type===entry.archive.owner.type)){
                const key=bindingSwitchKey(row.owner,row),line=n('div',undefined,'miao-binding-row'),actions=n('div',undefined,'miao-binding-row-actions');line.append(n('strong',row.shortId+' · '+row.name),actions);
                const restore=action(actions,'恢复全局',()=>change({[key]:'inherit'}),fail);restore.setAttribute('aria-label','恢复全局 '+row.shortId+' '+row.name);
                const toggle=bindingSwitch(actions,'聊天启用'+row.shortId,row.enabled,on=>change({[key]:on}),fail);
                for(const control of [restore,toggle]){control.disabled=!writable||!!draft.failed;control.dataset.readonly=String(!writable||!!draft.failed);}list.append(line);
            }if(!list.children.length)list.append(n('p','尚无绑定角色','miao-muted'));list.scrollTop=route.chatScroll?.[entry.target.type]||0;
        }
        if(!state.persona){root.append(n('p','尚未确定用户设定；可选择仅用于管理／预览，不会改变酒馆的 persona。'));action(root,'选择预览用户设定',()=>onOwner(null),fail);}
        const footer=n('footer',undefined,'miao-binding-footer'),globals=n('div',undefined,'miao-binding-global-actions');root.append(footer);
        const restoreAll=action(footer,'全部恢复全局',()=>change(Object.fromEntries(rows.map(row=>[bindingSwitchKey(row.owner,row),'inherit']))),fail);restoreAll.disabled=!writable||!!draft.failed;restoreAll.dataset.readonly=String(!writable||!!draft.failed);footer.append(globals);
        for(const entry of state.entries){const button=action(globals,'将此开关设置至'+entry.target.name+'全局',async()=>{
            await flushPending();if(draft.failed||draft.globalOperation)throw Error('请先查证未确认的保存');if(!globalThis.confirm(`将更新「${entry.target.name}」的全局默认开关；保留各聊天覆盖。`))return;
            const latest=state.entries.find(e=>e.target.type===entry.target.type&&e.target.locator===entry.target.locator),next=structuredClone(latest.archive);for(const b of next.bindings){const row=chatSettings.rows(state).find(row=>bindingSwitchKey(row.owner,row)===bindingSwitchKey(next.owner,b));if(row&&row.enabled!==b.defaultEnabled){b.defaultEnabled=row.enabled;b.revision++;}}
            draft.globalOperation={entry:latest,archive:next};dirty();await applyGlobal(draft.globalOperation);
        },fail);button.disabled=!!draft.failed;button.dataset.readonly=String(!!draft.failed);}
        if(draft.failed||draft.globalOperation){status.textContent='有未确认的保存，请重试或查证';action(feedback,'重试／查证保存',save,fail);}if(focused)[...root.querySelectorAll('button,input')].find(el=>focused.label?el.getAttribute('aria-label')===focused.label:el.textContent===focused.text)?.focus({preventScroll:true});onState();
    }
    void load();return {element:root,save:async()=>{try{await save();}catch(error){fail(error);throw error;}},flushPending,canSave:()=>!!state&&!!draft.dirty,hasPending:()=>!!pending,hasFailure:()=>!!draft.failed||!!draft.globalOperation,dispose(){disposed=true;epoch++;clearTimeout(timer);clearTimeout(statusTimer);}};
}
