import {searchOwners} from '../profiles/character-bindings-index.js';
import {bindingNode as n,bindingAction as action,bindingAvatar} from './character-binding-controls.js';
export function createBindingSelector({management,type,route,onSelect,onError}){
    const root=n('section',undefined,'miao-owner-selector'),search=n('input'),results=n('div',undefined,'miao-owner-results'),status=n('p','正在加载…','miao-muted'),toolbar=n('div',undefined,'miao-actions');
    search.type='search';search.placeholder='搜索名称或用户备注';search.setAttribute('aria-label','搜索所属对象');search.value=route.query||'';
    root.append(search,toolbar,status,results);let objects=[],timer,epoch=0,disposed=false,composing=false;
    function paint(){if(disposed)return;route.query=search.value;const matches=searchOwners(objects,search.value);route.cursor=Math.min(route.cursor||0,Math.max(0,Math.ceil(matches.length/40)-1));results.replaceChildren();status.textContent=!objects.length?'没有任何对象':!matches.length?'搜索没有结果':`找到 ${matches.length} 个对象`;
        const page=matches.slice(route.cursor*40,(route.cursor+1)*40);for(const owner of page){const row=n('button',undefined,'miao-owner-row');row.type='button';row.dataset.nativeLocator=owner.locator;const copy=n('span',undefined,'miao-owner-copy');copy.append(n('strong',owner.name));if(owner.source==='avatar-only')copy.append(n('small','头像模式，尚未命名用户设定'));if(owner.title)copy.append(n('span',owner.title,'miao-owner-note'));if(owner.description&&type==='user')copy.append(n('small',owner.description,'miao-owner-description'));copy.append(n('small',owner.locator,'miao-owner-locator'));row.append(bindingAvatar(management.host,owner),copy);row.onclick=()=>{route.scroll=results.scrollTop;onSelect(owner);};results.append(row);}
        const pages=n('div',undefined,'miao-actions');action(pages,'上一页',()=>{route.cursor--;paint();},onError).disabled=route.cursor===0;pages.append(n('span',`${route.cursor+1} / ${Math.max(1,Math.ceil(matches.length/40))}`));action(pages,'下一页',()=>{route.cursor++;paint();},onError).disabled=(route.cursor+1)*40>=matches.length;results.append(pages);results.scrollTop=route.scroll||0;
    }
    async function load(){const token=++epoch;status.textContent='正在加载…';try{const listed=await management.list(type);if(disposed||token!==epoch)return;objects=listed;paint();}catch(error){if(!disposed&&token===epoch){status.textContent='加载失败：'+error.message;results.replaceChildren();action(results,'重试加载',load,onError);}}}
    function schedule(){clearTimeout(timer);if(composing)return;route.cursor=0;timer=setTimeout(paint,150);}
    search.oninput=schedule;search.oncompositionstart=()=>{composing=true;clearTimeout(timer);};search.oncompositionend=()=>{composing=false;schedule();};
    results.onkeydown=e=>{if(!['ArrowDown','ArrowUp'].includes(e.key))return;const rows=[...results.querySelectorAll('.miao-owner-row')],at=rows.indexOf(document.activeElement);e.preventDefault();rows[Math.max(0,Math.min(rows.length-1,at+(e.key==='ArrowDown'?1:-1)))]?.focus();};
    action(toolbar,'清空搜索',()=>{search.value='';route.cursor=0;paint();search.focus();},onError);action(toolbar,'刷新列表',load,onError);
    void load();return {element:root,dispose(){disposed=true;epoch++;clearTimeout(timer);}};
}
