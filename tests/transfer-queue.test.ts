import {describe,expect,it,vi} from 'vitest';
import {TransferQueue,type TransferJob} from '@archforms/application';

describe('persistent transfer scheduling',()=>{
  it('prioritizes a newly visible visit and later resumes the interrupted visit',async()=>{
    const order:string[]=[];let started!:()=>void;
    const gate=new Promise<void>(resolve=>{started=resolve});
    const storage=journal();
    const queue=new TransferQueue(storage,async(id,signal)=>{
      order.push(id);
      if(order.length===1){started();await new Promise<void>((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('preempted')),{once:true}))}
    },()=>true);
    const first=queue.request('old-visible',100);await gate;
    await queue.request('new-visible',100);await first;
    expect(order).toEqual(['old-visible','new-visible','old-visible']);
    expect((await storage.read()).every(job=>job.state==='done')).toBe(true);
  });
  function journal(initial:TransferJob[]=[]){let stored=structuredClone(initial);return {read:async()=>structuredClone(stored),write:async(jobs:TransferJob[])=>{stored=structuredClone(jobs)}}}
  it('stores offline requests and processes the visible visit first on reconnection',async()=>{
    let online=false;const storage=journal();const order:string[]=[];
    const queue=new TransferQueue(storage,async id=>{order.push(id)},()=>online);
    await queue.request('background',1);await queue.request('visible',100);
    expect(order).toEqual([]);expect(await storage.read()).toHaveLength(2);
    online=true;await queue.run();
    expect(order).toEqual(['visible','background']);
    expect((await storage.read()).every(job=>job.state==='done')).toBe(true);
  });
  it('recovers an interrupted running task after reopening',async()=>{
    const storage=journal([{id:'visit',priority:1,state:'running',error:null,done:2,total:3}]);
    const worker=vi.fn(async()=>{});
    await new TransferQueue(storage,worker,()=>true).start();
    expect(worker).toHaveBeenCalledTimes(1);
    expect((await storage.read())[0].state).toBe('done');
  });
  it('persists a failed task without spinning and retries on the next coordinator pass',async()=>{
    const storage=journal();let fail=true;
    const worker=vi.fn(async()=>{if(fail)throw new Error('connection lost')});
    const queue=new TransferQueue(storage,worker,()=>true);
    await expect(queue.request('v')).rejects.toThrow('connection lost');expect(worker).toHaveBeenCalledTimes(1);
    expect((await storage.read())[0]).toMatchObject({state:'error',error:'connection lost'});
    fail=false;await queue.run();expect((await storage.read())[0].state).toBe('done');
  });
});
