import {describe,expect,it,vi} from 'vitest';
import {initReportDocument} from '@archforms/domain';
import {loadReportPhotos} from '../apps/client/src/features/report-photos';

describe('PDF photo requirements',()=>{
  const doc=initReportDocument([{id:'group',photoIds:['selected'],comment:'text'}]);
  it('reads only images referenced in this document',async()=>{
    const read=vi.fn(async()=>'data:image/jpeg;base64,YQ==');
    const result=await loadReportPhotos(doc,[{photos:[{id:'selected',path:'selected.jpg',mimeType:'image/jpeg'},{id:'unused',path:'missing.jpg',mimeType:'image/jpeg'}]}],read);
    expect(Object.keys(result)).toEqual(['selected']);expect(read).toHaveBeenCalledTimes(1);
  });
  it('rejects missing and unreadable images rather than producing an incomplete PDF',async()=>{
    await expect(loadReportPhotos(doc,[],async()=>'' )).rejects.toThrow('Falta descargar');
    await expect(loadReportPhotos(doc,[{photos:[{id:'selected',path:'x',mimeType:'image/jpeg'}]}],async()=>{throw new Error('missing')})).rejects.toThrow('No se pudo leer');
  });
});
