import test from 'node:test';
import assert from 'node:assert/strict';
import {vibeImageData,prepareVibePreview} from '../src/vibe/vibe-image.js';
import {importVibeData,safeThumbnail,vibeSummary} from '../src/vibe/vibe.js';
import {validateVibeFile,pngVibeData} from '../src/vibe/vibe-adapters.js';
import {sha256} from '../src/platform/browser-crypto.js';
import {pixelPNG,pngBytes} from './support/vibe-fixtures.js';
const encode=async blob=>Buffer.from(await blob.arrayBuffer()).toString('base64');
const encoded={v4full:{unknown:{encoding:'YWJj',params:{information_extracted:1}}}};
test('preview MIME comes from real PNG/JPEG/WebP signatures, never arbitrary prefixes or remote URLs',()=>{
 const jpeg=Buffer.from([255,216,255,192,0,17,8,0,1,0,1,3,1,17,0,2,17,0,3,17,0,255,217]).toString('base64');assert.equal(vibeImageData(jpeg).mime,'image/jpeg');assert.ok(safeThumbnail(jpeg).startsWith('data:image/jpeg;base64,'));assert.equal(safeThumbnail('data:image/png;base64,'+jpeg),null);assert.equal(vibeImageData(pixelPNG).mime,'image/png');
 const webp=new Uint8Array(30);webp.set(new TextEncoder().encode('RIFF'),0);webp.set(new TextEncoder().encode('WEBPVP8X'),8);assert.equal(vibeImageData(Buffer.from(webp).toString('base64')).mime,'image/webp');
 for(const data of ['https://example.invalid/a.png','data:image/svg+xml;base64,PHN2Zz4=','PGh0bWw+','%%%'])assert.throws(()=>vibeImageData(data));const huge=pngBytes();new DataView(huge.buffer).setUint32(16,20000);assert.throws(()=>vibeImageData(Buffer.from(huge).toString('base64')),/像素/);
});
test('bad thumbnail falls back locally to the original and no preview never discards a valid encoding',async()=>{
 let closes=0,thumbnails=0;const original={name:'fixture',image:pixelPNG,thumbnail:'bad',encodings:encoded},prepared=await prepareVibePreview(original,{decode:async()=>({width:1,height:1,close(){closes++;}}),thumbnail:async()=>{thumbnails++;return new Blob([pngBytes()],{type:'image/png'});},encode});
 assert.equal(prepared.thumbnail,'data:image/png;base64,'+pixelPNG);assert.equal(prepared.image,pixelPNG);assert.deepEqual(prepared.encodings,encoded);assert.equal(thumbnails,1);assert.equal(closes,1);assert.equal(original.thumbnail,'bad');
 const only=await prepareVibePreview(importVibeData({encodings:encoded})[0]);assert.equal(only.image,null);assert.equal(only.previewState,'encoding-only');assert.deepEqual(only.encodings,encoded);assert.equal(vibeSummary(only).hasImage,false);
 const broken=await prepareVibePreview({image:pixelPNG,encodings:encoded},{decode:async()=>{throw Error('bad image');}});assert.equal(broken.image,null);assert.deepEqual(broken.encodings,encoded);
 await assert.rejects(prepareVibePreview({image:pixelPNG,encodings:{}},{decode:async()=>{throw Error('bad image');}}),/没有可解码/);
});
test('official v1 fingerprints and bundles are checked; unknown models remain inert data rather than becoming another model',async()=>{
 const vibe={identifier:'novelai-vibe-transfer',version:1,type:'encoding',id:await sha256('YWJj'),encodings:encoded};await validateVibeFile({identifier:'novelai-vibe-transfer-bundle',version:1,vibes:[vibe]});await assert.rejects(validateVibeFile({...vibe,id:'0'.repeat(64)}),/指纹/);await assert.rejects(validateVibeFile({...vibe,version:99}),/版本/);
 const result=importVibeData({encodings:{'future-model':{unknown:{encoding:'YQ=='}}}})[0];assert.equal(result.encodings['future-model'].unknown.encoding,'YQ==');assert.equal(result.encodings.v4full,undefined);
 assert.throws(()=>importVibeData({identifier:'unknown',version:1,encodings:encoded}),/不支持/);const bad=JSON.parse('{"encodings":{"__proto__":{"x":{"encoding":"YQ=="}}}}');assert.throws(()=>importVibeData(bad));assert.equal({}.x,undefined);
});
test('PNG Vibe bundles and generated encoded references are distinct from their surrounding image',async()=>{
 const vibe={identifier:'novelai-vibe-transfer',version:1,type:'encoding',id:await sha256('YWJj'),encodings:encoded},bundle={identifier:'novelai-vibe-transfer-bundle',version:1,vibes:[vibe]};
 const packed=await pngVibeData(new Blob(),{readMetadata:async()=>({text:[{keyword:'naidata',text:Buffer.from(JSON.stringify(bundle)).toString('base64')}]})});assert.deepEqual(packed,bundle);
 const metadata={text:[{keyword:'Source',text:'NovelAI Diffusion V4.5 4BDE2A90'},{keyword:'Comment',parameters:{reference_image_multiple:['YQ==','Yg==']}}]},result=await pngVibeData(new Blob(),{readMetadata:async()=>metadata});assert.equal(result.vibes.length,2);assert.deepEqual(result.vibes[0].encodings['v4-5full'].unknown.encoding,'YQ==');assert.equal(result.vibes[0].image,undefined);assert.equal(result.vibes[0].thumbnail,undefined);
 assert.equal(await pngVibeData(new Blob(),{mode:'image',readMetadata:()=>assert.fail('explicit image mode must not extract vibes')}),null);await assert.rejects(pngVibeData(new Blob(),{mode:'encodings',readMetadata:async()=>({text:[]})}),/没有已编码/);
});
