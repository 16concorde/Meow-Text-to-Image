import {generationTimeoutSeconds} from './generation-timeout.js';
import {retryGeneration} from './generation-retry.js';
import {runWithQueue} from '../queue/cloud-queue.js';
import {connectionSnapshot} from '../novelai/nai-connection.js';

export function migrateGenerationMode(settings){
    const mode=settings.enabled===false?'manual':settings.mode??(settings.stream?'stream':'manual');
    const changed=settings.mode!==mode||settings.enabled!==true;
    settings.mode=mode;settings.enabled=true;
    return changed;
}
export function migrateGenerationOptions(settings,{newInstallation=false}={}){
    settings.cloudQueue??=newInstallation;
    const retryMigrated=settings.autoRetryEnabled===undefined;
    const timeoutMigrated=settings.generationTimeoutDefaultVersion!==1;
    if(retryMigrated)settings.autoRetryEnabled=false;
    if(timeoutMigrated){
        if(Number(settings.generationTimeoutSeconds)===30)settings.generationTimeoutSeconds=60;
        settings.generationTimeoutDefaultVersion=1;
    }
    settings.generationTimeoutSeconds=generationTimeoutSeconds(settings.generationTimeoutSeconds);
    return retryMigrated||timeoutMigrated;
}
export function generationOptions(settings){
    return {...connectionSnapshot(settings),cloudQueue:settings.cloudQueue===true,autoRetryEnabled:settings.autoRetryEnabled===true,queueUrl:settings.queueUrl,generationTimeoutSeconds:generationTimeoutSeconds(settings.generationTimeoutSeconds)};
}
// A reroll keeps the historical request payload, except for the configured seed policy.
// Never mutate the stored image version: retries reuse this newly prepared request.
export function regenerateHistoricalSeed(request, configuredSeed, random=Math.random){
    const selected=Number(configuredSeed);
    if(!Number.isInteger(selected)||selected<-1||selected>4294967295)throw Error('种子须为 -1 或 0～4294967295');
    if(selected!==-1)return {...request,seed:selected};
    let seed=Math.floor(random()*4294967296);
    if(seed===request.seed)seed=(seed+1)>>>0;
    return {...request,seed};
}

// The snapshot is created when enqueueing, never read again during retries.
export function runGenerationTask({scope,generate,queueOptions={},retryOptions={},canContinue=()=>true,onStatus=()=>{}}){
    const snapshot={...scope};
    return snapshot.cloudQueue?runWithQueue({...queueOptions,url:snapshot.queueUrl,keyHash:snapshot.keyHash,autoRetry:snapshot.autoRetryEnabled===true,generate,canContinue,onStatus}):retryGeneration({...retryOptions,enabled:snapshot.autoRetryEnabled===true,run:attempt=>generate(undefined,attempt),canContinue,onStatus});
}
