import {describe,expect,it} from 'vitest';
import {SaveBarrier} from '../apps/client/src/features/save-barrier';

describe('navigation save barrier',()=>{
  it('rejects navigation when a registered form has not persisted its data',async()=>{
    const barrier=new SaveBarrier();
    const remove=barrier.register(async()=>{throw new Error('Storage full')});
    await expect(barrier.flush()).rejects.toThrow('Storage full');
    remove();await expect(barrier.flush()).resolves.toBeUndefined();
  });
});
