import {promptTree, treeById, orientations} from './tree-defaults.js';
import {defaultNsfwKeywords,validateNsfwKeywords} from './nsfw-trigger.js';
import {promptTemplates} from './prompt-templates.js';

export const paramNames = Object.freeze({persona:'人格', target:'对象', count:'张数', eggMarker:'彩蛋标签'});
export function defaultTreeSettings(mode = 'builtin') {
    return {version:2, treeRevision:4, tagMode:'full', mode, nsfwTrigger:{keywords:[...defaultNsfwKeywords]}, params:{persona:'ELLA', target:'User', count:'2~3', eggMarker:'/meow_FM'},
        enabledById:Object.fromEntries(promptTree.filter(n => n.toggleable).map(n => [n.nodeId, n.defaultEnabled])),
        textOverridesById:{}, orientation:''};
}

function hasLegacyCustomizations(config) {
    return config?.version === 1 && (config.fixed?.cot_xml!==undefined&&config.fixed.cot_xml!=='star_cot'||Object.entries(config.overrides || {}).some(([key, text]) => text !== promptTemplates[key]?.content));
}

// One-time upgrades only; unsplittable historical documents remain untouched and blocked.
export function migrateTreeSettings(config) {
    if (!config) return defaultTreeSettings();
    if (config.version === 2) {
        if (config.treeRevision === 4) { validateTreeSettings(config); const keys=['legacyBackup','treeBackup','treeUpgradeBackup'];if(!keys.some(k=>Object.hasOwn(config,k)))return config;const next={...config};for(const key of keys)delete next[key];return next; }
        if (config.treeRevision === 3) {
            const next={...config,treeRevision:4,tagMode:config.tagMode??'full',textOverridesById:structuredClone(config.textOverridesById||{})};
            if(next.textOverridesById.tags?.body!==undefined){
                if(next.textOverridesById['tags.full']?.body!==undefined&&next.textOverridesById['tags.full'].body!==next.textOverridesById.tags.body)throw Error('旧 Tag 与新版完整 Tag 自定义正文冲突，原配置保留；请核对宿主设置备份');
                next.textOverridesById['tags.full']={...next.textOverridesById['tags.full'],body:next.textOverridesById.tags.body};
                delete next.textOverridesById.tags;
            }
            return migrateTreeSettings(next);
        }
        if (config.treeRevision === 2) {
            const next = {...config, treeRevision:3, nsfwTrigger:config.nsfwTrigger === undefined ? {keywords:[...defaultNsfwKeywords]} : structuredClone(config.nsfwTrigger)};
            return migrateTreeSettings(next);
        }
        if (config.treeRevision !== undefined && config.treeRevision !== 1) throw Error('不支持的提示词树版本，原配置已保留');
        const next = {...config, treeRevision:2, enabledById:{...config.enabledById}, textOverridesById:structuredClone(config.textOverridesById || {})};
        if(config.textOverridesById?.tags?.body!==undefined&&config.textOverridesById?.['tags.rules']?.body!==undefined&&config.textOverridesById.tags.body!==config.textOverridesById['tags.rules'].body)throw Error('旧 Tag 两份自定义正文冲突，原配置保留；请从宿主设置备份核对正文后升级');
        const suffix=next.textOverridesById.egg?.suffix;
        if(suffix!==undefined&&suffix!=='完成彩蛋任务。')next.textOverridesById.egg={...next.textOverridesById.egg,body:(next.textOverridesById.egg.body??treeById.egg.slots.body)+'\n'+suffix};
        if (typeof next.enabledById['tags.rules'] === 'boolean') next.enabledById.tags = savedEnabled(config, 'tags') && next.enabledById['tags.rules'];
        delete next.enabledById['tags.rules']; delete next.enabledById['selfcheck.nsfw'];
        if (next.textOverridesById['tags.rules']?.body !== undefined) next.textOverridesById.tags = {...next.textOverridesById.tags, body:next.textOverridesById['tags.rules'].body};
        delete next.textOverridesById['tags.rules'];
        if (next.textOverridesById.egg) { delete next.textOverridesById.egg.suffix; if (!Object.keys(next.textOverridesById.egg).length) delete next.textOverridesById.egg; }
        return migrateTreeSettings(next);
    }
    if (config.version !== 1) throw Error('不支持的提示词配置版本，原配置已保留');
    if (hasLegacyCustomizations(config)) throw Error('旧版自定义全文无法无损拆分，原配置未覆盖；请从宿主设置备份提取正文后转换到新版条目');
    const next = defaultTreeSettings(config.mode);
    for (const [key, name] of Object.entries(paramNames)) if (typeof config.fixed?.[name] === 'string') next.params[key] = config.fixed[name];
    const modules = {selfCheck:'selfcheck', easterEgg:'egg', subtitle:'output.subtitle', easterEggDescription:'egg.description', nsfw:'nsfw'};
    for (const [key, id] of Object.entries(modules)) if (typeof config.modules?.[key] === 'boolean') next.enabledById[id] = config.modules[key];
    next.orientation = String(config.orientation || '').toUpperCase();
    if (config.migration) next.migration = structuredClone(config.migration);
    validateTreeSettings(next);
    return next;
}

export function validateTreeSettings(config) {
    if (!['full','binding'].includes(config.tagMode)) throw Error('Tag 模式无效');
    if (config.treeRevision!==4 || config.version !== 2 || !['builtin','external'].includes(config.mode) || !orientations.includes(config.orientation)) throw Error('提示词配置无效');
    if (!config.nsfwTrigger || typeof config.nsfwTrigger !== 'object') throw Error('NSFW 触发配置无效，原配置已保留');
    validateNsfwKeywords(config.nsfwTrigger.keywords);
    for (const key of Object.keys(paramNames)) {
        if (typeof config.params?.[key] !== 'string' || config.params[key].length > 16000) throw Error('任务参数需为不超过 16000 字符的文本');
    }
    for (const [id, value] of Object.entries(config.enabledById || {})) if (!treeById[id]?.toggleable || typeof value !== 'boolean') throw Error('提示词开关无效');
    for (const [id, slots] of Object.entries(config.textOverridesById || {})) {
        if (!treeById[id] || !slots || typeof slots !== 'object' || Array.isArray(slots)) throw Error('未知提示词条目');
        for (const [slot, text] of Object.entries(slots)) validateText(id, slot, text);
    }
    if (!treeText(config, 'selfcheck', 'prefix').trimEnd().endsWith('<imgthink>') || !treeText(config, 'selfcheck', 'suffix').trimStart().startsWith('</imgthink>')) throw Error('自检开头须以 <imgthink> 结尾，结尾须以 </imgthink> 开始，以保持成对');
    return config;
}
function validateText(id, slot, text) {
    if (!treeById[id] || !Object.hasOwn(treeById[id].slots, slot)) throw Error('未知提示词正文');
    if (typeof text !== 'string' || text.length > 100000) throw Error('提示词需为不超过 100000 字符的文本');
    if (/<\/?imageTag\b/i.test(text)) throw Error('imageTag 外壳由插件固定提供，请勿写入条目正文');
}
export function treeText(config, id, slot = 'body') {
    if (!treeById[id] || !Object.hasOwn(treeById[id].slots, slot)) throw Error('未知提示词正文');
    return config.textOverridesById?.[id]?.[slot] ?? treeById[id].slots[slot];
}
export function withTreeText(config, id, values) {
    config = migrateTreeSettings(config);
    const overrides = {...config.textOverridesById}, slots = {...overrides[id]};
    for (const [slot, text] of Object.entries(values)) {
        validateText(id, slot, text);
        if (text === treeById[id].slots[slot]) delete slots[slot]; else slots[slot] = text;
    }
    if (Object.keys(slots).length) overrides[id] = slots; else delete overrides[id];
    return validateTreeSettings({...config, textOverridesById:overrides});
}
export function savedEnabled(config, id) {
    const node = treeById[id];
    if (!node) throw Error('未知提示词节点');
    return node.toggleable ? config.enabledById?.[id] ?? node.defaultEnabled : true;
}
export function effectiveEnabled(config, id) {
    const node = treeById[id];
    if (id==='tags.full' && config.tagMode!=='full' || id==='tags.binding' && config.tagMode!=='binding') return false;
    if (!savedEnabled(config, id)) return false;
    if (node.parentId && !effectiveEnabled(config, node.parentId)) return false;
    if (node.condition?.some(key => !effectiveEnabled(config, key))) return false;
    return node.kind !== 'choice-option' || config.orientation === node.choice;
}
export function withTreeEnabled(config, id, enabled) {
    config = migrateTreeSettings(config);
    if (!treeById[id]?.toggleable || typeof enabled !== 'boolean') throw Error('该条目不可切换');
    return validateTreeSettings({...config, enabledById:{...config.enabledById, [id]:enabled}});
}
export function promptWarnings(config, startTag, endTag) {
    if (config.version !== 2) return [];
    const warnings = [];
    if (Object.values(config.params).some(value => /\{\{/.test(value)) || Object.values(config.textOverridesById || {}).some(slots => Object.values(slots).some(value => /\{\{/.test(value)))) warnings.push('内容含酒馆宏：插件按原文保留，不解析变量；最终行为取决于宿主与预设。');
    if (startTag !== 'image###' || endTag !== '###') warnings.push('当前捕捉标签与内置 image### / ### 格式不一致，可能无法识别图片；请核对捕捉标签和输出正文。');
    if (config.textOverridesById?.['output.format']?.body !== undefined) warnings.push('图片标签结构已自定义，请核对实际输出与捕捉标签；插件不会自动改写正文。');
    return warnings;
}

export function withNsfwKeywords(config, keywords) {
    validateNsfwKeywords(keywords);
    const candidate = {...config, nsfwTrigger:{keywords:[...keywords]}};
    try { validateNsfwKeywords(config.nsfwTrigger?.keywords); }
    catch { candidate.nsfwTriggerBackup = structuredClone(config.nsfwTrigger ?? null); }
    return migrateTreeSettings(candidate);
}
