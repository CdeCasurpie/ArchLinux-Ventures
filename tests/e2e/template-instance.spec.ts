import {execFileSync} from 'node:child_process';
import {test,expect,type Page} from '@playwright/test';
import {createClient} from '@supabase/supabase-js';

const status=JSON.parse(execFileSync('npx',['supabase','status','-o','json'],{encoding:'utf8'}));
if(!['127.0.0.1','localhost'].includes(new URL(status.API_URL).hostname))throw new Error('Local only');

test('duplicar no cambia el expediente; editar la instancia exige guardar; la visita existente no cambia; publicar mantiene el enlace',async({page})=>{
 const client=createClient(status.API_URL,status.PUBLISHABLE_KEY||status.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const email=`instancia-${crypto.randomUUID()}@archforms.test`,password='Browser-instance-local-2026';
 const {data,error}=await client.auth.signUp({email,password});
 expect(error).toBeNull();
 const owner=data.user!.id;
 const templateId=crypto.randomUUID(),expedienteId=crypto.randomUUID(),visitId=crypto.randomUUID();
 const templateName=`Plantilla ${crypto.randomUUID().slice(0,8)}`;
 const caseLabel=`Obra ${crypto.randomUUID().slice(0,8)}`;
 const instanceName=`${templateName} · expediente`;
 const schema={version:2,sections:[{id:'s',title:'General',fields:[{id:'estado',label:'Estado original',type:'text'}]}]};
 const originalTemplate={id:templateId,profesional_id:owner,codigo:`USR-${crypto.randomUUID().slice(0,8).toUpperCase()}`,nombre:templateName,version:1,esquema_json:schema,activa:true};
 try{
  expect((await client.from('plantilla_checklist').insert(originalTemplate)).error).toBeNull();
  expect((await client.from('expediente').insert({id:expedienteId,profesional_id:owner,nro_expediente:expedienteId,detalle_obra:caseLabel,ubicacion:'Local',checklist_nombre:instanceName,checklist_esquema_json:schema,checklist_template_id:templateId})).error).toBeNull();
  expect((await client.from('visita').insert({id:visitId,expediente_id:expedienteId,nro_visita:1,fecha:'2026-11-12',checklist_nombre:instanceName,checklist_esquema_json:schema,checklist_respuestas_json:{},documento_json:{}})).error).toBeNull();

  async function login(target:Page){
   await target.goto('/');
   await target.locator('input[name=email]').fill(email);
   await target.locator('input[name=password]').fill(password);
   await target.getByRole('button',{name:/Entrar a mi espacio/}).click();
   await expect(target.locator('button.project-card').filter({hasText:caseLabel})).toBeVisible();
  }
  async function openCase(target:Page){
   await target.locator('.sidebar-nav').getByRole('button',{name:'Expedientes'}).click();
   await expect(target.getByRole('heading',{name:'Expedientes'})).toBeVisible();
   const card=target.locator('button.expedient-row').filter({hasText:caseLabel});
   await expect(card).toBeVisible();
   await card.click();
   await expect(target.getByRole('button',{name:'Editar expediente'})).toBeVisible();
  }
  async function editInstance(target:Page,label:string){
   await target.getByRole('button',{name:'Editar expediente'}).click();
   await target.getByRole('button',{name:/Editar checklist de este expediente/}).click();
   await target.locator('.editor-field-toggle').first().click();
   await target.getByLabel('Etiqueta del campo').fill(label);
   await target.getByRole('button',{name:/Usar esta versión/}).click();
   await expect(target.getByText('Cambios en el checklist sin guardar',{exact:false})).toBeVisible();
  }

  await login(page);

  // 1) Duplicar desde la biblioteca crea otra plantilla y no toca el expediente.
  await page.locator('.sidebar-nav').getByRole('button',{name:'Plantillas'}).click();
  await expect(page.getByRole('button',{name:'Volver',exact:true})).toHaveCount(1);
  await page.locator('.library-preview-trigger').first().click();
  await expect(page.getByText('VISTA PREVIA · SOLO LECTURA',{exact:true})).toBeVisible();
  await expect(page.locator('.template-detail-form .checklist-form')).toBeVisible();
  await expect(page.locator('.template-detail-form input:enabled')).toHaveCount(0);
  await page.getByRole('button',{name:'Volver',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Plantillas de checklist'})).toBeVisible();
  const originalCard=page.locator('.library-card').filter({hasText:templateName});
  await expect(originalCard).toBeVisible();
  await originalCard.getByRole('button',{name:`Ver plantilla ${templateName}`,exact:true}).click();
  await expect(page.getByRole('heading',{name:templateName,exact:true})).toBeVisible();
  await expect(page.getByText('Estado original',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Volver',exact:true}).click();
  await originalCard.getByRole('button',{name:'Duplicar',exact:true}).click();
  await page.getByRole('button',{name:'Volver',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Plantillas de checklist'})).toBeVisible();
  await originalCard.getByRole('button',{name:'Duplicar',exact:true}).click();
  await page.getByLabel('Nombre del checklist').fill(`${templateName} copia`);
  await page.getByRole('button',{name:/Crear copia/}).click();
  await expect(page.locator('.library-card').filter({hasText:`${templateName} copia`})).toBeVisible();
  await expect.poll(async()=>(await client.from('plantilla_checklist').select('nombre,version').eq('id',templateId).single()).data)
   .toEqual({nombre:templateName,version:1});
   await expect.poll(async()=>(await client.from('plantilla_checklist').select('id').eq('nombre',`${templateName} copia`).single()).data?.id).toBeTruthy();
   const copyRow=(await client.from('plantilla_checklist').select('id,nombre,version').eq('nombre',`${templateName} copia`).single()).data;
  expect(copyRow).toMatchObject({nombre:`${templateName} copia`,version:1});
  expect(copyRow?.id).not.toBe(templateId);
  const expedienteAfterCopy=(await client.from('expediente').select('checklist_nombre,checklist_template_id,checklist_esquema_json').eq('id',expedienteId).single()).data;
  expect(expedienteAfterCopy).toMatchObject({checklist_nombre:instanceName,checklist_template_id:templateId});

  // 2) Editar la instancia, intentar salir sin guardar y descartar.
  await openCase(page);
  await editInstance(page,'Instancia descartada');
  await page.goBack();
  await expect(page.getByRole('heading',{name:'Hay cambios sin guardar en este expediente'})).toBeVisible();
  await page.getByRole('button',{name:'Seguir editando',exact:true}).click();
  await page.getByRole('button',{name:'Volver',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Hay cambios sin guardar en este expediente'})).toBeVisible();
  await page.getByRole('button',{name:'Descartar',exact:true}).click();
  await expect(page.getByRole('button',{name:'Editar expediente'})).toBeVisible();
  expect((await client.from('expediente').select('checklist_esquema_json').eq('id',expedienteId).single()).data?.checklist_esquema_json)
   .toEqual(schema);

  // 3) Editar la instancia, guardar y comprobar que la visita existente no cambia.
  await editInstance(page,'Instancia editada');
  await page.getByRole('button',{name:/Guardar cambios/}).click();
  await expect(page.getByRole('button',{name:'Editar expediente'})).toBeVisible();
  await expect.poll(async()=>((await client.from('expediente').select('checklist_esquema_json').eq('id',expedienteId).single()).data?.checklist_esquema_json as typeof schema | undefined)?.sections[0].fields[0].label)
   .toBe('Instancia editada');
  expect((await client.from('visita').select('checklist_esquema_json').eq('id',visitId).single()).data?.checklist_esquema_json)
   .toEqual(schema);
  const afterSave=(await client.from('expediente').select('checklist_nombre,checklist_template_id').eq('id',expedienteId).single()).data;
  expect(afterSave).toMatchObject({checklist_nombre:instanceName,checklist_template_id:templateId});

  // 4) La próxima visita usa la instancia guardada.
  await page.getByRole('button',{name:/Nueva visita/}).click();
  await expect(page.getByText('Instancia editada',{exact:true})).toBeVisible();
  await expect.poll(async()=>{
   const rows=(await client.from('visita').select('checklist_esquema_json').eq('expediente_id',expedienteId).order('nro_visita',{ascending:false}).limit(1)).data;
   return (rows?.[0]?.checklist_esquema_json as typeof schema | undefined)?.sections[0].fields[0].label;
  }).toBe('Instancia editada');

  // 5) Publicar la instancia crea una plantilla y conserva el enlace original.
  await page.getByRole('button',{name:'Volver',exact:true}).click();
  await expect(page.getByRole('button',{name:/Publicar checklist como plantilla/})).toBeVisible();
  await page.getByRole('button',{name:/Publicar checklist como plantilla/}).click();
  await expect(page.getByText(/Plantilla publicada/)).toBeVisible();
  await expect.poll(async()=>{
   const rows=(await client.from('plantilla_checklist').select('id,nombre,esquema_json').eq('profesional_id',owner).eq('nombre',instanceName)).data;
   return rows?.length??0;
  }).toBe(1);
  const published=(await client.from('plantilla_checklist').select('id,nombre,esquema_json').eq('profesional_id',owner).eq('nombre',instanceName).single()).data;
  expect((published?.esquema_json as typeof schema | undefined)?.sections[0].fields[0].label).toBe('Instancia editada');
  expect(published?.id).not.toBe(templateId);
  expect((await client.from('expediente').select('checklist_template_id').eq('id',expedienteId).single()).data?.checklist_template_id).toBe(templateId);
  await page.locator('.sidebar-nav').getByRole('button',{name:'Plantillas'}).click();
  await expect(page.locator('.library-card').filter({hasText:instanceName})).toBeVisible();
 }finally{
  await client.from('visita').delete().eq('expediente_id',expedienteId);
  await client.from('expediente').delete().eq('id',expedienteId);
  await client.from('plantilla_checklist').delete().eq('profesional_id',owner);
  await client.auth.signOut();
 }
});
