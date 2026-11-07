import {readVibeFiles} from '../vibe/vibe-files.js';
import {vibeModelKeys} from '../vibe/vibe.js';
import {vibeImageData} from '../vibe/vibe-image.js';
import {onlineEncodingAvailable} from '../novelai/nai-connection.js';
import {bindingNode as n,bindingAction as action,bindingField as field} from './character-binding-controls.js';
export function createVibeEncodingView({draft,settings,keyStatus,findEncoding,encode,retrySave,pendingSave,onSaved,onBack}){
    const root=n('section',undefined,'miao-section miao-vibe-encoding'),status=n('p','','miao-muted');status.setAttribute('role','status');let busy=false,disposed=false,epoch=0,cached=null,lastError='',lookup=null;
    root.append(n('h3','Vibe 编码'));action(root,'返回 Vibe 资料库',onBack,fail);
    const upload=n('input');upload.type='file';upload.accept='image/png,image/jpeg,image/webp';upload.setAttribute('aria-label','选择编码原图');root.append(upload);
    const preview=n('div',undefined,'miao-vibe-preview');root.append(preview);
    const name=field(root,'Vibe 名称',draft.name),model= n('select');model.setAttribute('aria-label','编码模型');for(const [id,label] of Object.entries(vibeModelKeys)){const option=n('option',label);option.value=id;model.append(option);}draft.model??='nai-diffusion-4-5-full';model.value=draft.model;const modelLabel=n('label',undefined,'miao-field');modelLabel.append(n('span','编码模型'),model);root.append(modelLabel);
    const information=field(root,'信息提取量',draft.information??1);information.type='number';information.min='0';information.max='1';information.step='0.01';
    root.append(n('p','只在点击编码按钮后发送所选原图。改变模型或信息提取量可能需要一次新的编码。','miao-muted'),status);
    const recovery=action(root,'检查保存结果',async()=>{busy=true;paintBusy();try{const library=await retrySave();lastError='';status.textContent='保存已确认';if(!pendingSave()){busy=false;onSaved(library.at(-1));}}catch(error){fail(error);}finally{busy=false;paintBusy();}},fail);recovery.hidden=!pendingSave();
    const submit=action(root,'编码并保存',async()=>{
        if(busy)return;const body=parameters();busy=true;paintBusy();status.textContent=cached?'使用已有编码…':'编码中…';
        try{const item=await encode(body);if(!disposed){busy=false;onSaved(item);}}catch(error){fail(error);}finally{busy=false;if(!disposed){await check();paintBusy();}}
    },fail);
    function fail(error){lastError=error.message;status.textContent=lastError;recovery.hidden=!pendingSave();}
    function parameters(){if(!draft.image)throw Error('请选择编码原图');if(!name.value.trim())throw Error('请填写 Vibe 名称');if(!information.value.trim()||!information.checkValidity()||!Number.isFinite(+information.value))throw Error('信息提取量须为 0～1');return {image:draft.image,name:name.value.trim(),model:model.value,information:+information.value};}
    function paintBusy(){for(const control of root.querySelectorAll('input,select,button'))control.disabled=busy;submit.disabled=busy||!draft.ready||pendingSave()>0;}
    function paintImage(){preview.replaceChildren();if(draft.image){const image=n('img');image.alt='待编码原图';image.src=vibeImageData(draft.image).url;preview.append(image);}else preview.append(n('span','选择一张原图'));}
    async function check(){const token=++epoch;draft.ready=false;submit.disabled=true;cached=null;try{
        const body=parameters();if(!lookup||lookup.image!==body.image||lookup.model!==body.model||lookup.information!==body.information)lookup={image:body.image,model:body.model,information:body.information,promise:findEncoding(body)};cached=await lookup.promise;if(disposed||token!==epoch)return;
        const credential=cached?{ready:true}:await keyStatus();if(disposed||token!==epoch)return;
        draft.ready=!!cached||onlineEncodingAvailable(settings)&&credential.ready;
        submit.textContent=cached?'使用已有编码':settings.naiConnection==='custom'?'编码并保存 - 可能消耗 Anlas':'编码并保存 - 2 Anlas';
        if(!lastError)status.textContent=cached?'已找到相同原图、模型和信息提取量的编码':draft.ready?'':!onlineEncodingAvailable(settings)?'请在「生成」页启用在线 Vibe 编码':'请在「生成」页填写当前连接的可用 Key';
    }catch(error){if(!disposed&&token===epoch)status.textContent=error.message;}finally{if(!disposed&&token===epoch)paintBusy();}}
    upload.onchange=async()=>{const file=upload.files?.[0];upload.value='';if(!file||busy)return;const token=++epoch;busy=true;paintBusy();try{const [item]=await readVibeFiles([file],{intent:'image'});if(disposed||token!==epoch)return;draft.image=item.image;draft.name=item.name;name.value=item.name;paintImage();}catch(error){fail(error);}finally{busy=false;if(!disposed){await check();paintBusy();}}};
    name.oninput=()=>{draft.name=name.value;void check();};model.onchange=()=>{draft.model=model.value;void check();};information.oninput=()=>{draft.information=information.value;void check();};
    paintImage();void check();return {element:root,flush:async()=>{if(busy)throw Error('Vibe 编码或保存尚未完成，请等待结果');},dispose(){disposed=true;epoch++;}};
}
