import test from 'node:test';
import assert from 'node:assert/strict';
import {persistHostSettings} from '../src/platform/settings-save.js';

// Host listeners are awaited, like ST's EventEmitter, rather than synchronous Node emit.
class Source {
    listeners=new Set();
    on(event,fn){this.listeners.add(fn);}
    removeListener(event,fn){this.listeners.delete(fn);}
    async emit(){for(const fn of [...this.listeners])await fn();}
}
const delay=ms=>new Promise(r=>setTimeout(r,ms));
test('undefined return keeps waiting for a delayed debounced save and readback',async()=>{
    const source=new Source();let stored='OLD',committed=false;
    const job=persistHostSettings({source,event:'saved',timeoutMs:200,verifyPersisted:()=>stored==='NEW',saveNow:async()=>{
        setTimeout(async()=>{stored='NEW';await source.emit();},20);
    }}).then(()=>committed=true);
    await delay(5);assert.equal(committed,false);await job;assert.equal(committed,true);assert.equal(source.listeners.size,0);
});
test('an unrelated event or true return cannot confirm a mismatched persisted value',async()=>{
    const source=new Source();
    await assert.rejects(persistHostSettings({source,event:'saved',timeoutMs:15,verifyPersisted:()=>false,saveNow:async()=>{await source.emit();return true;}}),e=>e.status==='unconfirmed');
    assert.equal(source.listeners.size,0);
});
test('missing events still confirm a matching readback',async()=>{
    await persistHostSettings({saveNow:async()=>{},verifyPersisted:()=>true,timeoutMs:50});
});
test('swallowed errors are unconfirmed; explicit false and reject are failed',async()=>{
    for(const [saveNow,status] of [[async()=>{},'unconfirmed'],[async()=>false,'failed'],[async()=>{throw Error('private host error');},'failed']]){
        const source=new Source();await assert.rejects(persistHostSettings({source,event:'saved',saveNow,verifyPersisted:()=>false,timeoutMs:15}),e=>e.status===status&&!e.message.includes('private'));
        assert.equal(source.listeners.size,0);
    }
});

import {createSettingsSaveCoordinator,jsonEqual,verifyPersistedSettings} from '../src/platform/settings-save.js';
const flush=async()=>{for(let i=0;i<15;i++)await Promise.resolve();};
class Clock{
 timers=new Map();next=0;
 setTimer=fn=>{this.timers.set(++this.next,fn);return this.next;};
 clearTimer=id=>this.timers.delete(id);
 tick(){for(const [id,fn] of [...this.timers]){this.timers.delete(id);fn();}}
}
test('deadline ends waiting while a host request is hung; newer intent stages only after it settles',async()=>{
 const source=new Source(),clock=new Clock();let release,calls=0,slot='OLD',stored='OLD';const commits=[];
 const coordinator=createSettingsSaveCoordinator({source,event:'saved',...clock,saveNow:async()=>{calls++;if(calls===1)await new Promise(r=>release=r);stored=slot;await source.emit();}});
 const a=coordinator.submit({key:'prompt',prepare:()=>slot='A',verifyPersisted:()=>stored==='A',onConfirmed:()=>commits.push('A')});
 const aRejected=assert.rejects(a,e=>e.status==='unconfirmed');await flush();clock.tick();await aRejected;
 const b=coordinator.submit({key:'prompt',prepare:()=>slot='B',verifyPersisted:()=>stored==='B',onConfirmed:()=>commits.push('B')});
 await flush();assert.equal(slot,'A');assert.equal(calls,1);release();await b;assert.equal(stored,'B');assert.deepEqual(commits,['B']);coordinator.dispose();assert.equal(source.listeners.size,0);assert.equal(clock.timers.size,0);
});
test('unconfirmed transaction retains ownership and commits once on a late event',async()=>{
 const source=new Source(),clock=new Clock();let stored=false,commits=0;
 const coordinator=createSettingsSaveCoordinator({source,event:'saved',...clock,saveNow:async()=>{}});
 const job=coordinator.submit({verifyPersisted:()=>stored,onConfirmed:()=>commits++});const rejected=assert.rejects(job,e=>e.status==='unconfirmed');await flush();clock.tick();await rejected;assert.equal(commits,0);assert.equal(source.listeners.size,1);
 stored=true;await source.emit();await flush();await source.emit();assert.equal(commits,1);assert.equal(source.listeners.size,0);coordinator.dispose();
});
test('account replacement, cancellation and disposal discard asynchronous verification',async()=>{
 for(const changeScope of [false,true]){
  const source=new Source(),clock=new Clock();let current=true,release,commits=0;
  const coordinator=createSettingsSaveCoordinator({source,event:'saved',...clock,isCurrent:()=>current,saveNow:async()=>{}});
  const job=coordinator.submit({verifyPersisted:()=>new Promise(r=>release=r),onConfirmed:()=>commits++});const rejected=assert.rejects(job,e=>e.status==='cancelled');await flush();
  if(changeScope){current=false;clock.tick();}else coordinator.dispose();release(true);await rejected;await flush();assert.equal(commits,0);assert.equal(source.listeners.size,0);coordinator.dispose();
 }
});
test('events during readback coalesce without losing the final wake or blocking host listeners',async()=>{
 const source=new Source(),clock=new Clock();let release,checks=0,stored=false;
 const coordinator=createSettingsSaveCoordinator({source,event:'saved',...clock,saveNow:async()=>{}});
 const job=coordinator.submit({verifyPersisted:async()=>{if(++checks===1)return new Promise(r=>release=r);return stored;}});await flush();
 await source.emit();await source.emit();stored=true;release(false);await job;assert.equal(checks,2);coordinator.dispose();
});
test('ordinary field edits are serialized and retained beside an outstanding prompt candidate',async()=>{
 const source=new Source(),clock=new Clock();let release,stored={};const runtime={favorites:[],prompt:'OLD'},view=new Proxy(runtime,{get:(target,key)=>key==='prompt'?'CANDIDATE':target[key]});
 let calls=0;const coordinator=createSettingsSaveCoordinator({source,event:'saved',...clock,saveNow:async()=>{if(++calls===1)await new Promise(r=>release=r);stored=JSON.parse(JSON.stringify(view));await source.emit();}});
 const a=coordinator.submit({key:'prompt',verifyPersisted:()=>stored.prompt==='CANDIDATE'});await flush();runtime.favorites.push('LATEST');const b=coordinator.submit({key:'favorites',verifyPersisted:()=>stored.favorites?.includes('LATEST')});release();await Promise.all([a,b]);assert.deepEqual(stored,{favorites:['LATEST'],prompt:'CANDIDATE'});assert.equal(runtime.prompt,'OLD');coordinator.dispose();
});
test('readback compares full JSON semantics, handles missing paths and never migrates a response',async()=>{
 const expected={treeRevision:4,text:{b:2,a:1},list:['x']};
 assert.ok(jsonEqual(expected,{list:['x'],text:{a:1,b:2},treeRevision:4}));assert.equal(jsonEqual(expected,{...expected,text:{a:1,b:3}}),false);
 for(const data of [{},{settings:'broken'},{settings:'{}'},{settings:JSON.stringify({extension_settings:{id:{promptConfig:{...expected,text:{a:0}}}}})}]){
  let matches=false;try{matches=await verifyPersistedSettings({fetchSettings:async()=>Response.json(data),id:'id',select:s=>s.promptConfig,expected});}catch{}assert.equal(matches,false);
 }
 assert.ok(await verifyPersistedSettings({fetchSettings:async()=>Response.json({settings:JSON.stringify({extension_settings:{id:{promptConfig:expected,unrelated:'private'}}})}),id:'id',select:s=>s.promptConfig,expected}));
});
