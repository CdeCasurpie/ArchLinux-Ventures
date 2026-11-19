import {execFileSync} from 'node:child_process';
import {test,expect} from '@playwright/test';
import {createClient} from '@supabase/supabase-js';

test('logo móvil, menú de cuenta discreto y borrado en cascada recuperable tras fallo de Storage',async({page})=>{
 const status=JSON.parse(execFileSync('npx',['supabase','status','-o','json'],{encoding:'utf8'}));
 if(!['127.0.0.1','localhost'].includes(new URL(status.API_URL).hostname))throw new Error('Local only');
 const client=createClient(status.API_URL,status.PUBLISHABLE_KEY||status.ANON_KEY,{auth:{persistSession:false}});
 const email=`delete-ui-${crypto.randomUUID()}@archforms.test`,password='Delete-browser-local-2026';
 const signup=await client.auth.signUp({email,password,options:{data:{nombre_completo:'Karen'}}});expect(signup.error).toBeNull();
 const owner=signup.data.user!.id,caseId=crypto.randomUUID(),visitId=crypto.randomUUID(),path=`${owner}/${visitId}/${crypto.randomUUID()}`;
 const schema={version:2,sections:[]};
 try{
  expect((await client.from('expediente').insert({id:caseId,profesional_id:owner,nro_expediente:caseId,ubicacion:'Eliminar',checklist_nombre:'Test',checklist_esquema_json:schema})).error).toBeNull();
  expect((await client.from('visita').insert({id:visitId,expediente_id:caseId,nro_visita:1,fecha:'2026-11-19',checklist_nombre:'Test',checklist_esquema_json:schema,checklist_respuestas_json:{},documento_json:{}})).error).toBeNull();
  expect((await client.storage.from('visita-media').upload(path,new Uint8Array([1,2,3]),{contentType:'image/jpeg'})).error).toBeNull();
  await page.setViewportSize({width:390,height:844});await page.goto('/');await page.locator('input[name=email]').fill(email);await page.locator('input[name=password]').fill(password);await page.getByRole('button',{name:/Entrar a mi espacio/}).click();
  const logo=page.locator('.home-greeting-brand img');await expect(logo).toBeVisible();await expect(logo).toHaveAttribute('alt','ArchForms');
  await expect.poll(()=>logo.evaluate(img=>(img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect(page.getByRole('heading',{name:'Hola, Karen'})).toBeVisible();
  await page.screenshot({path:'/tmp/opencode/archforms-home-logo.png'});
  for(const width of [320,390]){await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);const box=(await logo.boundingBox())!;const greeting=(await page.locator('.home-greeting').boundingBox())!;expect(box.x+box.width).toBeLessThanOrEqual(greeting.x)}
  await page.getByRole('button',{name:'Mi perfil',exact:true}).click();
  await expect(page.getByRole('button',{name:'Eliminar cuenta',exact:true})).not.toBeVisible();
  await page.getByLabel('Opciones de la cuenta',{exact:true}).click();
  await page.screenshot({path:'/tmp/opencode/archforms-profile-options.png'});
  await page.getByRole('button',{name:'Eliminar cuenta',exact:true}).click();
  const dialog=page.getByRole('alertdialog');await expect(dialog).toContainText('no se puede deshacer');
  await expect(dialog.getByRole('button',{name:'Eliminar definitivamente'})).toBeDisabled();
  await dialog.getByRole('button',{name:'Conservar cuenta'}).click();await expect(dialog).not.toBeVisible();
  await page.getByLabel('Opciones de la cuenta',{exact:true}).click();await page.getByRole('button',{name:'Eliminar cuenta',exact:true}).click();
  await dialog.getByLabel('Escribe ELIMINAR para confirmar').fill('ELIMINAR');
  const storageRoute='**/storage/v1/object/visita-media';
  await page.route(storageRoute,route=>route.request().method()==='DELETE'?route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({message:'Prueba: servicio no disponible'})}):route.continue());
  await dialog.getByRole('button',{name:'Eliminar definitivamente'}).click();await expect(dialog.getByRole('alert')).toContainText('No se completó el borrado');
  expect((await client.auth.getUser()).data.user?.id).toBe(owner);
  await page.unroute(storageRoute);await dialog.getByRole('button',{name:'Eliminar definitivamente'}).click();
  await expect(page.getByRole('button',{name:/Entrar a mi espacio/})).toBeVisible();
  expect((await client.auth.signInWithPassword({email,password})).error).not.toBeNull();
  const cached=await page.evaluate(async owner=>{
   const {workspaceLocal,local}=await import('/src/platform.ts' as string);
   return {workspace:await workspaceLocal.read(owner),profile:await local.read(owner),keys:Object.keys(localStorage).filter(key=>key.includes(owner))};
  },owner);
  expect(cached.workspace.expedientes).toEqual([]);expect(cached.workspace.visitas).toEqual([]);expect(cached.workspace.pending).toEqual([]);expect(cached.profile).toEqual({profile:null,pending:null});expect(cached.keys).toEqual([]);
 }finally{await client.storage.from('visita-media').remove([path]);await client.from('expediente').delete().eq('id',caseId);await client.auth.signOut()}
});
