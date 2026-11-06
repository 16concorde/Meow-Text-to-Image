import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {promptTemplates} from '../src/prompts/prompt-templates.js';
import {composePrompt} from '../src/prompts/prompt-composer.js';
import {defaultPromptSettings,migratePromptSettings,fixedMacroSnapshot,updateFixedMacros} from '../src/prompts/prompt-settings.js';
import {createPromptInjection,PROMPT_ID} from '../src/platform/prompt-injection.js';
test('templates retain every source body exactly',()=>{
 const book=JSON.parse(fs.readFileSync(new URL('../assets/worldbook.json',import.meta.url)));
 for(const t of Object.values(promptTemplates))assert.equal(t.content,Object.values(book.entries).find(e=>e.comment===t.comment).content);
});
test('migration is read only and distinguishes conditional entries',()=>{
 const book={entries:structuredClone(promptTemplates)},before=JSON.stringify(book),c=migratePromptSettings(book);
 assert.equal(c.mode,'external');assert.equal(c.enabledById.nsfw,false);assert.equal(JSON.stringify(book),before);
});
test('single D0 ID always reflects latest synchronous configuration and host errors surface',()=>{
 const calls=[],settings={enabled:true,promptConfig:defaultPromptSettings()};let errors=0;
 const injection=createPromptInjection({settings,context:()=>({setExtensionPrompt:(...args)=>calls.push(args)}),onError:()=>errors++});
 injection.update();settings.promptConfig.params.persona='latest';injection.update();assert.ok(calls.at(-1)[1].includes('User：latest'));
 settings.promptConfig.mode='external';injection.update();assert.equal(calls.at(-1)[1],'');settings.promptConfig.mode='builtin';settings.enabled=false;injection.update();assert.equal(calls.at(-1)[1],'');settings.enabled=true;injection.update();
 assert.ok(calls.every(c=>c[0]===PROMPT_ID&&JSON.stringify(c.slice(2))==='[1,0,false,0]'));
 assert.throws(()=>createPromptInjection({settings,context:()=>({}),onError:()=>errors++}).update());assert.equal(errors,1);
});
