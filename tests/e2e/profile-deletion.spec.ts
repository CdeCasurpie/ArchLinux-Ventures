import {execFileSync} from 'node:child_process';
import {test,expect} from '@playwright/test';
import {createClient} from '@supabase/supabase-js';

const status=JSON.parse(execFileSync('npx',['supabase','status','-o','json'],{encoding:'utf8'}));
if(!['127.0.0.1','localhost'].includes(new URL(status.API_URL).hostname))throw new Error('Local only');
test.use({permissions:['camera'],launchOptions:{args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']}});

test('firma con cámara integrada, reutilización del perfil y eliminación múltiple por pulsación prolongada',async({page})=>{
 const client=createClient(status.API_URL,status.PUBLISHABLE_KEY||status.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const email=`profile-${crypto.randomUUID()}@archforms.test`,password='Browser-profile-local-2026';
 const {data,error}=await client.auth.signUp({email,password});expect(error).toBeNull();
 const owner=data.user!.id,caseId=crypto.randomUUID(),label=`Obra ${caseId.slice(0,8)}`;
 const schema={version:2,sections:[{id:'s',title:'General',fields:[{id:'note',label:'Nota',type:'text'}]}]};
 expect((await client.from('expediente').insert({id:caseId,profesional_id:owner,nro_expediente:caseId,detalle_obra:label,ubicacion:'Local',checklist_nombre:'Inspección',checklist_esquema_json:schema})).error).toBeNull();
 const ids=[crypto.randomUUID(),crypto.randomUUID()];
 for(const [i,id] of ids.entries())expect((await client.from('visita').insert({id,expediente_id:caseId,nro_visita:i+1,fecha:'2026-11-14',checklist_nombre:'Inspección',checklist_esquema_json:schema,checklist_respuestas_json:{},documento_json:{}})).error).toBeNull();
 try{
  await page.goto('/');await page.locator('input[name=email]').fill(email);await page.locator('input[name=password]').fill(password);await page.getByRole('button',{name:/Entrar a mi espacio/}).click();
  await expect(page.locator('button.project-card').filter({hasText:label})).toBeVisible();
  await page.locator('.profile-card').click();
  await page.getByLabel('Nombre completo').fill('Ana Firma');await page.getByLabel('Cargo',{exact:true}).fill('Supervisora');await page.getByLabel('Colegiatura / identificación').fill('CAP 123');
  await page.getByRole('button',{name:'Con imagen',exact:true}).click();
  await expect(page.locator('input[capture]')).toHaveCount(0);
  await page.getByRole('button',{name:'Tomar foto',exact:true}).click();
  const camera=page.getByRole('dialog',{name:'Fotografiar firma'});
  await expect(camera.getByRole('button',{name:'Tomar foto',exact:true})).toBeEnabled();
  await camera.getByRole('button',{name:'Tomar foto',exact:true}).click();await expect(camera.getByAltText('Revisión de la firma capturada')).toBeVisible();
  await camera.getByRole('button',{name:'Volver a tomar'}).click();
  await expect(camera.getByRole('button',{name:'Tomar foto',exact:true})).toBeEnabled();
  await camera.getByRole('button',{name:'Tomar foto',exact:true}).click();await camera.getByRole('button',{name:'Usar esta firma'}).click();
  await expect(camera).not.toBeVisible();await expect(page.getByAltText('Firma de Ana Firma')).toBeVisible();
  await page.getByRole('button',{name:'Guardar perfil y firma'}).click();
  await expect.poll(async()=>(await client.from('profesional').select('firma_imagen').eq('id',owner).single()).data?.firma_imagen?.startsWith('data:image/jpeg;base64,')).toBe(true);
  await page.locator('.sidebar-nav').getByRole('button',{name:'Expedientes'}).click();await page.locator('.expedient-row').filter({hasText:label}).click();
  await page.locator('.visit-row').first().getByRole('button',{name:'Abrir',exact:true}).click();await page.getByRole('button',{name:/Resumen/}).click();
  await page.getByRole('button',{name:'Añadirme como firmante'}).click();
  await expect(page.getByAltText('Firma de Ana Firma')).toBeVisible();
  await expect(page.getByLabel('Colegiatura / identificación')).toHaveValue('CAP 123');
  await page.getByRole('button',{name:'Volver',exact:true}).click();
  await page.locator('.visit-row').first().getByRole('button',{name:/Eliminar visita/}).click();
  await page.getByRole('alertdialog').getByRole('button',{name:'Conservar visita',exact:true}).click();
  await expect(page.locator('.visit-row').first().getByRole('button',{name:'Abrir',exact:true})).toBeVisible();
  const row=page.locator('.visit-row').first();const point=await row.getByRole('heading').boundingBox();
  await page.mouse.move(point!.x+20,point!.y+10);await page.mouse.down();await page.waitForTimeout(650);await page.mouse.up();
  await expect(page.getByText('1 seleccionadas',{exact:true})).toBeVisible();
  await page.locator('.visit-row').nth(1).getByRole('checkbox').check();
  await page.getByRole('button',{name:'Eliminar seleccionadas'}).click();
  await expect(page.getByRole('alertdialog')).toContainText('no se puede deshacer');await page.getByRole('button',{name:'Conservar visitas'}).click();await expect(page.locator('.visit-row')).toHaveCount(2);
  await page.getByRole('button',{name:'Eliminar seleccionadas'}).click();await page.getByRole('alertdialog').getByRole('button',{name:'Eliminar visitas',exact:true}).click();await expect(page.locator('.visit-row')).toHaveCount(0);
  await expect.poll(async()=>(await client.from('visita').select('id').eq('expediente_id',caseId)).data?.length).toBe(0);
  await page.getByRole('button',{name:'Eliminar expediente',exact:true}).click();await expect(page.getByRole('alertdialog')).toContainText('todo su contenido');await page.getByRole('alertdialog').getByRole('button',{name:'Eliminar expediente',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Expedientes',exact:true})).toBeVisible();
  await expect.poll(async()=>(await client.from('expediente').select('id').eq('id',caseId)).data?.length).toBe(0);
 }finally{await client.from('expediente').delete().eq('id',caseId);await client.auth.signOut()}
});
