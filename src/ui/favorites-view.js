import {createPromptAutosave} from './prompt-autosave.js';
import {configPatch,applyConfigPatch} from '../prompts/prompt-patches.js';
import {favoriteDraft,FAVORITE_IMAGE_LIMIT} from '../prompts/prompt-favorites.js';
import {pageItems} from '../core/core.js';
import {bindButtonPress} from './button-press.js';

const node=(tag,text,cls)=>{const value=document.createElement(tag);if(text!==undefined)value.textContent=text;if(cls)value.className=cls;return value;};
export function createFavoritesView({favorites,profiles,activeProfileId,initialDraft,initialFiles=[],saveFavorite,removeFavorite,generateFavorite,sceneFromImage,openImage,bindImage,onError}){
    const root=node('section',undefined,'miao-favorites');let draft=initialDraft?favoriteDraft(initialDraft):null,files=[...initialFiles],page=0,query='',saving=null,commit=async()=>{};
    const selectedProfiles=new Map();let formStatus;const draftSave=createPromptAutosave({run:async()=>{if(draft?.id)await commit(false,true);},onError:error=>{if(formStatus)formStatus.textContent=error.message;}});
    const button=(parent,label,fn)=>{const control=node('button',label,'miao-button');control.type='button';bindButtonPress(control,async()=>{if(control.disabled)return;control.disabled=true;try{await fn();}catch(error){onError(error);}finally{control.disabled=false;}});parent.append(control);return control;};
    const field=(parent,label,value,change,type='text')=>{const wrap=node('label',undefined,'miao-field'),input=node(type==='textarea'?'textarea':'input');if(type!=='textarea')input.type=type;input.value=value;input.setAttribute('aria-label',label);input.oninput=()=>change(input.value);wrap.append(node('span',label),input);parent.append(wrap);return input;};
    const profileChoice=(parent,key)=>{const wrap=node('label',undefined,'miao-field'),select=node('select');wrap.append(node('span','搭配配置'),select);parent.append(wrap);select.setAttribute('aria-label','搭配配置');for(const profile of profiles){const option=node('option',profile.name);option.value=profile.id;select.append(option);}select.value=selectedProfiles.get(key)||activeProfileId;select.onchange=()=>selectedProfiles.set(key,select.value);return select;};
    const render=()=>{
        root.replaceChildren();
        const toolbar=node('div',undefined,'miao-section-toolbar');toolbar.append(node('h3','提示词收藏'));root.append(toolbar);
        if(!draft)button(toolbar,'新增收藏',()=>{draft=favoriteDraft();files=[];render();});
        if(draft){
            const form=node('section',undefined,'miao-favorite-editor');root.append(form);form.append(node('p','可以只保存收藏，也可以选一套串，保存并生成新例图。','miao-muted'));
            field(form,'收藏名称',draft.name,value=>{draft.name=value;if(draft.id)draftSave.schedule();}).maxLength=120;
            field(form,'场景提示词',draft.positive,value=>{draft.positive=value;if(draft.id)draftSave.schedule();},'textarea');
            form.append(node('p','只保存模型输出的那段场景词。生成时，再搭配所选配置的前置、后置和负面提示词。','miao-muted'));
            const scene=draft.images.map(sceneFromImage).find(Boolean);if(scene)button(form,'从例图提取场景词',()=>{draft.positive=scene;if(draft.id)draftSave.schedule();render();});
            const select=profileChoice(form,draft.id||'new');form.append(node('p','生成例图使用所选配置的串和参数，按正常生图计费；原有配置不变。','miao-muted'));
            const examples=node('div',undefined,'miao-favorite-examples');form.append(examples);
            draft.images.forEach((url,index)=>{const tile=node('div',undefined,'miao-favorite-example'),view=button(tile,'',()=>openImage(url)),image=node('img');view.setAttribute('aria-label',`放大例图 ${index+1}`);image.alt=`例图 ${index+1}`;bindImage(image,url,{lazy:true});view.append(image);button(tile,'移除例图',()=>{draft.images.splice(index,1);if(draft.id)draftSave.schedule();render();});examples.append(tile);});
            const upload=node('input');upload.type='file';upload.multiple=true;upload.accept='image/png,image/jpeg,image/webp';upload.setAttribute('aria-label','上传例图');form.append(upload);
            const selected=node('p',files.length?`待上传：${files.map(file=>file.name).join('、')}`:'可上传 PNG、JPG、WebP，每张不超过 18 MB。','miao-muted');form.append(selected);
            upload.onchange=()=>{const next=[...upload.files];if(draft.images.length+next.length>FAVORITE_IMAGE_LIMIT){upload.value='';onError(Error(`每条收藏最多 ${FAVORITE_IMAGE_LIMIT} 张例图`));return;}files=next;selected.textContent=files.length?`待上传：${files.map(file=>file.name).join('、')}`:'未选择新例图';if(draft.id)draftSave.schedule();};
            formStatus=node('p','','miao-muted');formStatus.setAttribute('role','status');form.append(formStatus);const actions=node('div',undefined,'miao-actions');form.append(actions);
            const submit=draft.id?null:button(actions,'创建收藏',()=>commit()),regenerate=button(actions,draft.id?'生成例图':'创建并生成',()=>commit(true,!!draft.id));regenerate.classList.add('miao-primary');button(actions,draft.id?'完成编辑':'放弃新增',async()=>{if(draft.id)await draftSave.flush();draft=null;files=[];render();});
            commit=(generate=false,auto=false)=>{if(saving)return saving;if(generate&&draft.images.length+files.length>=FAVORITE_IMAGE_LIMIT)throw Error(`每条收藏最多 ${FAVORITE_IMAGE_LIMIT} 张例图，请先移除部分例图再生成`);const profileId=select.value,submitted=structuredClone(draft),uploads=[...files],controls=[...form.querySelectorAll(auto?'button':'input,textarea,select,button')];controls.forEach(control=>control.disabled=true);if(submit)submit.textContent='保存中…';formStatus.textContent='保存中…';if(generate)regenerate.textContent='生成中…';saving=(async()=>{let saved=false;try{const item=await saveFavorite(submitted,uploads);const pending=configPatch(submitted,draft);draft=auto?applyConfigPatch(favoriteDraft(item),pending):favoriteDraft(item);files=files.filter(file=>!uploads.includes(file));saved=true;selectedProfiles.set(item.id,profileId);if(generate)await generateFavorite(item,profileId);if(!auto){draft=null;render();}else{formStatus.textContent='';draftSave.recover();}}catch(error){if(saved&&!auto)render();throw error;}finally{saving=null;controls.forEach(control=>control.disabled=false);if(submit)submit.textContent='创建收藏';regenerate.textContent=draft?.id?'生成例图':'创建并生成';}})();return saving;};
            return;
        }
        commit=async()=>{};
        field(root,'搜索收藏',query,value=>{query=value;page=0;drawList();},'search');
        const list=node('div',undefined,'miao-favorite-list');root.append(list);
        const drawList=()=>{
            list.replaceChildren();const keyword=query.trim().toLocaleLowerCase(),items=favorites.list().filter(item=>[item.name,item.positive].some(text=>text.toLocaleLowerCase().includes(keyword))),paged=pageItems(items,page,12);page=paged.page;
            if(!items.length){list.append(node('p',keyword?'没有匹配的收藏':'还没有收藏。可以新增场景词，也可以从聊天图片中收藏。','miao-muted'));return;}
            const cards=node('div',undefined,'miao-favorite-grid');list.append(cards);
            for(const item of paged.items){
                const card=node('article',undefined,'miao-favorite-card');card.dataset.favoriteId=item.id;card.append(node('h3',item.name));
                const examples=node('div',undefined,'miao-favorite-examples');card.append(examples);
                item.images.forEach((url,index)=>{const view=button(examples,'',()=>openImage(url)),image=node('img');view.setAttribute('aria-label',`放大 ${item.name} 例图 ${index+1}`);image.alt=item.name+' 例图';bindImage(image,url,{lazy:true});view.append(image);});
                card.append(node('p',item.positive,'miao-favorite-summary'));
                const select=profileChoice(card,item.id);
                const actions=node('div',undefined,'miao-actions');card.append(actions);
                button(actions,'编辑',()=>{draft=favoriteDraft(item);files=[];render();});
                const needsReview='negative' in item;
                const generate=button(actions,'用此配置生成',async()=>{generate.textContent='生成中…';select.disabled=true;try{await generateFavorite(item,select.value);drawList();}finally{generate.textContent='用此配置生成';select.disabled=false;}});generate.disabled=needsReview||item.images.length>=FAVORITE_IMAGE_LIMIT;
                if(needsReview)card.append(node('p','请先编辑，确认只保留模型场景词后保存。可在原聊天中使用「从例图提取场景词」。','miao-muted'));
                else if(generate.disabled)card.append(node('p',`已有 ${FAVORITE_IMAGE_LIMIT} 张例图，请编辑移除部分例图后再生成。`,'miao-muted'));
                button(actions,'删除收藏',async()=>{if(await removeFavorite(item.id))drawList();});cards.append(card);
            }
            list.append(node('p','同一段场景词可以搭配不同配置反复生成，按正常生图计费；新图会加入这条收藏。删除收藏只移除记录，图片文件保留。','miao-muted'));
            const pager=node('nav',undefined,'miao-pager');pager.setAttribute('aria-label','收藏分页');list.append(pager);button(pager,'上一页',()=>{page--;drawList();}).disabled=page===0;pager.append(node('span',`${page+1} / ${paged.pages} · ${items.length} 条`));button(pager,'下一页',()=>{page++;drawList();}).disabled=page+1===paged.pages;
        };drawList();
    };
    render();return {element:root,commit:async()=>{if(draft?.id)await draftSave.flush();if(saving)await saving;},snapshot:()=>draft?structuredClone(draft):null,pendingUploads:()=>draft?[...files]:[],hasPending:draftSave.hasPending,hasFailure:draftSave.hasFailure,dispose:draftSave.dispose};
}
