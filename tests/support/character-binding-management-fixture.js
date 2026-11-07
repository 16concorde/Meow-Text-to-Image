import {createCharacterBindingStorage} from '../../src/platform/character-bindings-storage.js';
import {createCharacterBindingHost} from '../../src/platform/character-binding-host.js';
import {createCharacterBindingsManagement} from '../../src/profiles/character-bindings-management.js';
import {createBindingChatSettings} from '../../src/chat/character-binding-chat-settings.js';
export function managementFixture({cards=2,users=2}={}){
    const f={files:new Map(),cards:new Map(),chats:new Map(),requests:[],account:'fixture-account',avatar:'persona-0.png',swallowCard:false,swallowMetadata:false,swallowChat:false,failUpload:false,uploadThenThrow:false,failSummary:false,busy:false};
    const context={characterId:0,characters:Array.from({length:cards},(_,i)=>({avatar:`card-${i}.png`,name:i<2?'Same Name':'Card '+i,data:{extensions:{}}})),chatId:'chat-a',chat:[],chatMetadata:{integrity:'fixture-integrity'},powerUserSettings:{personas:Object.fromEntries(Array.from({length:users},(_,i)=>[`persona-${i}.png`,i<2?'Traveler':'User '+i])),persona_descriptions:{'persona-0.png':{title:'Fixture Remark',description:'Bounded description'}}},getCurrentChatId(){return this.chatId;},getRequestHeaders:()=>({'Content-Type':'application/json'}),getThumbnailUrl:(type,file)=>'/thumbnail?type='+type+'&file='+encodeURIComponent(file),eventTypes:{},eventSource:{on(){},removeListener(){}},saveMetadataDebounced(){}};
    f.context=context;for(const c of context.characters)f.cards.set(c.avatar,structuredClone(c));
    const chatKey=(avatar,file)=>JSON.stringify([avatar,file]);
    f.chatKey=chatKey;f.storeChat=(avatar,file,metadata,messages=[])=>f.chats.set(chatKey(avatar,file),[{chat_metadata:structuredClone(metadata)},...structuredClone(messages)]);
    f.storeChat('card-0.png','chat-a',context.chatMetadata);
    context.saveMetadata=async()=>{if(!f.swallowMetadata)f.storeChat(context.characters[context.characterId].avatar,context.chatId,context.chatMetadata,context.chat);};
    context.saveChat=async()=>{if(!f.swallowChat)f.storeChat(context.characters[context.characterId].avatar,context.chatId,context.chatMetadata,context.chat);};
    context.selectCharacterById=async id=>{context.characterId=id;};
    context.openCharacterChat=async file=>{context.chatId=file;const data=f.chats.get(chatKey(context.characters[context.characterId].avatar,file));context.chatMetadata=structuredClone(data?.[0]?.chat_metadata||{});context.chat=structuredClone(data?.slice(1)||[]);};
    f.fetch=async(url,options={})=>{
        const body=options.body?JSON.parse(options.body):{};f.requests.push({url,method:options.method||'GET',body});
        if(url.startsWith('/user/files/'))return f.files.has(url)?new Response(f.files.get(url)):new Response('',{status:404});
        if(url==='/api/files/upload'){
            if(f.onUpload)await f.onUpload(body);
            if(f.failUpload||f.failSummary&&body.name.startsWith('miao-character-summary'))return new Response('',{status:500});
            const text=new TextDecoder().decode(Uint8Array.from(atob(body.data),c=>c.charCodeAt(0)));if(!f.swallowUpload)f.files.set('/user/files/'+body.name,text);if(f.uploadThenThrow)throw Error('mock interrupted after commit');return Response.json({path:'/user/files/'+body.name});
        }
        if(url==='/api/characters/get')return f.cards.has(body.avatar_url)?Response.json(f.cards.get(body.avatar_url)):new Response('',{status:404});
        if(url==='/api/characters/merge-attributes'){const card=f.cards.get(body.avatar);if(!card)return new Response('',{status:404});if(!f.swallowCard)card.data.extensions.meow_t2i=body.data.extensions.meow_t2i;return Response.json({ok:true});}
        if(url==='/api/characters/chats')return Response.json([...f.chats.keys()].map(JSON.parse).filter(([avatar])=>avatar===body.avatar_url).map(([,file])=>({file_id:file,file_name:file+'.jsonl'})));
        if(url==='/api/chats/get')return Response.json(f.chats.get(chatKey(body.avatar_url,body.file_name))||{});
        return new Response('',{status:404});
    };
    f.host=createCharacterBindingHost({context:()=>context,persona:()=>f.avatar,account:()=>f.account,fetchImpl:f.fetch,busy:()=>f.busy,tt:()=>f.tt});
    f.storage=createCharacterBindingStorage({getHeaders:context.getRequestHeaders,fetchImpl:f.fetch,scope:f.host.scope,locks:null});
    f.management=createCharacterBindingsManagement({storage:f.storage,host:f.host,locks:null});
    f.chatSettings=createBindingChatSettings({host:f.host,management:f.management});
    return f;
}
