import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import {MediaSyncEngine,exponentialBackoff,planCapturePull,type MediaOutboxRepository,type MediaRemoteRepository} from '@archforms/application';
import {IndexedMediaOutboxRepository} from '@archforms/data-local';
import type {EntityOutboxItem,GrupoCapturaPayload,MediaOutboxItem,RemoteArchivo,RemoteFoto,RemoteGrupo} from '@archforms/domain';

const NOW='2026-09-23T00:00:00.000Z';

function media(id:string,visita='visita-1',grupo='grupo-1'):MediaOutboxItem{
 return {id,entity_type:'foto',entity_id:id,grupo_id:grupo,visita_id:visita,local_path:`archforms-lab/photos/${id}.jpg`,mime_type:'image/jpeg',size_bytes:1000,checksum:`sha-${id}`,bucket_path:null,attempts:0,last_error:null,next_retry:null,status:'pending',created_at:NOW};
}

function entity(id:string,depends:string[]= ['m-1']):EntityOutboxItem{
 const payload:GrupoCapturaPayload={id,visita_id:'visita-1',profesional_id:'owner-1',iniciado_at:NOW,confirmado_at:NOW,transcripcion:null,fotos:[],audio:{id:'a-1',local_path:'x',remote_path:null,mime_type:'audio/wav',duration_ms:1000,size_bytes:10,checksum:'sha-a',created_at:NOW}};
 return {id,entity_type:'grupo_captura',payload:JSON.stringify(payload),depends_on:depends,attempts:0,last_error:null,next_retry:null,status:'pending',created_at:NOW};
}

/** In-memory outbox mirroring the SQLite semantics (gating, resetStuck). */
class MemoryOutbox implements MediaOutboxRepository{
 media=new Map<string,MediaOutboxItem>();
 entities=new Map<string,EntityOutboxItem>();
 async pendingMedia(now:string){return [...this.media.values()].filter(m=>['pending','error'].includes(m.status)&&(!m.next_retry||m.next_retry<=now))}
 async markMediaUploading(id:string){this.set(id,{status:'uploading'})}
 async markMediaSynced(id:string,bucketPath:string){this.set(id,{status:'synced',bucket_path:bucketPath,attempts:0,last_error:null,next_retry:null})}
 async markMediaError(id:string,error:string,nextRetry:string){const m=this.req(id);this.media.set(id,{...m,status:'error',attempts:m.attempts+1,last_error:error,next_retry:nextRetry})}
 async pendingEntities(now:string){
  return [...this.entities.values()].filter(e=>['pending','error'].includes(e.status)&&(!e.next_retry||e.next_retry<=now)
   &&e.depends_on.every(dep=>this.media.get(dep)?.status==='synced'));
 }
 async markEntitySyncing(id:string){const e=this.ereq(id);this.entities.set(id,{...e,status:'syncing'})}
 async markEntitySynced(id:string){this.entities.delete(id)}
 async markEntityError(id:string,error:string,nextRetry:string){const e=this.ereq(id);this.entities.set(id,{...e,status:'error',attempts:e.attempts+1,last_error:error,next_retry:nextRetry})}
 async mediaStatus(id:string){return this.media.get(id)??null}
 async entityStatus(id:string){return this.entities.get(id)??null}
 async forceRetry(ids:string[]){
  for(const id of ids){
   const m=this.media.get(id);if(m)this.media.set(id,{...m,status:'pending',attempts:0,next_retry:null});
   const e=this.entities.get(id);if(e)this.entities.set(id,{...e,status:'pending',attempts:0,next_retry:null});
  }
 }
 async enqueueMedia(item:Omit<MediaOutboxItem,'attempts'|'last_error'|'next_retry'|'status'>){this.media.set(item.id,{...item,attempts:0,last_error:null,next_retry:null,status:'pending'})}
 async enqueueEntity(item:Omit<EntityOutboxItem,'attempts'|'last_error'|'next_retry'|'status'>){this.entities.set(item.id,{...item,attempts:0,last_error:null,next_retry:null,status:'pending'})}
 async collectGarbage(){return [] as string[]}
 async resetStuck(){
  for(const [id,m] of this.media)if(m.status==='uploading')this.media.set(id,{...m,status:'pending',next_retry:null});
  for(const [id,e] of this.entities)if(e.status==='syncing')this.entities.set(id,{...e,status:'pending',next_retry:null});
 }
 private req(id:string){const m=this.media.get(id);if(!m)throw new Error(`missing media ${id}`);return m}
 private set(id:string,patch:Partial<MediaOutboxItem>){this.media.set(id,{...this.req(id),...patch})}
 private ereq(id:string){const e=this.entities.get(id);if(!e)throw new Error(`missing entity ${id}`);return e}
}

class FakeRemote implements MediaRemoteRepository{
 uploads=0; pushes=0; existing=new Map<string,string>(); failUploads=0; failPushes=0;
 pushedPayloads:GrupoCapturaPayload[]=[];
 async checkExists(_visita:string,mediaId:string,_checksum:string){return this.existing.get(mediaId)??null}
 async upload(visita:string,mediaId:string){this.uploads+=1;if(this.failUploads>0){this.failUploads-=1;throw new Error('red inestable')}const path=`${visita}/${mediaId}`;this.existing.set(mediaId,path);return path}
 async pushGrupo(payload:GrupoCapturaPayload){this.pushes+=1;this.pushedPayloads.push(payload);if(this.failPushes>0){this.failPushes-=1;throw new Error('db no disponible')}}
}

const readFile=async()=>new Uint8Array([1,2,3]);

describe('MediaSyncEngine (Iteración 4)',()=>{
 it('backoff exponencial acotado con jitter',()=>{
  expect(exponentialBackoff(0)).toBeGreaterThanOrEqual(2_000);
  expect(exponentialBackoff(0)).toBeLessThan(3_000);
  expect(exponentialBackoff(100)).toBeLessThanOrEqual(301_000);
 });

 it('fase 2 bloqueada hasta que todo su media esté synced',async()=>{
  const outbox=new MemoryOutbox();await outbox.enqueueMedia(media('m-1'));await outbox.enqueueEntity(entity('g-1'));
  const remote=new FakeRemote();const engine=new MediaSyncEngine(outbox,remote,readFile);
  await engine.run();
  // Primera corrida sube el binario y luego pushea la entidad ya desbloqueada.
  expect(remote.uploads).toBe(1);expect(remote.pushes).toBe(1);
 });

 it('no pushea la entidad si su media sigue pendiente',async()=>{
  const outbox=new MemoryOutbox();
  // Entidad que depende de un media que nunca se encola: pushGrupo jamás debe correr.
  await outbox.enqueueEntity(entity('g-1',['m-fantasma']));
  const remote=new FakeRemote();const engine=new MediaSyncEngine(outbox,remote,readFile);
  await engine.run();
  expect(remote.uploads).toBe(0);expect(remote.pushes).toBe(0);
 });

 it('run concurrente es un no-op: no duplica subidas',async()=>{
  const outbox=new MemoryOutbox();await outbox.enqueueMedia(media('m-1'));
  const remote=new FakeRemote();const engine=new MediaSyncEngine(outbox,remote,readFile);
  await Promise.all([engine.run(),engine.run()]);
  expect(remote.uploads).toBe(1);
 });

 it('reintento con backoff y sin duplicar tras fallo de red',async()=>{
  const outbox=new MemoryOutbox();await outbox.enqueueMedia(media('m-1'));
  const remote=new FakeRemote();remote.failUploads=1;
  const engine=new MediaSyncEngine(outbox,remote,readFile);
  await engine.run();
  const failed=await outbox.mediaStatus('m-1');
  expect(failed?.status).toBe('error');expect(failed?.attempts).toBe(1);
  expect(failed?.next_retry).not.toBeNull();
  // Aún no es tiempo de reintentar: segunda corrida no toca la red.
  const uploadsBefore=remote.uploads;
  await engine.run();
  expect(remote.uploads).toBe(uploadsBefore);
 });

 it('segunda corrida no re-sube lo ya sincronizado (idempotencia)',async()=>{
  const outbox=new MemoryOutbox();await outbox.enqueueMedia(media('m-1'));
  const remote=new FakeRemote();const engine=new MediaSyncEngine(outbox,remote,readFile);
  await engine.run();
  expect((await outbox.mediaStatus('m-1'))?.status).toBe('synced');
  await engine.run();
  expect(remote.uploads).toBe(1);
 });

 it('recupera items atascados en uploading tras resetStuck',async()=>{
  const outbox=new MemoryOutbox();await outbox.enqueueMedia(media('m-1'));
  await outbox.markMediaUploading('m-1'); // simula app muerta a mitad de subida
  const remote=new FakeRemote();const engine=new MediaSyncEngine(outbox,remote,readFile);
  await engine.run(); // pendingMedia no lo devuelve: queda huérfano
  expect(remote.uploads).toBe(0);
  await outbox.resetStuck();
  await engine.run();
  expect(remote.uploads).toBe(1);
  expect((await outbox.mediaStatus('m-1'))?.status).toBe('synced');
 });
});

describe('IndexedMediaOutboxRepository (web)',()=>{
 it('encola, bloquea entidades por dependencias y recupera atascados',async()=>{
  const outbox=new IndexedMediaOutboxRepository(`test-${crypto.randomUUID()}`);
  await outbox.enqueueMedia(media('m-1'));
  await outbox.enqueueEntity(entity('g-1'));
  // Entidad desbloqueada solo cuando su media está synced
  expect((await outbox.pendingEntities(NOW)).map(e=>e.id)).toEqual([]);
  await outbox.markMediaUploading('m-1');
  expect((await outbox.pendingMedia(NOW)).map(m=>m.id)).toEqual([]);
  await outbox.resetStuck();
  expect((await outbox.pendingMedia(NOW)).map(m=>m.id)).toEqual(['m-1']);
  await outbox.markMediaSynced('m-1','visita-1/m-1');
  expect((await outbox.pendingEntities(NOW)).map(e=>e.id)).toEqual(['g-1']);
  // Idempotencia de enqueue: no duplica ni resetea
  await outbox.enqueueMedia(media('m-1'));
  expect((await outbox.mediaStatus('m-1'))?.status).toBe('synced');
  // Backoff: un error con next_retry futuro no se reclama todavía
  await outbox.enqueueMedia(media('m-2'));
  await outbox.markMediaError('m-2','boom',new Date(Date.now()+60_000).toISOString());
  expect((await outbox.pendingMedia(NOW)).map(m=>m.id)).toEqual([]);
  // GC: borra synced de hace +7 días y devuelve sus paths
  const old={...media('m-3'),created_at:'2026-09-01T00:00:00.000Z'} as MediaOutboxItem;
  await outbox.enqueueMedia(old);
  await outbox.markMediaSynced('m-3','visita-1/m-3');
  const garbage=await outbox.collectGarbage(NOW);
  expect(garbage).toEqual([old.local_path]);
  expect(await outbox.mediaStatus('m-3')).toBeNull();
 });

 it('mueve un grupo completo de extremo a extremo con el engine',async()=>{
  const outbox=new IndexedMediaOutboxRepository(`test-${crypto.randomUUID()}`);
  await outbox.enqueueMedia(media('m-1'));await outbox.enqueueEntity(entity('g-1'));
  const remote=new FakeRemote();const engine=new MediaSyncEngine(outbox,remote,readFile);
  await engine.run();
  expect(remote.uploads).toBe(1);expect(remote.pushes).toBe(1);
  expect(await outbox.pendingEntities(NOW)).toEqual([]);
 });
});

describe('Payload vivo (transcripción tardía)',()=>{
 it('el push usa el estado actual, no el JSON congelado al encolar',async()=>{
  const outbox=new MemoryOutbox();await outbox.enqueueMedia(media('m-1'));await outbox.enqueueEntity(entity('g-1'));
  const remote=new FakeRemote();
  // El payload congelado trae transcripcion:null; el resolver devuelve el texto real.
  const frozen=JSON.parse(entity('g-1').payload) as GrupoCapturaPayload;
  const live:GrupoCapturaPayload={...frozen,transcripcion:'hallazgo confirmado'};
  const engine=new MediaSyncEngine(outbox,remote,readFile,undefined,async()=>live);
  await engine.run();
  expect(remote.pushes).toBe(1);
  expect(remote.pushedPayloads[0].transcripcion).toBe('hallazgo confirmado');
 });

 it('una transcripción que llega después re-pushea sin duplicar',async()=>{
  const outbox=new MemoryOutbox();await outbox.enqueueMedia(media('m-1'));await outbox.enqueueEntity(entity('g-1'));
  const remote=new FakeRemote();
  let text:string|null=null;
  const resolver=async()=>{
   const frozen=JSON.parse((await outbox.pendingEntities(NOW))[0]?.payload??(await outbox.mediaStatus('m-1'),JSON.stringify({transcripcion:null})));
   return {...frozen,id:'g-1',visita_id:'visita-1',profesional_id:'owner-1',fotos:[],audio:{id:'a-1',local_path:'x',remote_path:'visita-1/a-1',mime_type:'audio/wav',duration_ms:1,size_bytes:1,checksum:'s',created_at:NOW},transcripcion:text} as GrupoCapturaPayload;
  };
  const engine=new MediaSyncEngine(outbox,remote,readFile,undefined,resolver);
  await engine.run();
  expect(remote.pushedPayloads[0].transcripcion).toBeNull();
  // Llega la transcripción: se marca sucio y se re-pushea con el texto.
  text='llegó tarde';
  await outbox.enqueueEntity(entity('g-1'));
  await engine.run();
  expect(remote.pushes).toBe(2);
  expect(remote.pushedPayloads[1].transcripcion).toBe('llegó tarde');
 });
});

describe('planCapturePull (unión nube → local)',()=>{
 const archivo=(id:string):RemoteArchivo=>({id,tipo:'IMAGEN',storage_key:`o/v/${id}`,mime_type:'image/jpeg',tamanio_bytes:10,checksum_sha256:`sha-${id}`});
 const grupo=(id:string):RemoteGrupo=>({id,visita_id:'v-1',orden:1,audio_archivo_id:'a-1',transcripcion_original:'t',audio_duracion_ms:1000,iniciado_at:NOW,confirmado_at:NOW});
 const foto=(id:string,aid:string):RemoteFoto=>({id,visita_id:'v-1',grupo_captura_id:'g-1',archivo_id:aid,orden_en_grupo:1,capturada_at:NOW});
 const audioArchivo:RemoteArchivo={id:'a-1',tipo:'AUDIO',storage_key:'o/v/a-1',mime_type:'audio/wav',tamanio_bytes:20,checksum_sha256:'sha-a'};

 it('grupo desconocido: upsert + descarga todo',async()=>{
  const plan=planCapturePull(
   [],
   {grupos:[grupo('g-1')],fotos:[foto('f-1','m-1')],archivos:[archivo('m-1'),audioArchivo]},
  );
  expect(plan.upserts.map(u=>u.grupo.id)).toEqual(['g-1']);
  expect(plan.upserts[0].archivos.map(a=>a.id).sort()).toEqual(['a-1','m-1']);
  expect(plan.skippedDirty).toEqual([]);
 });

 it('grupo con pendientes locales: se omite (local manda)',async()=>{
  const plan=planCapturePull(
   [{groupId:'g-1',mediaIds:['m-1','a-1'],hasPending:true}],
   {grupos:[grupo('g-1')],fotos:[foto('f-1','m-1')],archivos:[archivo('m-1'),audioArchivo]},
  );
  expect(plan.upserts).toEqual([]);
  expect(plan.skippedDirty).toEqual(['g-1']);
 });

 it('grupo limpio conocido: refresca sin re-descargar lo presente',async()=>{
  const plan=planCapturePull(
   [{groupId:'g-1',mediaIds:['m-1','a-1'],hasPending:false}],
   {grupos:[grupo('g-1')],fotos:[foto('f-1','m-1'),foto('f-2','m-2')],archivos:[archivo('m-1'),archivo('m-2'),audioArchivo]},
  );
  expect(plan.upserts.map(u=>u.grupo.id)).toEqual(['g-1']);
  expect(plan.upserts[0].archivos.map(a=>a.id)).toEqual(['m-2']);
 });
});

vi.mock('@capacitor/network', () => ({ Network: { addListener: async () => ({ remove: () => undefined }) } }));
vi.mock('@capacitor/app', () => ({ App: { addListener: async () => ({ remove: () => undefined }) } }));
vi.mock('@capacitor/filesystem', () => ({ Filesystem: {}, Directory: { Data: 'DATA', Documents: 'DOCUMENTS' } }));
vi.mock('@capacitor/preferences', () => ({ Preferences: {} }));

// Grupo en memoria para loadCaptureGroup (el disco ya no se toca en este test).
let mockGroup: any = null;
vi.mock('../apps/client/src/features/lab-storage', async importOriginal => ({
  ...(await importOriginal<typeof import('../apps/client/src/features/lab-storage')>()),
  loadCaptureGroup: async () => mockGroup,
}));

import { notifyTranscriptionReady } from '../apps/client/src/features/media-sync';

describe('re-push de transcripción tardía', () => {
  const livePayload = (): GrupoCapturaPayload => ({
    id: 'g-1', visita_id: 'visita-1', profesional_id: 'owner-1',
    iniciado_at: NOW, confirmado_at: NOW, transcripcion: 'texto tardío',
    fotos: [{
      id: 'm-1', archivo_id: 'm-1', orden_en_grupo: 1, capturada_at: NOW,
      local_path: 'archforms-lab/photos/m-1.jpg', remote_path: 'owner/visita-1/m-1',
      mime_type: 'image/jpeg', size_bytes: 1000, checksum: 'sha-m-1',
    }],
    audio: {
      id: 'a-1', local_path: 'x', remote_path: 'owner/visita-1/a-1',
      mime_type: 'audio/wav', duration_ms: 1000, size_bytes: 10,
      checksum: 'sha-a', created_at: NOW,
    },
  });

  it('reencola la entidad borrada por el sync y el motor la pushea con payload vivo', async () => {
    const outbox = new MemoryOutbox();
    await outbox.enqueueMedia(media('m-1'));
    await outbox.markMediaSynced('m-1', 'owner/visita-1/m-1');
    await outbox.enqueueMedia(media('a-1'));
    await outbox.markMediaSynced('a-1', 'owner/visita-1/a-1');
    await outbox.enqueueEntity(entity('g-1'));
    await outbox.markEntitySynced('g-1'); // DELETE: el grupo ya se subió sin texto
    expect(await outbox.entityStatus('g-1')).toBeNull();

    mockGroup = { id: 'g-1', photos: [{ id: 'm-1' }], audio: { id: 'a-1' } };
    await notifyTranscriptionReady(outbox, 'g-1');

    const requeued = await outbox.entityStatus('g-1');
    expect(requeued).not.toBeNull();
    expect(requeued?.status).toBe('pending');

    const remote = new FakeRemote();
    const engine = new MediaSyncEngine(outbox, remote, async () => new Uint8Array(), undefined, async () => livePayload());
    await engine.run();
    expect(remote.pushes).toBe(1);
    expect(remote.pushedPayloads[0].transcripcion).toBe('texto tardío');
    expect(await outbox.entityStatus('g-1')).toBeNull();
  });

  it('si la entidad sigue encolada no la duplica y respeta el backoff reseteado', async () => {
    const outbox = new MemoryOutbox();
    await outbox.enqueueMedia(media('m-1'));
    await outbox.markMediaSynced('m-1', 'owner/visita-1/m-1');
    await outbox.enqueueEntity(entity('g-1'));
    mockGroup = { id: 'g-1', photos: [{ id: 'm-1' }], audio: { id: 'a-1' } };
    await notifyTranscriptionReady(outbox, 'g-1');
    expect((await outbox.entityStatus('g-1'))?.status).toBe('pending');
  });
});
