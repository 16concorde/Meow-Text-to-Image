import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultPromptSettings} from '../src/prompts/prompt-settings.js';
import {withTreeText,treeText} from '../src/prompts/tree-settings.js';
import {composePrompt} from '../src/prompts/prompt-composer.js';
test('current tree edits preserve other slots and arbitrary native macros',()=>{
 const original=defaultPromptSettings(),next=withTreeText(original,'composition',{body:'CUSTOM {{getvar::custom}}'});assert.deepEqual(original.textOverridesById,{});assert.equal(treeText(next,'composition'),'CUSTOM {{getvar::custom}}');assert.ok(composePrompt(next).includes('{{getvar::custom}}'));assert.throws(()=>withTreeText(next,'composition',{body:'<imageTag>'}));
});
