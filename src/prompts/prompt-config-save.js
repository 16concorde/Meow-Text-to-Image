import {migrateTreeSettings,validateTreeSettings} from './tree-settings.js';
export function promptConfigError(stage,error){return Object.assign(Error(String(error?.message||error)),{stage,cause:error,status:error?.status});}
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
// The persistence adapter stages the candidate in host settings, not in the running config.
export async function savePromptCandidate(next,{persist,commit,isCurrent=()=>true}){
    let candidate;try{candidate=migrateTreeSettings(structuredClone(next));validateTreeSettings(candidate);}catch(error){throw promptConfigError(next?.version===2&&next.treeRevision===4?'validate':'upgrade',error);}
    freeze(candidate);let committed=false;const confirm=()=>{if(!committed&&isCurrent()){committed=true;commit(candidate);}};
    try{await persist(candidate,{confirm});}catch(error){throw promptConfigError('save',error);}
    confirm();return candidate;
}
