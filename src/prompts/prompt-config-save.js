import {migrateTreeSettings,validateTreeSettings} from './tree-settings.js';
export function promptConfigError(stage,error){return Object.assign(Error(String(error?.message||error)),{stage,cause:error});}
// The persistence adapter stages the candidate in host settings, not in the running config.
export async function savePromptCandidate(next,{persist,commit}){
    let candidate;try{candidate=migrateTreeSettings(next);validateTreeSettings(candidate);}catch(error){throw promptConfigError(next?.version===2&&next.treeRevision===4?'validate':'upgrade',error);}
    try{await persist(candidate);}catch(error){throw promptConfigError('save',error);}
    commit(candidate);return candidate;
}
