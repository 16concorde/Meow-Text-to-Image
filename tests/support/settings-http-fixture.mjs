// Local preview only. Each test id owns independent serialized server storage.
export function createSettingsHTTPFixture(){
    const stores=new Map();
    const state=id=>{if(!stores.has(id))stores.set(id,{settings:{},options:{},saves:[],reads:0});return stores.get(id);};
    return async(req,res)=>{
        const control=req.url.startsWith('/fixture-settings/');
        if(!control&&!['/api/settings/get','/api/settings/save'].includes(req.url))return false;
        const id=control?req.url.slice('/fixture-settings/'.length):req.headers['x-miao-fixture']||'default',s=state(id);
        const read=async()=>{let text='';for await(const chunk of req)text+=chunk;return text?JSON.parse(text):{};};
        const send=(value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
        if(control){if(req.method==='POST'){const input=await read();if(input.settings)s.settings=structuredClone(input.settings);if(input.options)s.options=input.options;if(input.reset){s.saves=[];s.reads=0;}}send(s);return true;}
        const o=req.headers['x-miao-bootstrap']?{}:{...s.options};
        if(req.url==='/api/settings/get'){
            s.reads++;if(o.readDelay)await new Promise(r=>setTimeout(r,o.readDelay));
            if(o.getStatus)send({},o.getStatus);else if(o.badJSON){res.end('{');}else send({settings:JSON.stringify(s.settings)});
        }else{
            const payload=await read();s.saves.push(payload);
            if(o.delay)await new Promise(r=>setTimeout(r,o.delay));
            if(o.status)send({},o.status);
            else if(o.disconnect==='before')res.destroy();
            else{if(!o.noWrite)s.settings=structuredClone(payload);if(o.disconnect==='after')res.destroy();else send({result:'ok'});}
        }
        return true;
    };
}

export const settingsHostScript=`
import {extension_settings,getContext} from '/scripts/extensions.js';
const p=window.preview;
export let settingsReady=!new URL(location.href).searchParams.has('settings-http');
let debounce;
p.completeSettings=async()=>{if(p.finalSettings){extension_settings.miao_nai_image=structuredClone(p.finalSettings);p.settings=extension_settings.miao_nai_image;}settingsReady=true;await p.emit('SETTINGS_LOADED');};
p.debounceSettings=()=>{clearTimeout(debounce);debounce=setTimeout(()=>void saveSettings(),40);};
export async function saveSettings(){
    p.saveCalls=(p.saveCalls||0)+1;
    if(!settingsReady||p.temporaryOverride){p.debounceSettings();return;}
    if(p.holdSettingsSave)await new Promise(resolve=>p.releaseSettingsSave=resolve);
    if(p.failSettingsSave)return false; // Explicit adapter-failure fixture, separate from ST HTTP semantics.
    try{
        const body=JSON.stringify({extension_settings});
        const response=await fetch('/api/settings/save',{method:'POST',headers:getContext().getRequestHeaders(),body});
        if(!response.ok)throw Error('host settings HTTP error');
        p.settingsSaves=(p.settingsSaves||0)+1;
        if(p.promptMigrationFixture)sessionStorage.setItem('miao-preview-prompt-state',JSON.stringify(extension_settings.miao_nai_image.promptConfig));
        await p.emit('SETTINGS_UPDATED');
    }catch{toastr.error('宿主设置保存出错');} // ST swallows HTTP/network errors and returns undefined.
}
`;
