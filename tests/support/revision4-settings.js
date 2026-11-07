import {revision4Nodes} from '../../src/prompts/tree-history.js';
import {legacyNsfwKeywords} from '../../src/prompts/nsfw-trigger.js';
export function revision4Settings(){return {version:2,treeRevision:4,mode:'builtin',tagMode:'full',orientation:'',params:{persona:'ELLA',target:'User',count:'2~3',eggMarker:'/meow_FM'},nsfwTrigger:{keywords:[...legacyNsfwKeywords]},enabledById:Object.fromEntries(revision4Nodes.filter(n=>n.toggleable).map(n=>[n.nodeId,n.defaultEnabled])),textOverridesById:{}};}
