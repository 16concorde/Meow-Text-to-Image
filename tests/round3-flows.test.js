import test from 'node:test';
import assert from 'node:assert/strict';
import {defaults,buildRequest,normalizeProfile} from '../src/core/core.js';
import {naiPayload,createDirectClient} from '../src/novelai/direct-client.js';
import {usesDirectGeneration} from '../src/novelai/nai-connection.js';
import {promptFileData,importPromptData} from '../src/prompts/prompt-files.js';
import {sampleSignature} from '../src/profiles/profile-previews.js';
import {generationInfo} from '../src/images/image-metadata.js';
import {readVibeFiles} from '../src/vibe/vibe-files.js';
import {pixelPNG,pngBytes} from './support/vibe-fixtures.js';
const profile={...defaults,qualityPreset:'none',ucPreset:'none',positive:'style',positiveSuffix:'discarded'};
const encoding={v4full:{official:{encoding:'YWJj',params:{information_extracted:1}}}};
test('Rescale travels through profile, portable files, request, routing, preview signature and history; V5 neutralizes it',()=>{
 for(const amount of [0,.4,1]){const p={...profile,guidanceRescale:amount},request=buildRequest(p,'scene');assert.equal(request.cfg_rescale,amount);assert.equal(naiPayload(request).parameters.cfg_rescale,amount);assert.equal(importPromptData(promptFileData(p)).guidanceRescale,amount);assert.equal(usesDirectGeneration({naiConnection:'official'},false,[],[],amount),amount>0);}
 const p={...profile,guidanceRescale:.4},v5={...p,model:'nai-diffusion-5-full'};assert.equal(buildRequest(v5,'scene').cfg_rescale,0);assert.equal(v5.guidanceRescale,.4);assert.equal(naiPayload({...buildRequest(v5,'scene'),cfg_rescale:.4}).parameters.cfg_rescale,0);
 for(const invalid of ['',null,NaN,Infinity,-.01,1.01])assert.throws(()=>buildRequest({...p,guidanceRescale:invalid},'scene'),/Rescale/);
 assert.equal(normalizeProfile({...profile,guidanceRescale:undefined}).guidanceRescale,0);assert.notEqual(sampleSignature(p),sampleSignature({...p,guidanceRescale:0}));assert.equal('positiveSuffix' in normalizeProfile(profile),false);assert.equal(buildRequest(profile,'scene').prompt,'style,\nscene,');assert.equal('positiveSuffix' in importPromptData({...promptFileData(profile),prompts:{positive:'style',negative:'',positiveSuffix:'discarded'}}),false);
 assert.equal(generationInfo({text:[]},{request:{prompt:'historical full prompt'}}).parameters.cfg_rescale,0);assert.equal(generationInfo({text:[{keyword:'Comment',parameters:{cfg_rescale:.7}}]}).parameters.cfg_rescale,.7);
});
function embeddedPNG(){const data=new TextEncoder().encode('naidata\0'+btoa(JSON.stringify({identifier:'novelai-vibe-transfer-bundle',version:1,vibes:[{encodings:encoding}]}))),chunk=new Uint8Array(data.length+12);new DataView(chunk.buffer).setUint32(0,data.length);chunk.set(new TextEncoder().encode('tEXt'),4);chunk.set(data,8);const original=pngBytes();return new Blob([original.slice(0,33),chunk,original.slice(33)],{type:'image/png'});}
test('finished import rejects raw images and unencoded JSON while image intent always keeps pixels, including encoded PNG',async()=>{
 const options={preparePreview:async item=>item},image=new File([pngBytes()],'raw.png',{type:'image/png'});await assert.rejects(readVibeFiles([image],options),/Vibe 编码/);await assert.rejects(readVibeFiles([new File([JSON.stringify({image:pixelPNG})],'raw.json')],options),/Vibe 编码/);
 const embedded=new File([embeddedPNG()],'encoded.png',{type:'image/png'}),items=await readVibeFiles([embedded],options);assert.equal(items[0].image,null);assert.equal(items[0].encodings.v4full.official.encoding,'YWJj');const [source]=await readVibeFiles([embedded],{...options,intent:'image'});assert.ok(source.image);assert.deepEqual(source.encodings,{});await assert.rejects(readVibeFiles([new File(['zip'],'x.zip')],{...options,intent:'image'}),/原图/);
});
function clientFixture(){const f={files:new Map(),settings:{naiConnection:'official'},encodes:0,uploads:0,fail:false,interrupt:false};f.client=createDirectClient({settings:f.settings,save(){},preparePreview:async item=>item,getHeaders:()=>({}),getKey:async()=>'fixture-only',fetchImpl:async(url,options={})=>{
 if(url.endsWith('/encode-vibe')){f.encodes++;return new Response(new Uint8Array([1,2,3]));}
 if(url.startsWith('/user/files/'))return f.files.has(url)?Response.json(f.files.get(url)):new Response('',{status:404});
 if(url==='/api/files/upload'){f.uploads++;if(f.fail)return new Response('',{status:500});const body=JSON.parse(options.body),item=JSON.parse(Buffer.from(body.data,'base64').toString()),path='/user/files/'+body.name;f.files.set(path,item);if(f.interrupt)throw TypeError('fixture interrupted after upload');return Response.json({path});}throw Error('unexpected fixture request');}});return f;}
test('new encoding stays outside the library until saved, failed local save recovers without a second encode, fingerprint cache reuses variants',async()=>{
 const f=clientFixture(),body={image:pixelPNG,name:'new',model:'nai-diffusion-4-full',information:1};const prepared=await f.client.prepareEncode(body);assert.equal(f.settings.vibeLibrary.length,0);f.interrupt=true;await assert.rejects(prepared.postprocess(await prepared.send()));
 assert.equal(f.encodes,1);assert.equal(f.settings.vibeLibrary.length,0);assert.equal(f.client.pending(),1);f.interrupt=false;await f.client.retry();assert.equal(f.settings.vibeLibrary.length,1);assert.equal(f.encodes,1);assert.equal(f.uploads,1);const cached=await f.client.prepareEncode(body);assert.equal(cached.cached,true);assert.equal(f.encodes,1);assert.equal((await f.client.findEncoding(body)).id,f.settings.vibeLibrary[0].id);assert.equal(await f.client.findEncoding({...body,information:.5}),null);
});
test('partial imports keep each unfinished item and retry only local storage, preserving all UUIDs',async()=>{
 const f=clientFixture();let original=f.client;f.fail=true;await assert.rejects(original.import({data:{vibes:[{encodings:encoding},{encodings:encoding},{encodings:encoding}]}}),/已导入 0 \/ 3/);assert.equal(original.pending(),3);f.fail=false;await original.retry();assert.equal(f.settings.vibeLibrary.length,3);assert.equal(new Set(f.settings.vibeLibrary.map(v=>v.id)).size,3);assert.equal(f.encodes,0);assert.equal(original.pending(),0);
});
