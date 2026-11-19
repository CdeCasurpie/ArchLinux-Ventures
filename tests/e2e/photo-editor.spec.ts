import {execFileSync} from 'node:child_process';
import {test,expect,type Page} from '@playwright/test';
import {createClient} from '@supabase/supabase-js';

test('foto: descartar, dibujar y recortar offline; subir y descargar versión editada',async({page,context,browser})=>{
 test.setTimeout(120000);
 const status=JSON.parse(execFileSync('npx',['supabase','status','-o','json'],{encoding:'utf8'}));
 if(!['127.0.0.1','localhost'].includes(new URL(status.API_URL).hostname))throw new Error('Local only');
 const client=createClient(status.API_URL,status.PUBLISHABLE_KEY||status.ANON_KEY,{auth:{persistSession:false}});
 const email=`photo-${crypto.randomUUID()}@archforms.test`,password='Photo-local-2026';
 const {data,error}=await client.auth.signUp({email,password});expect(error).toBeNull();
 const owner=data.user!.id,caseId=crypto.randomUUID(),visitId=crypto.randomUUID(),groupId=crypto.randomUUID(),photoId=crypto.randomUUID(),audioId=crypto.randomUUID();
 const label=`Fotos ${caseId}`,stamp=new Date().toISOString(),paths=[audioId,photoId].map(id=>`${owner}/${visitId}/${id}`);
 async function enter(target:Page){
  await target.goto('/');await target.locator('input[name=email]').fill(email);await target.locator('input[name=password]').fill(password);await target.getByRole('button',{name:/Entrar a mi espacio/}).click();
  await target.getByRole('button').filter({hasText:label}).filter({visible:true}).first().click();await target.getByRole('button',{name:'Abrir',exact:true}).click();
  await target.getByRole('button',{name:/3 Resumen/}).click();
  await target.getByRole('button',{name:'Actualizar archivos',exact:true}).click();
  await expect(target.getByRole('button',{name:'Ver foto completa'})).toBeVisible();
 }
 try{
  await page.goto('/');
  const jpeg=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=640;canvas.height=480;const c=canvas.getContext('2d')!;c.fillStyle='#e5eaf0';c.fillRect(0,0,640,480);c.fillStyle='#486c84';c.fillRect(80,80,400,280);return canvas.toDataURL('image/jpeg').split(',')[1]});
  const photo=Buffer.from(jpeg,'base64'),audio=Buffer.from([1,2,3]);
  const {createHash}=await import('node:crypto');const checksum=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
  const schema={version:2,sections:[]};
  expect((await client.from('expediente').insert({id:caseId,profesional_id:owner,nro_expediente:caseId,detalle_obra:label,ubicacion:'Local',checklist_nombre:'Test',checklist_esquema_json:schema})).error).toBeNull();
  expect((await client.from('visita').insert({id:visitId,expediente_id:caseId,nro_visita:1,fecha:'2026-11-19',checklist_nombre:'Test',checklist_esquema_json:schema,checklist_respuestas_json:{},documento_json:{}})).error).toBeNull();
  for(const [i,bytes] of [audio,photo].entries())expect((await client.storage.from('visita-media').upload(paths[i],bytes,{contentType:i?'image/jpeg':'audio/wav'})).error).toBeNull();
  const payload={id:groupId,visita_id:visitId,profesional_id:owner,iniciado_at:stamp,confirmado_at:stamp,transcripcion:'Hallazgo con foto',audio:{id:audioId,remote_path:paths[0],mime_type:'audio/wav',size_bytes:audio.length,checksum:checksum(audio),duration_ms:100},fotos:[{id:photoId,archivo_id:photoId,remote_path:paths[1],mime_type:'image/jpeg',size_bytes:photo.length,checksum:checksum(photo),orden_en_grupo:1,capturada_at:stamp}]};
  expect((await client.rpc('sync_capture_v1',{operation_id:crypto.randomUUID(),payload})).error).toBeNull();
  await page.setViewportSize({width:390,height:844});await enter(page);
  await page.getByRole('button',{name:'Ver foto completa'}).click();
  await page.getByRole('button',{name:'Editar',exact:true}).click();
  const canvas=page.locator('.photo-canvas-wrap canvas');await expect(canvas).toBeVisible();
  await expect.poll(()=>canvas.evaluate(c=>(c as HTMLCanvasElement).width)).toBe(640);
  let box=(await canvas.boundingBox())!;
  await page.mouse.move(box.x+30,box.y+30);await page.mouse.down();await page.mouse.move(box.x+100,box.y+100,{steps:12});await page.mouse.up();
  await page.getByRole('button',{name:'Descartar',exact:true}).click();
  expect((await client.from('foto').select('archivo_id').eq('id',photoId).single()).data?.archivo_id).toBe(photoId);
  await context.setOffline(true);
  await page.getByRole('button',{name:'Editar',exact:true}).click();await expect.poll(()=>canvas.evaluate(c=>(c as HTMLCanvasElement).width)).toBe(640);
  box=(await canvas.boundingBox())!;await page.mouse.move(box.x+30,box.y+30);await page.mouse.down();await page.mouse.move(box.x+120,box.y+120,{steps:12});await page.mouse.up();
  await page.getByRole('button',{name:'Recortar',exact:true}).click();
  await page.mouse.move(box.x+box.width*.1,box.y+box.height*.1);await page.mouse.down();await page.mouse.move(box.x+box.width*.8,box.y+box.height*.8,{steps:12});await page.mouse.up();
  await page.screenshot({path:'/tmp/opencode/photo-editor-mobile.png'});
  await page.getByRole('button',{name:'Aplicar recorte',exact:true}).click();
  await expect.poll(()=>canvas.evaluate(c=>(c as HTMLCanvasElement).width)).toBeLessThan(640);
  await page.getByRole('button',{name:'Guardar',exact:true}).click();await expect(page.getByRole('button',{name:'Editar',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Cerrar foto',exact:true}).click();
  expect((await client.from('foto').select('archivo_id').eq('id',photoId).single()).data?.archivo_id).toBe(photoId);
  await context.setOffline(false).catch(()=>{});
  await expect.poll(async()=>(await client.from('foto').select('archivo_id').eq('id',photoId).single()).data?.archivo_id,{timeout:30000}).not.toBe(photoId);
  const saved=(await client.from('foto').select('archivo_id').eq('id',photoId).single()).data!;paths.push(`${owner}/${visitId}/${saved.archivo_id}`);
  const replica=await browser.newContext({viewport:{width:1280,height:900}});
  try{const other=await replica.newPage();await enter(other);await other.getByRole('button',{name:'Ver foto completa'}).click();
   await expect.poll(()=>other.getByAltText('Foto completa del hallazgo').evaluate(img=>(img as HTMLImageElement).naturalWidth)).toBeLessThan(640);
   expect(await other.getByAltText('Foto completa del hallazgo').evaluate(img=>(img as HTMLImageElement).naturalWidth)).toBeGreaterThan(16);
   await other.screenshot({path:'/tmp/opencode/photo-viewer-desktop.png'});
  }finally{await replica.close()}
 }finally{
  await context.setOffline(false).catch(()=>{});
  await client.rpc('sync_delete_workspace_v1',{operation_id:crypto.randomUUID(),entity:'expediente',entity_id:caseId});
  await client.storage.from('visita-media').remove(paths);await client.auth.signOut();
 }
});
