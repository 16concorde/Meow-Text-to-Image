import test from 'node:test';
import assert from 'node:assert/strict';
import {parseNAICharacterSegments as parse,normalizeNAICharacterRequest} from '../src/prompts/multi-character.js';
import {buildRequest,defaults} from '../src/core/core.js';
import {naiPayload,createDirectClient} from '../src/novelai/direct-client.js';
import {payloadSecrets} from '../src/novelai/nai-response.js';
import {redactErrorText} from '../src/platform/request-errors.js';
import {usesDirectGeneration} from '../src/novelai/nai-connection.js';
const models=['nai-diffusion-4-full','nai-diffusion-4-curated-preview','nai-diffusion-4-5-full','nai-diffusion-4-5-curated','nai-diffusion-5-full','nai-diffusion-5-curated'];
const profile={...defaults,positive:'front',positiveSuffix:'back',qualityPreset:'none',ucPreset:'none',seed:7};

test('single captions and randomizers preserve all original bytes without inventing characters',()=>{
 for(const model of [...models,'nai-diffusion-3','nai-diffusion-furry-3'])for(const raw of ['1boy, solo, black hair','  中文\n日本語 🌙  ','1girl, ||black|white||, ||day|night||','(name:1.2, blue eyes)']){
  assert.deepEqual(parse(raw,model),{hasCharacters:false,base:raw,characters:[]});
 }
});
test('ordered character segments preserve weights, Unicode, names and interaction ownership',()=>{
 const raw=' 3others, ||sunny|cloudy||, ||night|day|| \n| boy, 1.2::hair::, source#hug\n| girl, 1.5::hatsune miku::, target#hug | other, 中文 🌙, mutual#looking at each other ';
 for(const model of models){
  assert.deepEqual(parse(raw,model),{hasCharacters:true,base:'3others, ||sunny|cloudy||, ||night|day||',characters:['boy, 1.2::hair::, source#hug','girl, 1.5::hatsune miku::, target#hug','other, 中文 🌙, mutual#looking at each other']});
 }
 assert.equal(raw.endsWith('other '),true);
 assert.deepEqual(parse('base | boy, ||black|white|| | boy, [hat]',models[0]).characters,['boy, ||black|white||','boy, [hat]']);
});
test('invalid empty segments, unclosed randomizers and unsupported models fail locally without prompt echoes',()=>{
 for(const raw of ['| boy','base |','base | boy |','base |  | girl','base ||black|white','base | boy, ||x|y']){
  assert.throws(()=>parse(raw,models[0]),/不能为空|未闭合/);
 }
 for(const model of ['nai-diffusion-3','nai-diffusion-furry-3','unknown'])assert.throws(()=>parse('base | boy | girl',model),/不支持多角色/);
});
test('all V4 variants allow six and V5 variants allow twenty-two character captions',()=>{
 for(const model of models){
  const limit=model.startsWith('nai-diffusion-5-')?22:6,raw='base'+Array(limit).fill(' | boy').join('');
  assert.equal(parse(raw,model).characters.length,limit);assert.throws(()=>parse(raw+' | girl',model),new RegExp(`最多支持 ${limit}`));
 }
});
test('buildRequest keeps single caption output and places profile, text and presets only in base',()=>{
 const single=buildRequest(profile,'1boy, solo');assert.equal(single.prompt,'front,\n1boy, solo,\nback,');assert.equal('naiCharacters' in single,false);
 for(const model of models){
  const p={...profile,model,positive:'||ink|paint||',positiveSuffix:'back',qualityPreset:'standard',ucPreset:'heavy'},before=structuredClone(p);
  const request=buildRequest(p,'2boys, night, Text: hello | boy, source#hug | boy, target#hug');
  assert.deepEqual(request.naiCharacters,['boy, source#hug','boy, target#hug']);assert.match(request.prompt,/^\|\|ink\|paint\|\|,\n2boys, night/);
  const qualityAt=request.prompt.search(/best quality|very aesthetic/);assert.ok(qualityAt>=0&&qualityAt<request.prompt.indexOf('Text:'));
  assert.ok(request.prompt.includes('back,'));assert.equal(request.prompt.includes('source#'),false);assert.match(request.negative_prompt,/lowres/);assert.deepEqual(p,before);
 }
 for(const key of ['positive','positiveSuffix'])assert.throws(()=>buildRequest({...profile,[key]:'style | boy'},'scene'),/配置正面只用于全局风格/);
 assert.throws(()=>buildRequest({...profile,positive:'||unfinished'},'scene'),/未闭合/);
});
test('native payload maps matching ordered positive and empty negative captions with AI placement',()=>{
 for(const model of models){
  const request=buildRequest({...profile,model},'2boys, night | boy, red eyes | boy, blue eyes'),snapshot=structuredClone(request);
  const body=naiPayload(request),p=body.parameters;
  assert.equal(body.input,'front,\n2boys, night,\nback,');assert.equal(p.v4_prompt.caption.base_caption,body.input);
  assert.deepEqual(p.v4_prompt.caption.char_captions,[{char_caption:'boy, red eyes',centers:[{x:.5,y:.5}]},{char_caption:'boy, blue eyes',centers:[{x:.5,y:.5}]}]);
  assert.deepEqual(p.characterPrompts,[{prompt:'boy, red eyes',uc:'',center:{x:.5,y:.5}},{prompt:'boy, blue eyes',uc:'',center:{x:.5,y:.5}}]);
  assert.deepEqual(p.v4_negative_prompt.caption.char_captions,[{char_caption:'',centers:[{x:.5,y:.5}]},{char_caption:'',centers:[{x:.5,y:.5}]}]);
  assert.equal(p.v4_negative_prompt.caption.base_caption,request.negative_prompt);assert.equal(p.use_coords,false);assert.equal(p.v4_prompt.use_coords,false);assert.equal(p.v4_prompt.use_order,true);assert.deepEqual(request,snapshot);
  assert.deepEqual(naiPayload(JSON.parse(JSON.stringify(request))),body);
  assert.equal(usesDirectGeneration({naiConnection:'official'},false,[],request.naiCharacters),true);
 }
 assert.equal(usesDirectGeneration({naiConnection:'official'},false,[]),false);
 assert.throws(()=>normalizeNAICharacterRequest({prompt:'base | boy',model:models[0],naiCharacters:['girl']}),/base/);
 assert.throws(()=>normalizeNAICharacterRequest({prompt:'base',model:models[0],naiCharacters:['']}),/角色段无效/);
});
test('official and custom endpoints receive identical native character JSON in exactly one POST',async()=>{
 const bodies=[];
 for(const naiConnection of ['official','custom']){
  const calls=[],settings={naiConnection,customGenerationURL:'https://relay.invalid/image',vibeLibrary:[]};
  const client=createDirectClient({settings,save(){},getHeaders:()=>({}),getKey:async()=>'fixture-token',fetchImpl:async(url,options)=>{calls.push(url);bodies.push(JSON.parse(options.body));return new Response(Uint8Array.from([137,80,78,71,13,10,26,10]));}});
  await client.generate({...buildRequest(profile,'2boys | boy, first | boy, last'),vibes:[]});
  assert.deepEqual(calls,[naiConnection==='official'?'https://image.novelai.net/ai/generate-image':'https://relay.invalid/image']);
 }
 assert.deepEqual(bodies[0],bodies[1]);assert.equal(bodies[0].parameters.v4_prompt.caption.char_captions[1].char_caption,'boy, last');
});
test('invalid direct input fails during preparation before key, network or beforeSend queue controls',async()=>{
 let calls=0;
 const client=createDirectClient({settings:{},save(){},getHeaders:()=>({}),getKey:async()=>{calls++;return 'fixture';},fetchImpl:async()=>{calls++;throw Error('unexpected');}});
 for(const prompt of ['base | boy |','base ||open'])await assert.rejects(client.generate({prompt,model:models[0],vibes:[]},{beforeSend:()=>{calls++;}}),/不能为空|未闭合/);
 assert.equal(calls,0);
});
test('400 and 422 parameter errors do not retry, downgrade or leak character captions',async()=>{
 for(const status of [400,422]){
  let posts=0;const diagnostics=[],request={...buildRequest(profile,'2boys | boy, private-first | boy, private-last'),vibes:[]};
  const client=createDirectClient({settings:{naiConnection:'custom',customGenerationURL:'https://relay.invalid/image'},save(){},getHeaders:()=>({}),getKey:async()=>'fixture-token',onDiagnostic:d=>diagnostics.push(d),fetchImpl:async(_url,options)=>{posts++;const b=JSON.parse(options.body);return Response.json({message:'invalid character '+b.parameters.v4_prompt.caption.char_captions.map(c=>c.char_caption).join(' / ')},{status});}});
  await assert.rejects(client.generate(request),error=>error.status===status&&!error.message.includes('private-'));assert.equal(posts,1);assert.equal(JSON.stringify(diagnostics).includes('private-'),false);
 }
 const body=naiPayload(buildRequest(profile,'2boys | boy, private-first\nline | boy, private-last'));
 for(const value of ['boy, private-first\nline','boy, private-last'])assert.equal(redactErrorText(value,payloadSecrets(body)).includes('private-'),false);
});
