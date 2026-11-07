import {randomId} from '../platform/browser-crypto.js';
// Read-only discovery for migrating legacy prompt settings; never updates a worldbook.
export const WORLD_NAME='[喵喵]文生图 2.2.2';
const regexFamily=name=>/^喵喵文生图[1-4]-/.test(name||'')?name.replace(/-\d{4}$/,''):null;
export function mergeRegexRules(existing,incoming,makeId=randomId){
    const list=Array.isArray(incoming)?incoming:[incoming];
    for(const rule of list)if(!rule||typeof rule.findRegex!=='string'||!rule.findRegex||typeof rule.replaceString!=='string')throw Error('不是有效的酒馆正则文件');
    let merged=structuredClone(existing);
    for(const rule of list){
        const family=regexFamily(rule.scriptName);
        const matches=merged.map((item,index)=>({item,index})).filter(({item})=>rule.id&&item.id===rule.id||rule.scriptName&&item.scriptName===rule.scriptName||family&&regexFamily(item.scriptName)===family);
        const replacement={...structuredClone(rule),id:matches[0]?.item.id||rule.id||makeId()};
        if(!matches.length){merged.push(replacement);continue;}
        const first=matches[0].index,duplicates=new Set(matches.slice(1).map(({index})=>index));
        merged=merged.map((item,index)=>index===first?replacement:item).filter((_,index)=>!duplicates.has(index));
    }
    return merged;
}
export function bundledWorldTargets(names,preferred,newName=WORLD_NAME){
    const version=name=>{const match=name.match(/^\[喵喵\]文生图\s*2\.(\d+)(?:\.(\d+))?$/);return match?[Number(match[1]),Number(match[2]||0)]:null;};
    const latest=version(newName);
    const existing=names.filter(name=>{const current=version(name);return current&&latest&&(current[0]<latest[0]||current[0]===latest[0]&&current[1]<=latest[1]);});
    const primary=existing.includes(preferred)?preferred:existing.find(name=>/2\.0$/.test(name))||existing[0]||newName;
    return [primary,...existing.filter(name=>name!==primary)];
}
