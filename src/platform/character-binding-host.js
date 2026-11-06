import {hostFetch} from './host-fetch.js';
import {normalizeOwnerKey,validBindingUuid} from '../profiles/character-bindings.js';
export const OWNER_FIELD='meow_t2i';
export function projectBindingOwner(type,item){
    const locator=normalizeOwnerKey(item.avatar??item.locator);
    return {type,locator,stableKey:locator,name:String(item.name||'未命名用户设定'),title:String(item.title||'').slice(0,1000),description:String(item.description||'').slice(0,512),source:item.source||'native'};
}
export function createCharacterBindingHost({context,persona,account=()=>'',tt=()=>globalThis.window?.__TAURITAVERN__,fetchImpl=fetch,busy=()=>false,writeExtensionField}){
    const listeners=new Set(),priorities=new Map(),thumbnailVersions=new Map();let subscriptions=[],epoch=0;
    const scope=()=>JSON.stringify([globalThis.location?.origin||'host',account(),tt()?.dataRootId??null]);
    async function post(path,body){const response=await hostFetch('/api/'+path,{method:'POST',headers:context().getRequestHeaders(),body:JSON.stringify(body)},{fetchImpl});if(!response.ok)throw Error(`宿主读取失败（HTTP ${response.status}）`);return response;}
    const api={
        context,persona,scope,post,tt,canPersistDrafts:()=>typeof account()==='string'&&!!account()&&(!tt()||typeof tt().dataRootId==='string'),busy:()=>busy()||Boolean(context().streamingProcessor&&!context().streamingProcessor.isFinished),
        capabilities(){return {directedMetadata:typeof tt()?.api?.chat?.open==='function',extensionStore:!!tt()?.api?.extension?.store,thumbnail:!!(tt()?.assets?.thumbnailUrl||context().getThumbnailUrl),openChat:typeof context().openCharacterChat==='function'&&typeof context().selectCharacterById==='function'};},
        async list(type){
            const c=context();if(type==='card'){if(!Array.isArray(c.characters))throw Error('宿主角色列表尚未就绪，请刷新后重试');return c.characters.filter(x=>x?.avatar).map(x=>projectBindingOwner('card',x));}
            const names=c.powerUserSettings?.personas||{},descriptions=c.powerUserSettings?.persona_descriptions||{};
            const keys=new Set(Object.keys(names));if(persona())keys.add(persona());
            return [...keys].map(locator=>projectBindingOwner('user',{avatar:locator,name:names[locator]||'未命名用户设定',title:descriptions[locator]?.title,description:descriptions[locator]?.description,source:Object.hasOwn(names,locator)?'saved':'avatar-only'}));
        },
        async readCard(locator){const card=await (await post('characters/get',{avatar_url:normalizeOwnerKey(locator)})).json();if(card?.avatar!==locator)throw Error('角色卡读取身份不一致');return card;},
        async readOwnerId(target){if(target.type!=='card')return null;const card=await api.readCard(target.locator),id=card.data?.extensions?.[OWNER_FIELD]?.ownerId;if(id!=null&&!validBindingUuid(id))throw Error('角色卡所属 UUID 损坏，绑定读取已停止，请从完整宿主备份核对身份归属');return id||null;},
        async writeOwnerId(target,ownerId){
            if(!validBindingUuid(ownerId))throw Error('所属 UUID 无效');
            const captured=scope();let failure;try{const index=context().characters?.findIndex(c=>c.avatar===target.locator);if(typeof writeExtensionField==='function'&&index>=0)await writeExtensionField(index,OWNER_FIELD,{identityVersion:1,ownerId});else await post('characters/merge-attributes',{avatar:target.locator,data:{extensions:{[OWNER_FIELD]:{identityVersion:1,ownerId}}}});}catch(error){failure=error;}
            if(scope()!==captured)throw Object.assign(Error('账户已改变，原身份写入结果待查证'),{saveState:'unknown'});
            let confirmed;try{confirmed=await api.readOwnerId(target);}catch{throw Object.assign(Error('身份写入结果未知，请保留草稿后查证'),{saveState:'unknown'});}
            if(confirmed!==ownerId)throw Error('身份尚未保存：卡片读回不一致'+(failure?'，请重试':''));
            const card=context().characters?.find(c=>c.avatar===target.locator);if(card){card.data??={};card.data.extensions??={};card.data.extensions[OWNER_FIELD]={identityVersion:1,ownerId};if(card.json_data){try{const data=JSON.parse(card.json_data);data.data??={};data.data.extensions??={};data.data.extensions[OWNER_FIELD]={identityVersion:1,ownerId};card.json_data=JSON.stringify(data);}catch{}}}
        },
        thumbnail(target){const helper=tt()?.assets?.thumbnailUrl||context().getThumbnailUrl;if(typeof helper!=='function')return '';let url;try{url=helper(target.type==='card'?'avatar':'persona',target.locator);}catch{return '';}
            const version=thumbnailVersions.get(target.type+':'+target.locator);return version?url+(url.includes('?')?'&':'?')+'miao_revision='+version:url;},
        subscribe(fn,{first=false}={}){listeners.add(fn);priorities.set(fn,first?0:1);return ()=>{listeners.delete(fn);priorities.delete(fn);};},
        async emit(change){epoch++;for(const fn of [...listeners].sort((a,b)=>priorities.get(a)-priorities.get(b)))await fn(change);},
        epoch:()=>epoch,
        bind(){if(subscriptions.length)return;const c=context();for(const name of ['CHARACTER_RENAMED','CHARACTER_DUPLICATED','CHARACTER_EDITED','CHARACTER_DELETED','PERSONA_CREATED','PERSONA_UPDATED','PERSONA_RENAMED','PERSONA_DELETED','PERSONA_CHANGED','CHAT_CREATED','CHAT_RENAMED','CHAT_DELETED','CHAT_CHANGED','CHAT_LOADED']){
            const event=c.eventTypes?.[name];if(!event)continue;const handler=(...args)=>{
                let change={name,args};
                if(name==='CHAT_RENAMED')Object.assign(change,{type:'card',locator:args[0]?.avatarId,oldChatFile:args[0]?.oldFileName?.replace(/\.jsonl$/,''),chatFile:args[0]?.newFileName?.replace(/\.jsonl$/,'')});
                if(name==='CHARACTER_RENAMED')Object.assign(change,{type:'card',oldLocator:args[0],locator:args[1]});
                if(name==='CHARACTER_DUPLICATED')Object.assign(change,{type:'card',oldLocator:args[0]?.oldAvatar,locator:args[0]?.newAvatar,duplicate:true});
                if(name.startsWith('PERSONA_'))Object.assign(change,{type:'user',locator:typeof args[0]==='string'?args[0]:args[0]?.avatarId,oldLocator:args[0]?.duplicatedFromAvatarId,duplicate:!!args[0]?.duplicatedFromAvatarId});
                if(name==='CHARACTER_EDITED'||name==='CHARACTER_DELETED')Object.assign(change,{type:'card',locator:args[0]?.detail?.character?.avatar??args[0]?.character?.avatar});
                if(change.locator&&['CHARACTER_EDITED','PERSONA_UPDATED'].includes(name))thumbnailVersions.set(change.type+':'+change.locator,(thumbnailVersions.get(change.type+':'+change.locator)||0)+1);
                return api.emit(change);
            };c.eventSource.on(event,handler);subscriptions.push(()=>c.eventSource.removeListener?.(event,handler));
        }},
        dispose(){subscriptions.forEach(fn=>fn());subscriptions=[];listeners.clear();priorities.clear();thumbnailVersions.clear();},
    };
    return api;
}
