/** Keyset pagination avoids Supabase's default row cap and offset shifts. */
export async function readPages<T extends {id:string}>(
  request:(after:string|null,size:number)=>PromiseLike<{data:T[]|null;error:unknown}>,
  size=200,
):Promise<T[]>{
  const rows:T[]=[];
  let cursor:string|null=null;
  for(;;){
    const {data,error}=await request(cursor,size);
    if(error)throw error;
    if(!data)throw new Error('Missing remote page');
    for(const row of data){
      if(cursor!==null&&row.id<=cursor)throw new Error('Unordered remote page');
      cursor=row.id;rows.push(row);
    }
    if(data.length<size)return rows;
  }
}
