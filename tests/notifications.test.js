import test from 'node:test';
import assert from 'node:assert/strict';
import {createNotifications} from '../src/ui/notifications.js';
test('quiet notifications preserve errors and do not modify the host toast API',()=>{
 const calls=[],settings={},host=Object.fromEntries(['info','success','warning','error'].map(type=>[type,(...args)=>calls.push([type,...args])]));
 const original=host.info,notices=createNotifications(settings,host);
 notices.info('start');settings.hideNonErrorNotifications=true;notices.info('queued');notices.success('done');notices.warning('notice');notices.error('failed','title',{escapeHtml:true});
 assert.deepEqual(calls,[['info','start'],['error','failed','title',{escapeHtml:true}]]);assert.equal(host.info,original);
 settings.hideNonErrorNotifications=false;notices.success('saved');assert.equal(calls.at(-1)[1],'saved');
});

test('errors are redacted, bounded, deduplicated and never open a detail panel',async()=>{
 const {createErrorNotifier}=await import('../src/ui/notifications.js');const calls=[],logs=[];let time=1000;
 const show=createErrorNotifier({error:(...args)=>calls.push(args)},{now:()=>time,log:(...args)=>logs.push(args)});
 const error=Object.assign(Error('HTTP 403\nAuthorization: Bearer fixture-secret\n'+ 'long'.repeat(1000)),{stage:'save',cause:Error('token=fixture-cause')});show(error);show(error);show(Object.assign(Error(error.message),{stage:'save'}));assert.equal(calls.length,1);assert.ok(calls[0][0].includes('HTTP 403\n'));assert.ok(calls[0][0].includes('已截断'));assert.ok(calls[0][0].startsWith('[prompt-config:save]'));assert.ok(!calls[0][0].includes('fixture-secret'));assert.ok(!logs[0][1].cause.message.includes('fixture-cause'));assert.equal(calls[0][2].onclick,undefined);assert.equal(calls[0][2].escapeHtml,true);assert.equal(calls[0][2].tapToDismiss,true);
 time+=2500;show(Object.assign(Error(error.message),{stage:'save'}));assert.equal(calls.length,1);show.recover();show(Object.assign(Error(error.message),{stage:'save'}));assert.equal(calls.length,2);
});

test('continuing and alternating fresh Error objects notify once per unresolved fault, recover and remain bounded',async()=>{
 const {createErrorNotifier}=await import('../src/ui/notifications.js');let time=0;const calls=[],show=createErrorNotifier({error:(...args)=>calls.push(args)},{now:()=>time,log:()=>{}});
 for(let i=0;i<6;i++){time+=2100;show(Object.assign(Error('fault A'),{stage:'inject'}),{source:'background'});show(Object.assign(Error('fault B'),{stage:'binding-prepare'}),{source:'background'});}assert.equal(calls.length,2);show.recover({source:'background',stage:'inject'});show(Object.assign(Error('fault A'),{stage:'inject'}),{source:'background'});assert.equal(calls.length,3);
 for(let i=0;i<100;i++)show(Error('distinct '+i));assert.ok(show.activeCount()<=64);const same=Error('same object');show(same);const before=calls.length;show.recover();show(same);assert.equal(calls.length,before+1);
});
