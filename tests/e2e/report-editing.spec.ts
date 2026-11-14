import {execFileSync} from 'node:child_process';
import {test,expect} from '@playwright/test';
import {createClient} from '@supabase/supabase-js';

test('informe: respuestas, campos, firma y conclusiones offline; retorno conserva contexto y sincroniza',async({page,context})=>{
 const status=JSON.parse(execFileSync('npx',['supabase','status','-o','json'],{encoding:'utf8'}));
 if(!['127.0.0.1','localhost'].includes(new URL(status.API_URL).hostname))throw new Error('Local only');
 const client=createClient(status.API_URL,status.PUBLISHABLE_KEY||status.ANON_KEY,{auth:{persistSession:false}});
 const email=`report-${crypto.randomUUID()}@archforms.test`,password='Report-local-2026';
 const {data,error}=await client.auth.signUp({email,password});expect(error).toBeNull();
 const caseId=crypto.randomUUID(),visitId=crypto.randomUUID(),label=`Informe ${caseId}`;
 const schema={version:2,sections:[{id:'base',title:'Inspección',fields:[{id:'note',label:'Nota',type:'text'}]}]};
 try{
  expect((await client.from('expediente').insert({id:caseId,profesional_id:data.user!.id,nro_expediente:caseId,detalle_obra:label,ubicacion:'Local',total_visitas_programadas:8,checklist_nombre:'Inspección',checklist_esquema_json:schema})).error).toBeNull();
  expect((await client.from('visita').insert({id:visitId,expediente_id:caseId,nro_visita:2,fecha:'2026-11-13',checklist_nombre:'Inspección',checklist_esquema_json:schema,checklist_respuestas_json:{},documento_json:{}})).error).toBeNull();
  await page.goto('/');await page.locator('input[name=email]').fill(email);await page.locator('input[name=password]').fill(password);await page.getByRole('button',{name:/Entrar a mi espacio/}).click();
  await page.locator('button.project-card').filter({hasText:label}).click();await page.getByRole('button',{name:'Abrir',exact:true}).click();
  await page.getByRole('button',{name:/3 Resumen/}).click();await page.getByRole('button',{name:/Concluir visita/}).click();
  await expect(page.getByRole('button',{name:'Generar PDF',exact:true})).toBeVisible();
  await context.setOffline(true);
  await page.locator('.check-item input').fill('Respuesta offline');
  await page.getByPlaceholder('Conclusiones globales de la visita…').fill('Conclusión guardada offline');
  await page.getByRole('button',{name:'Añadir o editar campos de esta visita'}).click();
  await page.locator('.editor-field-toggle').first().click();
  await page.getByLabel('Etiqueta del campo').first().fill('Nota revisada');await page.getByRole('button',{name:/Usar esta versión/}).click();
  await expect(page.getByRole('heading',{name:'Editar checklist de esta visita'})).not.toBeVisible();
  await expect(page.getByText('Nota revisada',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:/Añadir firmante/}).click();
  await page.getByLabel('Nombre completo',{exact:true}).fill('Ana Arquitecta');await page.getByLabel('Cargo',{exact:true}).fill('Supervisora');
  await page.getByLabel('Adjuntar imagen de firma').setInputFiles({name:'firma.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64')});
  await expect(page.getByAltText('Firma de Ana Arquitecta')).toBeVisible();
  await expect(page.getByText('Informe guardado en este dispositivo · se sincroniza al tener conexión',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'← Volver',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Revisión de la visita'})).toBeVisible();
  await expect(page.getByAltText('Firma de Ana Arquitecta')).toBeVisible();
  await expect(page.locator('textarea').filter({visible:true}).first()).toHaveValue('Conclusión guardada offline');
  await page.goForward();
  await expect(page.getByPlaceholder('Conclusiones globales de la visita…')).toHaveValue('Conclusión guardada offline');
  await context.setOffline(false);
  await expect.poll(async()=>{
   const row=(await client.from('visita').select('checklist_respuestas_json,checklist_esquema_json,checklist_completado,documento_json').eq('id',visitId).single()).data;
   const document=row?.documento_json as {signers?:{nombre:string;image?:string}[];blocks?:{type:string;content?:string}[]}|undefined;
   return {note:row?.checklist_respuestas_json.note,label:row?.checklist_esquema_json.sections[0].fields[0].label,complete:row?.checklist_completado,signer:document?.signers?.[0]?.nombre,image:document?.signers?.[0]?.image?.startsWith('data:image/jpeg;base64,'),conclusion:document?.blocks?.find(b=>b.type==='conclusions')?.content};
  },{timeout:20000}).toEqual({note:'Respuesta offline',label:'Nota revisada',complete:false,signer:'Ana Arquitecta',image:true,conclusion:'Conclusión guardada offline'});
  expect((await client.from('expediente').select('checklist_esquema_json').eq('id',caseId).single()).data?.checklist_esquema_json).toEqual(schema);
  await page.reload();
  await expect(page.getByPlaceholder('Conclusiones globales de la visita…')).toHaveValue('Conclusión guardada offline');
  await expect(page.getByAltText('Firma de Ana Arquitecta')).toBeVisible();
  const firstPdf=page.waitForEvent('download');await page.getByRole('button',{name:'Generar PDF',exact:true}).click();await firstPdf;
  await page.locator('.check-item input[type=text]').fill('Corrección posterior al PDF');
  await expect(page.getByText('PDF anterior desactualizado · vuelve a generarlo',{exact:true})).toBeVisible();
  const updatedPdf=page.waitForEvent('download');await page.getByRole('button',{name:'Generar PDF',exact:true}).click();await updatedPdf;
  await expect(page.getByText('PDF anterior desactualizado · vuelve a generarlo',{exact:true})).not.toBeVisible();
 }finally{await context.setOffline(false);await client.from('visita').delete().eq('id',visitId);await client.from('expediente').delete().eq('id',caseId);await client.auth.signOut()}
});
