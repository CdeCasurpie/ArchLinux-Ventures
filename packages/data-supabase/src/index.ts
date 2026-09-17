import { createClient,type SupabaseClient } from '@supabase/supabase-js';
import { ConflictError,type Profile,type Pending } from '@archforms/domain';
import type { RemoteRepository } from '@archforms/application';
import type {Database} from '@archforms/contracts';
export {createClient};
export class SupabaseProfileRepository implements RemoteRepository {
 constructor(private client:SupabaseClient<Database>){}
 async fetch():Promise<Profile>{
  const {data,error}=await this.client.from('profesional').select('id,email,nombre_completo,cargo,nro_colegiatura,updated_at').single();
  if(error)throw new Error(error.message);return data as Profile;
 }
 async push(op:Pending):Promise<Profile>{
  const {data,error}=await this.client.rpc('sync_profesional',{base_updated_at:op.base,nombre:op.edit.nombre_completo,cargo_nuevo:op.edit.cargo??'',colegiatura:op.edit.nro_colegiatura??''});
  if(error?.code==='40001')throw new ConflictError();
  if(error)throw new Error(error.message);return data as Profile;
 }
}
