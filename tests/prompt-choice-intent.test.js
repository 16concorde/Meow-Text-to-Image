import test from 'node:test';
import assert from 'node:assert/strict';
import {createChoiceIntent} from '../src/ui/prompt-choice-intent.js';
test('A to B to A stays at the latest intent through old confirmations and external refresh',()=>{
 let confirmed='A';const choice=createChoiceIntent(()=>confirmed),b=choice.begin('B'),a=choice.begin('A');assert.equal(choice.value(),'A');confirmed='B';choice.refresh({published:true});choice.settle(b);assert.equal(choice.value(),'A');confirmed='A';choice.settle(a);assert.equal(choice.value(),'A');assert.equal(choice.hasPending(),false);assert.equal(choice.begin('A'),null);
});
test('an old equal-valued confirmation cannot clear a later intent with intermediate requests still queued',()=>{
 let value='A';const choice=createChoiceIntent(()=>value),b=choice.begin('B'),a=choice.begin('A'),last=choice.begin('B');value='B';choice.refresh({published:true});choice.settle(b);value='A';choice.settle(a);assert.equal(choice.value(),'B');value='B';choice.settle(last);assert.equal(choice.hasPending(),false);
});
test('old failure cannot roll back a new success; latest definite failure preserves retry while unknown keeps desired',()=>{
 let confirmed='A';const c=createChoiceIntent(()=>confirmed),b=c.begin('B'),a=c.begin('A');confirmed='A';c.settle(a);c.settle(b,Error('older failure'));assert.equal(c.hasFailure(),false);const next=c.begin('B');c.settle(next,Error('failed'));assert.equal(c.value(),'A');assert.equal(c.state().value,'B');const retry=c.retry();c.settle(retry,Object.assign(Error('unknown'),{status:'unconfirmed'}));assert.equal(c.value(),'B');assert.equal(c.hasPending(),true);confirmed='B';const final=c.retry();c.settle(final);assert.equal(c.hasFailure(),false);
});
test('persisted choice and failed publication remain distinct, and groups do not share their interaction state',()=>{
 let tag='full',orientation='';const t=createChoiceIntent(()=>tag),o=createChoiceIntent(()=>orientation),a=t.begin('binding'),b=o.begin('BG');tag='binding';t.settle(a,Object.assign(Error('publish failed'),{stage:'publish'}));assert.equal(t.value(),'binding');assert.equal(t.hasFailure(),true);assert.equal(o.value(),'BG');t.refresh({published:true});assert.equal(t.hasFailure(),false);assert.equal(o.hasPending(),true);orientation='BG';o.settle(b);
});
