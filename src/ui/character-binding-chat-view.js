import {bindingSwitchKey} from '../profiles/character-bindings.js';
import {bindingNode as n,bindingAction as action,bindingSwitch} from './character-binding-controls.js';
export function createBindingChatView({chatSettings,management,route,draft,onOwner,onSelectChat,onError}){
    const root=n('section',undefined,'miao-binding-chat'),status=n('p','正在加载…','miao-muted');root.append(status);let disposed=false,state;
    const fail=error=>{status.textContent=error.message;onError(error);};
    async function load(){try{
        if(route.page==='chats'){
            const list=await chatSettings.list(route.target);if(disposed)return;root.replaceChildren(n('h3',route.target.name+'／选择聊天'));const input=n('input'),rows=n('div');input.type='search';input.placeholder='搜索聊天名称';input.setAttribute('aria-label','搜索聊天名称');input.value=route.query||'';root.append(input,status,rows);
            function paint(){route.query=input.value;const matches=list.filter(c=>c.name.normalize('NFKC').toLowerCase().includes(input.value.normalize('NFKC').trim().toLowerCase()));route.cursor=Math.min(route.cursor||0,Math.max(0,Math.ceil(matches.length/40)-1));rows.replaceChildren();status.textContent=list.length?matches.length?`共 ${matches.length} 个聊天`:'搜索没有结果':'没有任何聊天';for(const chat of matches.slice(route.cursor*40,(route.cursor+1)*40)){const row=action(rows,chat.name+(chatSettings.isCurrent(chat)?'（酒馆当前打开）':''),()=>onSelectChat(chat),fail);row.classList.add('miao-chat-row');}action(rows,'上一页',()=>{route.cursor--;paint();},fail).disabled=!route.cursor;action(rows,'下一页',()=>{route.cursor++;paint();},fail).disabled=(route.cursor+1)*40>=matches.length;}
            input.oninput=()=>{route.cursor=0;paint();};paint();return;
        }
        state=await chatSettings.read(route.chatRef,{previewPersona:route.previewPersona});if(disposed)return;route.chatRef=state.ref;paint();
    }catch(error){if(!disposed){root.replaceChildren(status);fail(error);action(root,'重试读取聊天',load,fail);}}}
    function paint(){
        root.replaceChildren(status);status.textContent=`正在管理：${route.chatRef.target.name}／${route.chatRef.fileName}；${chatSettings.isCurrent(route.chatRef)?'酒馆当前打开此聊天':'酒馆当前打开其他聊天'}`;
        root.append(n('p','本页只保存启停覆盖；固定正负面请进入对应对象资料。'));
        if(state.collision)root.append(n('p','此聊天复制了其他聊天的 UUID；保存时会分配独立聊天身份，保留原覆盖。'));
        const values=draft.values??={};
        for(const entry of state.entries){const group=n('section',undefined,'miao-section');group.append(n('h3',entry.target.name+(entry.target.type==='card'?'／角色卡':'／用户设定')));root.append(group);
            action(group,entry.target.type==='card'?'编辑此卡角色资料':'编辑此用户设定',()=>onOwner(entry.target),fail);
            for(const row of chatSettings.rows(state).filter(b=>b.owner.type===entry.archive.owner.type)){
                const key=bindingSwitchKey(row.owner,row),value=values[key],effective=typeof value==='boolean'?value:value==='inherit'?row.defaultEnabled:row.enabled,source=n('span',value==='inherit'||value===undefined&&row.source==='global'?`继承默认：${effective?'开':'关'}`:`本聊天：${effective?'开':'关'}`,'miao-muted'),line=n('div',undefined,'miao-binding-row');line.append(n('strong',row.shortId+' · '+row.name),source);
                const toggle=bindingSwitch(line,'聊天启用'+row.shortId,effective,on=>{values[key]=on;draft.dirty=true;source.textContent='本聊天：'+(on?'开':'关')+'（待保存）';});action(line,'恢复继承 '+row.shortId,()=>{values[key]='inherit';draft.dirty=true;toggle.checked=row.defaultEnabled;source.textContent='继承默认：'+(row.defaultEnabled?'开':'关')+'（待保存）';},fail);group.append(line);
            }
        }
        if(!state.persona){root.append(n('p','尚未确定用户设定；可选择仅用于管理／预览，不会改变酒馆的 persona。'));action(root,'选择预览用户设定',()=>onOwner(null),fail);}
        action(root,'全部恢复继承',()=>{for(const row of chatSettings.rows(state))values[bindingSwitchKey(row.owner,row)]='inherit';draft.dirty=true;paint();},fail);
        const directed=management.host.capabilities().directedMetadata;
        action(root,chatSettings.isCurrent(route.chatRef)||directed?'保存至此聊天':'打开此聊天并保存开关',save,fail);
        for(const entry of state.entries)action(root,'将此列表设为'+entry.target.name+'的默认',async()=>{
            if(!globalThis.confirm(`将更新「${entry.target.name}」的默认开关；现有聊天覆盖保留。`))return;
            let next=structuredClone(entry.archive);for(const b of next.bindings){const k=bindingSwitchKey(next.owner,b),v=values[k];const active=chatSettings.rows(state).find(row=>bindingSwitchKey(row.owner,row)===k);const enabled=typeof v==='boolean'?v:v==='inherit'?b.defaultEnabled:active?.enabled??b.defaultEnabled;if(enabled!==b.defaultEnabled){b.defaultEnabled=enabled;b.revision++;}}
            await management.save(entry,next);status.textContent='此对象默认开关已保存；其他范围未修改';
        },fail);
    }
    async function save(){if(!state)throw Error('聊天尚未加载');state=await chatSettings.save(state,draft.values||{});draft.values={};draft.dirty=false;paint();status.textContent='此聊天开关已保存并读回确认';}
    void load();return {element:root,save,dispose(){disposed=true;}};
}
