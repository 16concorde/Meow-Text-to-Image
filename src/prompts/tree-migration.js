import {revision4Nodes} from './tree-history.js';
import {promptTree,treeById} from './tree-defaults.js';
import {defaultNsfwKeywords,legacyNsfwKeywords} from './nsfw-trigger.js';
const oldById=Object.fromEntries(revision4Nodes.map(n=>[n.nodeId,n]));
const oldDefault=(id,slot,text)=>oldById[id]?.slots[slot]===text;
export function upgradeRevision4(config){
    const next={...structuredClone(config),treeRevision:5,params:{count:config.params?.count??'2~3',eggMarker:config.params?.eggMarker??'/meow_FM'},flags:{fan:config.enabledById?.['task.fan']??true},injection:{depth:config.injection?.depth??0},capture:config.capture??{start:'image###',end:'###'},enabledById:{},textOverridesById:{}};
    const conflicts=[];for(const [key,value] of [['persona','ELLA'],['target','User']])if(config.params?.[key]!==undefined&&config.params[key]!==value)conflicts.push({id:'params.'+key,reason:'旧自定义参数无法映射，原配置保留'});
    const nsfwBody=config.textOverridesById?.nsfw?.body,rulesBody=config.textOverridesById?.['nsfw.rules']?.body;
    if(nsfwBody!==undefined&&rulesBody!==undefined&&nsfwBody!==rulesBody)conflicts.push({id:'nsfw',reason:'两份 NSFW 自定义正文冲突，原配置保留'});
    for(const n of promptTree)if(n.toggleable)next.enabledById[n.nodeId]=config.enabledById?.[n.nodeId]??n.defaultEnabled;
    next.enabledById.nsfw=(config.enabledById?.nsfw??false)&&(config.enabledById?.['nsfw.rules']??true);
    for(const [id,slots] of Object.entries(config.textOverridesById||{}))for(const [slot,text] of Object.entries(slots)){
        if(oldDefault(id,slot,text))continue;
        const target=id==='nsfw.rules'?'nsfw':id;
        if(target==='task'||!treeById[target]||!Object.hasOwn(treeById[target].slots,slot))conflicts.push({id,slot,reason:'旧正文不能自动映射，原配置保留'});
        else next.textOverridesById[target]={...next.textOverridesById[target],[slot]:text};
    }
    for(const [id,value] of Object.entries(config.enabledById||{}))if(!oldById[id]||typeof value!=='boolean')throw Error('旧提示词开关无效，原配置已保留');
    if(nsfwBody!==undefined&&rulesBody!==undefined&&nsfwBody!==rulesBody)delete next.textOverridesById.nsfw;
    const upgradedKeywords=JSON.stringify(config.nsfwTrigger?.keywords)===JSON.stringify(legacyNsfwKeywords);
    if(upgradedKeywords)next.nsfwTrigger={keywords:[...defaultNsfwKeywords],defaultsVersion:1};
    if(conflicts.length){const error=Error('提示词升级冲突：'+conflicts.map(c=>[c.id,c.slot,c.reason].filter(Boolean).join(' / ')).join('；'));error.status='migration-conflict';throw error;}
    return next;
}
