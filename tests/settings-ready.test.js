import test from 'node:test';
import assert from 'node:assert/strict';
import {waitForHostSettingsReady} from '../src/platform/settings-ready.js';
class Source{
 listeners=new Set();
 on(event,fn){this.beforeSubscribe?.();this.listeners.add(fn);}
 removeListener(event,fn){this.listeners.delete(fn);}
 async emit(){for(const fn of [...this.listeners])await fn();}
}
class Clock{
 timers=new Map();next=0;
 setTimer=fn=>{this.timers.set(++this.next,fn);return this.next;};
 clearTimer=id=>this.timers.delete(id);
 tick(){for(const [id,fn] of [...this.timers]){this.timers.delete(id);fn();}}
}
test('live readiness, duplicate/unrelated signals and already-fired event',async()=>{
 const source=new Source(),clock=new Clock();let ready=false,completed=0;
 const options={isReady:()=>ready,source,event:'loaded',...clock};
 const pending=waitForHostSettingsReady(options).then(()=>completed++);
 await source.emit();assert.equal(completed,0);assert.equal(source.listeners.size,1);
 ready=true;await source.emit();await source.emit();await pending;assert.equal(completed,1);assert.equal(clock.timers.size,0);assert.equal(source.listeners.size,0);
 await waitForHostSettingsReady(options);assert.equal(source.listeners.size,0);
});
test('check-subscribe race uses second live binding read',async()=>{
 const source=new Source(),clock=new Clock();let ready=false;source.beforeSubscribe=()=>ready=true;
 await waitForHostSettingsReady({isReady:()=>ready,source,event:'loaded',...clock});assert.equal(source.listeners.size,0);assert.equal(clock.timers.size,0);
});
test('timeout and abort have independent startup status and clean all handles',async()=>{
 for(const cancelled of [false,true]){
  const source=new Source(),clock=new Clock(),controller=new AbortController();
  const pending=waitForHostSettingsReady({isReady:()=>false,source,event:'loaded',signal:controller.signal,...clock});
  const rejected=assert.rejects(pending,e=>e.status===(cancelled?'cancelled':'host-not-ready'));
  if(cancelled)controller.abort();else clock.tick();await rejected;assert.equal(source.listeners.size,0);assert.equal(clock.timers.size,0);
 }
});
test('an absent readiness capability is never treated as ready',async()=>{
 const clock=new Clock();const pending=waitForHostSettingsReady({isReady:()=>undefined,...clock});const rejected=assert.rejects(pending,e=>e.status==='host-not-ready');clock.tick();await rejected;
});
