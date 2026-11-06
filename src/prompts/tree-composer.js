import {treeById, treeRoots, validatePromptTree} from './tree-defaults.js';
import {effectiveEnabled, treeText, validateTreeSettings} from './tree-settings.js';

export function composeTreePrompt(config, activation = {}) {
    validatePromptTree(); validateTreeSettings(config);
    if (config.mode !== 'builtin') return '';
    const parts = [];
    function visit(id) {
        if ((id === 'nsfw' || id === 'selfcheck.nsfw') && activation.nsfwMatched !== true) return;
        if (!effectiveEnabled(config, id)) return;
        const node = treeById[id];
        for (const slot of ['prefix', 'body']) if (Object.hasOwn(node.slots, slot)) {
            let text = treeText(config, id, slot);
            if (id === 'task' && slot === 'prefix') {
                const p = config.params;
                const count = p.count + '张' + (effectiveEnabled(config, 'egg') ? `，以及彩蛋插图1张，彩蛋应生成在${p.eggMarker}后` : '');
                text = text.replace(/（对象）|（人格）|（数量）张/g, token => ({'（对象）':p.target, '（人格）':p.persona, '（数量）张':count})[token]);
            }
            parts.push(text);
            if(id==='tags.binding'&&slot==='body')parts.push('【可用绑定 ID 对照表】\n'+(activation.bindingRoster||'（当前无可用绑定；所有人物须写完整 Tag，不得输出 ID）'));
        }
        if (id === 'output') {
            // Output instructions form one continuous format block, in exact row order.
            const start = parts.length - (Object.hasOwn(node.slots, 'prefix') ? 1 : 0);
            node.children.forEach(visit);
            parts.splice(start, parts.length - start, parts.slice(start).filter(text => text !== '').join('\n'));
        } else node.children.forEach(visit);
        if (Object.hasOwn(node.slots, 'suffix')) parts.push(treeText(config, id, 'suffix'));
    }
    treeRoots.forEach(visit);
    return ['---', '<imageTag>', ...parts.filter(text => text !== ''), '</imageTag>', '---'].join('\n\n');
}
