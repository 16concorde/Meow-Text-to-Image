import {createCharacterBindingStorage} from '../../src/platform/character-bindings-storage.js';
import {createCharacterBindingsSession} from '../../src/profiles/character-bindings-session.js';
import {defaultTreeSettings} from '../../src/prompts/tree-settings.js';
export function bindingFixture(){
    const files=new Map(),calls=[];
    const fixture={files,calls,persona:'persona-a.png',failRead:0,failWrite:false,failChat:false,failMetadata:false};
    fixture.context={chat:[],chatId:'chat-a',characterId:0,characters:[{avatar:'card-a.png',name:'Card A'}],name1:'User',chatMetadata:{},getCurrentChatId(){return this.chatId;},async saveChat(){if(fixture.failChat)throw Error('mock chat save failed');},saveMetadataDebounced(){},async saveMetadata(){if(fixture.failMetadata)throw Error('mock metadata save failed');}};
    fixture.config={...defaultTreeSettings(),tagMode:'binding'};
    fixture.fetch=async(url,options={})=>{
        calls.push({url,method:options.method||'GET'});
        if(url==='/api/files/upload'){
            if(fixture.beforeUpload)await fixture.beforeUpload();
            if(fixture.failWrite)return new Response('',{status:500});
            const {name,data}=JSON.parse(options.body),path='/user/files/'+name;
            files.set(path,new TextDecoder().decode(Uint8Array.from(atob(data),c=>c.charCodeAt(0))));return Response.json({path});
        }
        if(fixture.failRead)return new Response('',{status:fixture.failRead});
        return files.has(url)?new Response(files.get(url)):new Response('',{status:404});
    };
    fixture.storage=createCharacterBindingStorage({getHeaders:()=>({'Content-Type':'application/json'}),fetchImpl:fixture.fetch});
    fixture.session=createCharacterBindingsSession({context:()=>fixture.context,persona:()=>fixture.persona,storage:fixture.storage,mode:()=>fixture.config,models:()=>fixture.models||['nai-diffusion-4-5-full']});
    return fixture;
}
