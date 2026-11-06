// Historical v1 shape from 37a81ac, synthetic defaults only.
import {promptTemplates} from '../../src/prompts/prompt-templates.js';
import {parseHeaderMacros} from '../../src/resources/world-macros.js';
export function defaultLegacyPromptSettings(mode='builtin'){
 return {version:1,mode,fixed:Object.fromEntries(parseHeaderMacros(promptTemplates.header.content).filter(m=>['人格','cot_xml','张数','对象','彩蛋标签'].includes(m.name)).map(m=>[m.name,m.value])),modules:Object.fromEntries(['selfCheck','easterEgg','subtitle','easterEggDescription','nsfw'].map(k=>[k,!promptTemplates[k].disable&&promptTemplates[k].constant])),orientation:''};
}
