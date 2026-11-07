import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveBindingPrompt} from '../src/prompts/character-binding-prompt.js';
import {buildRequest,defaults} from '../src/core/core.js';
import {naiPayload} from '../src/novelai/direct-client.js';
import {normalizeNAICharacterRequest} from '../src/prompts/multi-character.js';
import {generationInfo} from '../src/images/image-metadata.js';
import {payloadSecrets} from '../src/novelai/nai-response.js';
const bindings=[{shortId:'U01',positive:'boy, black hair, red eyes',negative:'blonde hair',enabled:true},{shortId:'C01',positive:'boy, silver hair, blue eyes',negative:'black hair',enabled:true}];
test('mixed bound/unbound characters preserve ordered positive/negative captions and global isolation',()=>{
 const raw='3boys, cafe | U01, smiling, black coat | C01, white shirt | boy, brown hair',request=buildRequest({...defaults,positive:'FRONT',positiveSuffix:'BACK',negative:'GLOBAL',qualityPreset:'none',ucPreset:'none'},raw,bindings),body=naiPayload(request);
 assert.equal(request.prompt,'FRONT,\n3boys, cafe,');assert.equal(request.negative_prompt,'GLOBAL');
 const positives=['boy, black hair, red eyes, smiling, black coat','boy, silver hair, blue eyes, white shirt','boy, brown hair'],negatives=['blonde hair','black hair',''];
 assert.deepEqual(request.naiCharacters,positives);assert.deepEqual(request.naiCharacterNegatives,negatives);
 assert.deepEqual(body.parameters.characterPrompts.map(c=>c.prompt),positives);assert.deepEqual(body.parameters.characterPrompts.map(c=>c.uc),negatives);
 assert.deepEqual(body.parameters.v4_prompt.caption.char_captions.map(c=>c.char_caption),positives);assert.deepEqual(body.parameters.v4_negative_prompt.caption.char_captions.map(c=>c.char_caption),negatives);assert.equal(body.parameters.use_coords,false);
 assert.deepEqual(generationInfo({text:[]},{request}).characters.map(c=>c.negative),negatives);
 assert.ok(payloadSecrets(body).includes('blonde hair'));
});
test('single bound uses character negative; free single retains every original request field',()=>{
 const profile={...defaults,seed:123};assert.deepEqual(buildRequest(profile,'1boy, full description'),buildRequest(profile,'1boy, full description',bindings));
 const r=buildRequest(profile,'1boy, cafe | U01, smiling',bindings);assert.equal(naiPayload(r).parameters.characterPrompts[0].uc,'blonde hair');
});
test('references are anchored; artists, middle tags, prose and randomizers are preserved',()=>{
 for(const raw of ['scene | boy, artist:C01, C01','scene | boy, ||C01|C02||','scene | boy, saying C01','artist:C01, ||day|night||'])assert.deepEqual(buildRequest({...defaults,seed:1},raw),buildRequest({...defaults,seed:1},raw,bindings));
 assert.equal(resolveBindingPrompt('scene ||day|night|| | U01, smiling',defaults.model,bindings).characters[0],'boy, black hair, red eyes, smiling');
});
test('unknown, disabled, duplicate, multiple, misplaced, empty, V3 and over-limit refs all fail before transport',()=>{
 for(const raw of ['scene | C99, smiling','scene | U01, x | U01, y','scene | U01, C01, x','U01, x','scene | U01, x |'])assert.throws(()=>buildRequest(defaults,raw,bindings));
 assert.throws(()=>buildRequest(defaults,'scene | C01, x',bindings.map(b=>({...b,enabled:false}))));assert.throws(()=>buildRequest({...defaults,model:'nai-diffusion-3'},'scene | U01, x',bindings));
 assert.throws(()=>buildRequest(defaults,'scene'+Array.from({length:7},()=> ' | boy').join(''),bindings));
 for(const request of [{...buildRequest(defaults,'scene'),prompt:'scene | C01, x'},{...buildRequest(defaults,'scene | boy'),naiCharacterNegatives:[]},{...buildRequest(defaults,'scene'),naiCharacterNegatives:['x']}])assert.throws(()=>normalizeNAICharacterRequest(request));
});

test('historical request refresh replaces ordered character fields only and retains independent old versions',async()=>{
 const {refreshHistoricalBindingRequest}=await import('../src/generation/generation-options.js');
 const raw='scene | U01, smiling | C01, coat | boy, brown hair',old=buildRequest({...defaults,seed:123},raw,bindings);old.vibes=[{id:'frozen-vibe'}];const before=structuredClone(old);
 const latest=bindings.map(b=>b.shortId==='C01'?{...b,positive:'LATEST',negative:'LATEST UC'}:b),request=refreshHistoricalBindingRequest(old,raw,latest,555);
 assert.deepEqual(old,before);assert.equal(request.seed,555);assert.deepEqual(request.naiCharacters,[bindings[0].positive+', smiling','LATEST, coat','boy, brown hair']);assert.deepEqual(request.naiCharacterNegatives,['blonde hair','LATEST UC','']);
 assert.deepEqual({...request,seed:old.seed,naiCharacters:old.naiCharacters,naiCharacterNegatives:old.naiCharacterNegatives},old);
 const payload=naiPayload(request);assert.equal(payload.parameters.characterPrompts[1].uc,'LATEST UC');assert.equal(payload.parameters.v4_negative_prompt.caption.char_captions[1].char_caption,'LATEST UC');
});
