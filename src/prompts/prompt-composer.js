import {composeTreePrompt} from './tree-composer.js';
import {validateTreeSettings} from './tree-settings.js';
export function composePrompt(config,activation={}){return composeTreePrompt(validateTreeSettings(config),activation);}
