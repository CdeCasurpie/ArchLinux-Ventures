import type {SupabaseClient} from '@supabase/supabase-js';
import type {Database} from '@archforms/contracts';
import type {CaptureRemoteReader,RemoteCaptureState} from '@archforms/application';
import type {RemoteArchivo,RemoteGrupo,RemoteFoto} from '@archforms/domain';
import {readPages} from './read-pages';

export class SupabaseCaptureReader implements CaptureRemoteReader{
  constructor(private client:SupabaseClient<Database>){}
  async fetchCapture(visitaIds:string[]):Promise<RemoteCaptureState>{
    if(!visitaIds.length)return {grupos:[],fotos:[],archivos:[]};
    const [grupos,fotos]=await Promise.all([
      readPages((after,size)=>{let q=this.client.from('grupo_captura').select('id,visita_id,orden,audio_archivo_id,transcripcion_original,audio_duracion_ms,iniciado_at,confirmado_at').in('visita_id',visitaIds).order('id').limit(size);if(after)q=q.gt('id',after);return q}),
      readPages((after,size)=>{let q=this.client.from('foto').select('id,visita_id,grupo_captura_id,archivo_id,orden_en_grupo,capturada_at').in('visita_id',visitaIds).order('id').limit(size);if(after)q=q.gt('id',after);return q}),
    ]);
    const ids=[...new Set([...fotos.map(photo=>photo.archivo_id),...grupos.flatMap(group=>group.audio_archivo_id?[group.audio_archivo_id]:[])])];
    const archivos:RemoteArchivo[]=[];
    for(let offset=0;offset<ids.length;offset+=100){
      const {data,error}=await this.client.from('archivo').select('id,tipo,storage_key,mime_type,tamanio_bytes,checksum_sha256').in('id',ids.slice(offset,offset+100));
      if(error)throw error;archivos.push(...data as RemoteArchivo[]);
    }
    return {grupos:grupos.sort((a,b)=>a.orden-b.orden) as RemoteGrupo[],fotos:fotos as RemoteFoto[],archivos};
  }
  async downloadBytes(key:string,signal?:AbortSignal){
    const {data,error}=await this.client.storage.from('visita-media').download(key,{}, {signal});
    if(error||!data)throw error??new Error('Descarga vacía');
    return new Uint8Array(await data.arrayBuffer());
  }
}
