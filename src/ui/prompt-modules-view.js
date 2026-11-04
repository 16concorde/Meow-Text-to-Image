import {promptTemplates} from '../prompts/prompt-templates.js';
import {openPromptEditor} from './prompt-editor.js';
const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
export function createPromptModulesView({settings,save,onError,parent}){
 const root=node('section',undefined,'miao-section');root.append(node('h3','提示词模块'));
 const edit=(key,label,status)=>openPromptEditor({parent:parent(),settings,key,label,save,onSaved:()=>status.textContent=Object.hasOwn(settings.promptConfig.overrides||{},key)?'已自定义':'默认'});
 for(const [key,label,optional] of [['main','主体'],['header','指令头'],['footer','指令尾'],['selfCheck','自检',true],['easterEgg','彩蛋',true],['subtitle','小标题',true],['easterEggDescription','彩蛋解析',true],['nsfw','NSFW 提示词',true]]){
  const row=node('div',undefined,'miao-prompt-module'),status=node('span',Object.hasOwn(settings.promptConfig.overrides||{},key)?'已自定义':'默认','miao-muted');row.append(node('strong',label),status);
  if(optional){const toggle=node('input');toggle.type='checkbox';toggle.checked=!!settings.promptConfig.modules[key];toggle.setAttribute('aria-label','启用'+label);toggle.onchange=async()=>{toggle.disabled=true;try{await save({...settings.promptConfig,modules:{...settings.promptConfig.modules,[key]:toggle.checked}});}catch(error){toggle.checked=!!settings.promptConfig.modules[key];onError(error);}finally{toggle.disabled=false;}};row.append(toggle);}
  const button=node('button','编辑','miao-button');button.type='button';button.setAttribute('aria-label','编辑'+label);button.onclick=()=>edit(key,label,status);row.append(button);root.append(row);
 }
 const row=node('div',undefined,'miao-prompt-module'),label=node('label','性向模块'),select=node('select'),status=node('span','','miao-muted'),button=node('button','编辑当前性向提示词','miao-button');select.setAttribute('aria-label','性向模块');
 for(const [value,text] of [['','不指定'],['bg','BG'],['bl','BL'],['gl','GL'],['intersex','双性']]){const option=node('option',text);option.value=value;select.append(option);}select.value=settings.promptConfig.orientation;
 const paint=()=>{button.disabled=!select.value;status.textContent=select.value?(Object.hasOwn(settings.promptConfig.overrides||{},select.value)?'已自定义':'默认'):'';};paint();
 select.onchange=async()=>{select.disabled=true;try{await save({...settings.promptConfig,orientation:select.value});}catch(error){select.value=settings.promptConfig.orientation;onError(error);}finally{select.disabled=false;paint();}};button.onclick=()=>edit(select.value,promptTemplates[select.value].comment,status);label.append(select);row.append(label,status,button);root.append(row);return root;
}
