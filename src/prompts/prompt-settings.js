import {promptTemplates} from './prompt-templates.js';
import {parseHeaderMacros,worldMacros} from '../resources/world-macros.js';
import {defaultTreeSettings,migrateTreeSettings,paramNames,validateTreeSettings} from './tree-settings.js';
export const fixedNames=['人格','cot_xml','张数','对象','彩蛋标签'];
export const moduleNames=['selfCheck','easterEgg','subtitle','easterEggDescription','nsfw'];
export function defaultPromptSettings(mode='builtin'){return defaultTreeSettings(mode);}
export function fixedMacroSnapshot(config){validateTreeSettings(config);return {version:2,world:'插件设置',macros:Object.entries(paramNames).map(([id,name])=>({id,name,scope:'parameter',value:config.params[id]}))};}
export function updateFixedMacros(config,snapshot,values){config=migrateTreeSettings(config);const params={...config.params};for(const key of Object.keys(paramNames))if(Object.hasOwn(values,key))params[key]=values[key];return validateTreeSettings({...config,params});}
export function migratePromptSettings(book){
    const config={version:1,mode:'external',fixed:Object.fromEntries(parseHeaderMacros(promptTemplates.header.content).filter(m=>fixedNames.includes(m.name)).map(m=>[m.name,m.value])),modules:Object.fromEntries(moduleNames.map(k=>[k,!promptTemplates[k].disable&&promptTemplates[k].constant])),orientation:''},entries=Object.values(book?.entries||{});
    for(const macro of worldMacros(book))if(macro.scope==='setvar'&&fixedNames.includes(macro.name))config.fixed[macro.name]=macro.value;
    const modified=[];
    for(const [key,template] of Object.entries(promptTemplates)){
        const entry=entries.find(e=>e.comment===template.comment);
        if(!entry)continue;
        if(moduleNames.includes(key))config.modules[key]=!entry.disable&&entry.constant===true;
        if(['bg','bl','gl','intersex'].includes(key)&&!entry.disable&&entry.constant===true){if(config.orientation)throw Error('旧世界书启用了多个性向条目');config.orientation=key;}
        if(key!=='header'&&entry.content!==template.content)modified.push(template.comment);
    }
    config.migration={status:'read',modified};return migrateTreeSettings(config);
}
