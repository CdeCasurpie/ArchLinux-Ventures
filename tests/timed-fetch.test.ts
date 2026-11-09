import {describe,expect,it,vi} from 'vitest';
import {createTimedFetch} from '../apps/client/src/features/timed-fetch';

describe('bounded network requests',()=>{
  it('aborts a stalled transport so the sync coordinator can retry',async()=>{
    const stalled:typeof fetch=(_input,init)=>new Promise((_resolve,reject)=>{
      const signal=init?.signal;
      if(signal?.aborted){reject(signal.reason);return}
      signal?.addEventListener('abort',()=>reject(signal.reason),{once:true});
    });
    await expect(createTimedFetch(stalled,20)('http://127.0.0.1:54321/rest/v1/visita')).rejects.toMatchObject({name:'TimeoutError'});
  });
  it('passes a timeout signal to the transport',async()=>{
    const transport=vi.fn<typeof fetch>(async()=>new Response('{}'));
    await createTimedFetch(transport)('http://127.0.0.1:54321/rest/v1/visita');
    expect(transport.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  });
  it('preserves caller cancellation',async()=>{
    const controller=new AbortController();controller.abort();
    const transport=vi.fn<typeof fetch>(async(_input,init)=>{
      expect(init?.signal?.aborted).toBe(true);
      return new Response('{}');
    });
    await createTimedFetch(transport)('http://127.0.0.1',{signal:controller.signal});
  });
});
