import {rebuildLegacyTreeSettings} from './tree-migration.js';
import {validateCaptureProtocol} from './prompt-runtime-renderer.js';
import {promptTree, treeById, orientations} from './tree-defaults.js';
import {defaultNsfwKeywords,validateNsfwKeywords} from './nsfw-trigger.js';

export const paramNames = Object.freeze({count:'张数', eggMarker:'彩蛋位置'});
export function defaultTreeSettings(mode = 'builtin') {
    return {version:2, treeRevision:5, tagMode:'full', mode, flags:{fan:true}, injection:{depth:0}, capture:{start:'image###',end:'###'}, nsfwTrigger:{keywords:[...defaultNsfwKeywords]}, params:{count:'2~3', eggMarker:'/meow_FM'},
        enabledById:Object.fromEntries(promptTree.filter(n => n.toggleable).map(n => [n.nodeId, n.defaultEnabled])),
        textOverridesById:{}, orientation:''};
}

// Revision 5 is the compatibility baseline. Future revisions need their own
// preserving upgrades; never classify an unknown revision as legacy.
export function migrateTreeSettings(config) {
    if (!config) return defaultTreeSettings();
    if (config.version === 2) {
        if (config.treeRevision === 5) {validateTreeSettings(config);if(Object.hasOwn(config.injection,'order'))return {...config,injection:{depth:config.injection.depth}};return config;}
        if (config.treeRevision === undefined || [1,2,3,4].includes(config.treeRevision)) {
            return rebuildLegacyTreeSettings(config, defaultTreeSettings(), validateTreeSettings);
        }
        throw Error('不支持的提示词树版本，原配置已保留');
    }
    if (config.version === 1) return rebuildLegacyTreeSettings(config, defaultTreeSettings(), validateTreeSettings);
    throw Error('不支持的提示词配置版本，原配置已保留');
}

export function validateTreeSettings(config) {
    if (!['full','binding'].includes(config.tagMode)) throw Error('Tag 模式无效');
    if (config.treeRevision!==5 || config.version !== 2 || !['builtin','external'].includes(config.mode) || !orientations.includes(config.orientation)) throw Error('提示词配置无效');
    if (!config.nsfwTrigger || typeof config.nsfwTrigger !== 'object') throw Error('NSFW 触发配置无效，原配置已保留');
    validateNsfwKeywords(config.nsfwTrigger.keywords);
    if(typeof config.flags?.fan!=='boolean')throw Error('同人开关无效');
    const {depth}=config.injection||{};
    if(!Number.isInteger(depth)||depth<0||depth>10000)throw Error('注入位置需为有效整数，深度范围为 0～10000');
    validateCaptureProtocol(config.capture,config.params?.eggMarker);
    if(!config.params?.count?.trim()||!config.params?.eggMarker?.trim()||/[\r\n\u0000-\u001f]/.test(config.params.eggMarker))throw Error('张数与彩蛋位置不可为空，位置必须为单行');
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
    if (treeById[id]?.editable===false) throw Error('固定任务不可编辑');
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
    if(node.tagMode&&config.tagMode!==node.tagMode||node.flag&&!config.flags?.[node.flag])return false;
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
    if ((startTag !== 'image###' || endTag !== '###') && Object.keys(config.textOverridesById||{}).length) warnings.push('自定义正文请核对捕捉协议；无法识别的格式需手动适配。');
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

// Historical storage is retained verbatim, but never participates in active prompt comparisons.
export function promptConfigForComparison(config){
    if(!config)return config;const result={...config};delete result.migrationArchive;return result;
}
