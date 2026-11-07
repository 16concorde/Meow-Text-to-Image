import {imageLayoutInstruction} from './image-layout.js';
import {renderTask,renderPromptSlot} from './prompt-runtime-renderer.js';
import {treeById, treeRoots, validatePromptTree} from './tree-defaults.js';
import {effectiveEnabled, treeText, validateTreeSettings} from './tree-settings.js';

export function composeTreePrompt(config, activation = {}) {
    if(activation.capture)config={...config,capture:activation.capture};
    validatePromptTree(); validateTreeSettings(config);
    if (config.mode !== 'builtin') return '';
    const parts = [];
    function visit(id) {
        if ((id === 'nsfw' || id === 'selfcheck.nsfw') && activation.nsfwMatched !== true) return;
        if (!effectiveEnabled(config, id)) return;
        const node = treeById[id];
        for (const slot of ['prefix', 'body']) if (Object.hasOwn(node.slots, slot)) {
            let text = treeText(config, id, slot);
            if(id==='task')text=renderTask(text,config,effectiveEnabled(config,'egg'));
            text=renderPromptSlot(text,id,slot,config,activation);
            parts.push(text);
        }
        if (id === 'output') {
            // Output instructions form one continuous format block, in exact row order.
            const start = parts.length - (Object.hasOwn(node.slots, 'prefix') ? 1 : 0);
            node.children.forEach(visit);
            parts.splice(start, parts.length - start, parts.slice(start).filter(text => text !== '').join('\n'));
        } else node.children.forEach(visit);
        if (Object.hasOwn(node.slots, 'suffix')) parts.push(treeText(config, id, 'suffix'));
    }
    treeRoots.forEach(visit);if(activation.imageLayoutAI)parts.push(imageLayoutInstruction(config.capture));
    return ['---', '<imageTag>', ...parts.filter(text => text !== ''), '</imageTag>', '---'].join('\n\n');
}
