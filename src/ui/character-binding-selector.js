import {searchOwners} from '../profiles/character-bindings-index.js';
import {BINDING_PAGE_SIZE as SIZE,bindingNode as n,bindingAction as action,bindingIcon as icon,bindingAvatar,bindingViewport} from './character-binding-controls.js';
export function createBindingSelector({management,type,route,onSelect,onError}){
    const root=n('section',undefined,'miao-owner-selector'),search=n('input'),results=bindingViewport('对象列表','miao-owner-results'),status=n('p','正在加载…','miao-muted'),toolbar=n('div',undefined,'miao-binding-search'),pages=n('div',undefined,'miao-binding-pages');
    search.type='search';search.placeholder=type==='card'?'搜索角色卡名称':'搜索名称或用户备注';search.setAttribute('aria-label','搜索所属对象');search.value=route.query||'';
    toolbar.append(search);root.append(toolbar,status,results,pages);let objects=[],timer,epoch=0,disposed=false,composing=false,loaded=false,loading=false;
    status.setAttribute('aria-live','polite');
    function paint(){if(disposed)return;route.query=search.value;const matches=searchOwners(objects,search.value);route.cursor=Math.min(route.cursor||0,Math.max(0,Math.ceil(matches.length/SIZE)-1));results.replaceChildren();pages.replaceChildren();status.textContent=!objects.length?'没有任何对象':!matches.length?'搜索没有结果':`找到 ${matches.length} 个对象`;
        const page=matches.slice(route.cursor*SIZE,(route.cursor+1)*SIZE);for(const owner of page){const row=n('button',undefined,'miao-owner-row');row.type='button';row.dataset.nativeLocator=owner.locator;const copy=n('span',undefined,'miao-owner-copy'),title=n('span',undefined,'miao-owner-title');title.append(n('strong',owner.name));if(owner.title){const note=n('span',owner.title,'miao-owner-note');note.title=owner.title;title.append(note);}copy.append(title);if(owner.source==='avatar-only')copy.append(n('small','头像模式，尚未命名用户设定'));if(owner.description)copy.append(n('small',owner.description.replace(/\s+/g,' ').trim(),'miao-owner-description'));row.append(bindingAvatar(management.host,owner),copy);row.onclick=()=>{route.scroll=results.scrollTop;route.focus=owner.locator;onSelect(owner);};results.append(row);}
        action(pages,'上一页',()=>{route.cursor--;route.scroll=0;paint();},onError).disabled=route.cursor===0;pages.append(n('span',`${route.cursor+1} / ${Math.max(1,Math.ceil(matches.length/SIZE))}`));action(pages,'下一页',()=>{route.cursor++;route.scroll=0;paint();},onError).disabled=(route.cursor+1)*SIZE>=matches.length;results.scrollTop=route.scroll||0;
        if(route.focus){[...results.children].find(row=>row.dataset.nativeLocator===route.focus)?.focus({preventScroll:true});route.focus=null;}
    }
    async function load(){if(loading)return;loading=true;refresh.disabled=true;refresh.setAttribute('aria-busy','true');const token=++epoch;status.textContent='正在加载…';try{const listed=await management.list(type);if(disposed||token!==epoch)return;objects=listed;loaded=true;paint();}catch(error){if(!disposed&&token===epoch){status.textContent='加载失败：'+error.message;if(!loaded)results.replaceChildren();onError(error);}}finally{loading=false;refresh.disabled=false;refresh.removeAttribute('aria-busy');}}
    function schedule(){clearTimeout(timer);if(composing)return;route.cursor=0;route.scroll=0;timer=setTimeout(paint,150);}
    search.oninput=schedule;search.oncompositionstart=()=>{composing=true;clearTimeout(timer);};search.oncompositionend=()=>{composing=false;schedule();};
    results.onscroll=()=>{route.scroll=results.scrollTop;};
    results.onkeydown=e=>{if(!['ArrowDown','ArrowUp'].includes(e.key))return;const rows=[...results.querySelectorAll('.miao-owner-row')],at=rows.indexOf(document.activeElement);e.preventDefault();rows[Math.max(0,Math.min(rows.length-1,at+(e.key==='ArrowDown'?1:-1)))]?.focus();};
    const refresh=icon(toolbar,'刷新列表','rotate-right',load,onError);
    void load();return {element:root,dispose(){disposed=true;epoch++;clearTimeout(timer);}};
}
