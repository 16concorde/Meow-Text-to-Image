import {promptTemplates} from './prompt-templates.js';
import {parseHeaderMacros,worldMacros,patchWorldMacros} from '../resources/world-macros.js';
export const fixedNames=['人格','cot_xml','张数','对象','彩蛋标签'];
export const moduleNames=['selfCheck','easterEgg','subtitle','easterEggDescription','nsfw'];
export function defaultPromptSettings(mode='builtin'){
    return {version:1,mode,fixed:Object.fromEntries(parseHeaderMacros(promptTemplates.header.content).filter(m=>fixedNames.includes(m.name)).map(m=>[m.name,m.value])),modules:Object.fromEntries(moduleNames.map(k=>[k,!promptTemplates[k].disable&&promptTemplates[k].constant])),orientation:''};
}
export function fixedMacroSnapshot(config){return {world:'插件设置',macros:parseHeaderMacros(fixedNames.map(n=>`{{setvar::${n}::${config.fixed[n]}}}`).join('\n'))};}
export function updateFixedMacros(config,snapshot,values){
    const book={entries:{0:{comment:'tag头',content:fixedMacroSnapshot(config).macros.map(m=>`{{${m.scope}::${m.name}::${m.value}}}`).join('\n')}}};
    const patched=patchWorldMacros(book,snapshot.macros,values);
    return {...config,fixed:Object.fromEntries(worldMacros(patched).map(m=>[m.name,m.value]))};
}
export function migratePromptSettings(book){
    const config=defaultPromptSettings('external'),entries=Object.values(book?.entries||{});
    for(const macro of worldMacros(book))if(macro.scope==='setvar'&&fixedNames.includes(macro.name))config.fixed[macro.name]=macro.value;
    const modified=[];
    for(const [key,template] of Object.entries(promptTemplates)){
        const entry=entries.find(e=>e.comment===template.comment);
        if(!entry)continue;
        if(moduleNames.includes(key))config.modules[key]=!entry.disable&&entry.constant===true;
        if(['bg','bl','gl','intersex'].includes(key)&&!entry.disable&&entry.constant===true){if(config.orientation)throw Error('旧世界书启用了多个性向条目');config.orientation=key;}
        if(key!=='header'&&entry.content!==template.content)modified.push(template.comment);
    }
    config.migration={status:'read',modified};return config;
}
