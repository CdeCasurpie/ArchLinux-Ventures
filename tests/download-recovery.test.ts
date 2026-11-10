import 'fake-indexeddb/auto';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {IndexedMediaOutboxRepository} from '@archforms/data-local';
import type {RemoteCaptureState} from '@archforms/application';

const disk=vi.hoisted(()=>({files:new Map<string,string>(),groups:[] as any[]}));
vi.mock('@capacitor/filesystem',()=>({Directory:{Data:'DATA'},Filesystem:{
  async readFile({path}:{path:string}){if(!disk.files.has(path))throw new Error('missing');return {data:disk.files.get(path)}},
  async writeFile({path,data}:{path:string;data:string}){disk.files.set(path,data)},
}}));
vi.mock('@capacitor/preferences',()=>({Preferences:{get:async()=>({value:null}),set:async()=>{}}}));
vi.mock('../apps/client/src/features/lab-storage',()=>({
  loadCaptureGroups:async()=>disk.groups,
  loadCaptureGroup:async(id:string)=>disk.groups.find(group=>group.id===id),
  updateCaptureGroupSyncStatus:async()=>{},
  upsertRemoteGroup:async(group:any)=>{disk.groups=[{...group,createdAt:group.iniciadoAt,syncStatus:'synced'}]},
}));
import {pullVisitaFromCloud} from '../apps/client/src/features/media-sync';

describe('download recovery and local availability',()=>{
  beforeEach(()=>{disk.files.clear();disk.groups=[]});
  it('reuses verified partial files, refreshes clean metadata and repairs corruption',async()=>{
    const bytes=new Uint8Array([1,2,3]);
    const checksum='039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81';
    const remote:RemoteCaptureState={
      grupos:[{id:'g',visita_id:'v',orden:1,audio_archivo_id:'audio',transcripcion_original:'first',audio_duracion_ms:10,iniciado_at:new Date().toISOString(),confirmado_at:null}],
      fotos:['p1','p2'].map((id,index)=>({id,visita_id:'v',grupo_captura_id:'g',archivo_id:id,orden_en_grupo:index+1,capturada_at:new Date().toISOString()})),
      archivos:['p1','p2','audio'].map(id=>({id,tipo:id==='audio'?'AUDIO':'IMAGEN',storage_key:id,mime_type:id==='audio'?'audio/wav':'image/jpeg',tamanio_bytes:3,checksum_sha256:checksum})),
    };
    let fail=true;
    const download=vi.fn(async(key:string)=>{if(key==='p2'&&fail)throw new Error('connection lost');return bytes});
    const reader={fetchCapture:async()=>remote,downloadBytes:download};
    const outbox=new IndexedMediaOutboxRepository(`download-${crypto.randomUUID()}`);
    await expect(pullVisitaFromCloud(outbox,reader,'v')).rejects.toThrow('connection lost');
    expect(disk.files.has('archforms-lab/photos/p1.jpg')).toBe(true);
    expect(disk.groups).toHaveLength(0);
    fail=false;download.mockClear();
    await pullVisitaFromCloud(outbox,reader,'v');
    expect(download.mock.calls.map(call=>call[0])).toEqual(['p2','audio']);
    expect(disk.groups[0].photos).toHaveLength(2);
    download.mockClear();remote.grupos[0].transcripcion_original='updated';
    await pullVisitaFromCloud(outbox,reader,'v');
    expect(download).not.toHaveBeenCalled();
    expect(disk.groups[0].transcripcion).toBe('updated');
    disk.files.set('archforms-lab/photos/p1.jpg',btoa('bad content'));
    await pullVisitaFromCloud(outbox,reader,'v');
    expect(download.mock.calls.map(call=>call[0])).toEqual(['p1']);
    expect(disk.groups[0].photos).toHaveLength(2);
  });
});
