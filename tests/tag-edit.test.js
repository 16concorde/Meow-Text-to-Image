import test from 'node:test';
import assert from 'node:assert/strict';
import {editedTag} from '../src/prompts/tag-edit.js';
import {parseBodyBlocks,delimiterPattern} from '../src/core/core.js';
import {writeSwipeImage,readSwipeImage,moveSwipeImage} from '../src/chat/swipe-history.js';
const pattern=delimiterPattern('image###','###');
test('editing a duplicate tag changes only its capture and preserves surrounding text and reasoning',()=>{
 const text='<think>image###draft###</think>before image###cat### middle image###cat### after';
 const tags=parseBodyBlocks(text,pattern),result=editedTag(text,tags[1],'dog\nnew scene',pattern);
 assert.equal(result.text,'<think>image###draft###</think>before image###cat### middle image###dog\nnew scene### after');assert.equal(result.block.bodyIndex,1);
 assert.throws(()=>editedTag(text,tags[1],'',pattern),/不能为空/);
 assert.throws(()=>editedTag(text,tags[1],'bad### image###injection',pattern),/标记/);
 assert.throws(()=>editedTag('changed',tags[1],'dog',pattern),/已变化/);
 const custom=delimiterPattern('<pic>','</pic>'),source='a<pic> cat </pic>b';assert.equal(editedTag(source,parseBodyBlocks(source,custom)[0],'dog',custom).text,'a<pic>dog</pic>b');
});
test('moving edited-tag history retains versions and per-image prompts across saves and swipes without resurrecting the old slot',()=>{
 const message={mes:'image###cat###',swipe_id:0,swipes:['image###cat###','image###cat###'],swipe_info:[{extra:{}},{extra:{}}],extra:{unrelated:'keep'}},from='body:0:cat',to='body:0:dog';
 const record={url:'second.png',tagPrompt:'cat',versions:[{url:'first.png',tagPrompt:'cat'},{url:'second.png',tagPrompt:'cat'}],selected:1};
 writeSwipeImage(message,0,from,record);writeSwipeImage(message,1,from,{url:'other-swipe.png'});
 moveSwipeImage(message,0,from,to,readSwipeImage(message,0,from));const saved=JSON.parse(JSON.stringify(message));
 assert.equal(readSwipeImage(saved,0,from),undefined);assert.equal(readSwipeImage(saved,0,to).versions.length,2);assert.equal(readSwipeImage(saved,1,from).url,'other-swipe.png');assert.equal(saved.extra.unrelated,'keep');
 assert.equal(saved.extra.miao_nai_image['0:'+from],undefined);assert.equal(saved.swipe_info[0].extra.miao_nai_image['0:'+from],undefined);
});

test('editing character pipes is atomic, model-aware and preserves duplicate blocks and swipe history',()=>{
 const text='before image###cat### middle image###cat### after',block=parseBodyBlocks(text,pattern)[1],raw='2boys | boy, source#hug | boy, target#hug';
 const result=editedTag(text,block,raw,pattern,{model:'nai-diffusion-4-5-full'});
 assert.equal(result.text,'before image###cat### middle image###'+raw+'### after');assert.equal(result.block.bodyIndex,1);
 for(const prompt of ['base | boy |','base ||unclosed'])assert.throws(()=>editedTag(text,block,prompt,pattern),/不能为空|未闭合/);
 assert.throws(()=>editedTag(text,block,raw,pattern,{model:'nai-diffusion-3'}),/不支持多角色/);
 const crowd='7boys'+Array(7).fill(' | boy').join('');assert.equal(editedTag(text,block,crowd,pattern,{model:'nai-diffusion-5-full'}).block.prompt,crowd);
 const message={mes:result.text,swipe_id:0,extra:{}},request={prompt:'global base',naiCharacters:['boy, source#hug','boy, target#hug']};
 writeSwipeImage(message,0,'body:1:'+raw,{tagPrompt:raw,request});const saved=readSwipeImage(JSON.parse(JSON.stringify(message)),0,'body:1:'+raw);
 assert.equal(saved.tagPrompt,raw);assert.deepEqual(saved.request,request);assert.equal(text,'before image###cat### middle image###cat### after');
});
