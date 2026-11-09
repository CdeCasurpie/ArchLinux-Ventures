import {describe,expect,it} from 'vitest';
import {readPages} from '../packages/data-supabase/src/read-pages';

describe('keyset remote reads',()=>{
  it('collects more than 1000 rows without truncation',async()=>{
    const rows=Array.from({length:1201},(_,i)=>({id:String(i).padStart(5,'0')}));
    let requests=0;
    const result=await readPages(async(after,size)=>{
      requests++;
      return {data:rows.filter(row=>after===null||row.id>after).slice(0,size),error:null};
    });
    expect(result).toEqual(rows);expect(requests).toBe(7);
  });
  it('rejects repetition and failed pages instead of accepting a partial snapshot',async()=>{
    await expect(readPages(async()=>({data:[{id:'a'}],error:null}),1)).rejects.toThrow('Unordered');
    await expect(readPages(async()=>({data:null,error:new Error('network')}))).rejects.toThrow('network');
  });
});
