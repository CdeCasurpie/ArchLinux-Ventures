import {afterAll,describe,expect,it} from 'vitest';
import {createClient,type SupabaseClient} from '@supabase/supabase-js';

const url=process.env.TEST_SUPABASE_URL;
const key=process.env.TEST_SUPABASE_KEY;
if(!url||!key)throw new Error('Run npm run test:integration:local with Supabase local running.');
const endpoint=new URL(url);
if(endpoint.protocol!=='http:'||!['127.0.0.1','localhost'].includes(endpoint.hostname))throw new Error('Remote integration endpoints are forbidden.');
const clients:SupabaseClient[]=[];
async function account(label:string){
 const client=createClient(url!,key!,{auth:{persistSession:false,autoRefreshToken:false}});
 const email=`${label}-${crypto.randomUUID()}@archforms.test`;
 const {data,error}=await client.auth.signUp({email,password:'Prueba-segura-2026',options:{data:{nombre_completo:`Usuario ${label}`}}});
 if(error||!data.session)throw error??new Error('La confirmación de correo debe estar desactivada en local.');
 clients.push(client);return {client,user:data.user!};
}
describe('RLS por propietario',()=>{
 afterAll(async()=>{await Promise.all(clients.map(client=>client.auth.signOut()))});
 it('crea el perfil y aísla expedientes entre dos cuentas',async()=>{
  const a=await account('A'),b=await account('B');
  const {data:profile,error:profileError}=await a.client.from('profesional').select().single();
  expect(profileError).toBeNull();expect(profile.id).toBe(a.user.id);
  const id=crypto.randomUUID();
  const {error:insertError}=await a.client.from('expediente').insert({id,profesional_id:a.user.id,nro_expediente:'PRUEBA-RLS',ubicacion:'Lima',checklist_nombre:'Base',checklist_esquema_json:{version:1,secciones:[]}});
  expect(insertError).toBeNull();
  const {data:foreignRows,error:foreignError}=await b.client.from('expediente').select().eq('id',id);
  expect(foreignError).toBeNull();expect(foreignRows).toEqual([]);
  const visitId=crypto.randomUUID();
  const {error:visitError}=await a.client.from('visita').insert({id:visitId,expediente_id:id,nro_visita:1,fecha:'2026-09-17',checklist_nombre:'Base',checklist_esquema_json:{version:1,sections:[]},checklist_respuestas_json:{},documento_json:{version:1,blocks:[]}});
  expect(visitError).toBeNull();
  const {data:foreignVisits}=await b.client.from('visita').select().eq('id',visitId);expect(foreignVisits).toEqual([]);
  const {data:catalog,error:catalogError}=await b.client.from('plantilla_checklist').select('codigo').is('profesional_id',null);
  expect(catalogError).toBeNull();expect(catalog?.length).toBeGreaterThanOrEqual(3);
  const {error:spoofError}=await b.client.from('expediente').insert({profesional_id:a.user.id,nro_expediente:'SUPLANTADO',ubicacion:'Lima',checklist_nombre:'Base',checklist_esquema_json:{}});
  expect(spoofError).not.toBeNull();
 },30_000);
});
