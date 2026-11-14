import {execFileSync} from 'node:child_process';
import {test,expect} from '@playwright/test';
import {createClient} from '@supabase/supabase-js';

test('inicio responsive: escritorio original, accesos móviles y nueva visita offline sin duplicación',async({page,context})=>{
 const status=JSON.parse(execFileSync('npx',['supabase','status','-o','json'],{encoding:'utf8'}));
 if(!['localhost','127.0.0.1'].includes(new URL(status.API_URL).hostname))throw new Error('Local only');
 const client=createClient(status.API_URL,status.PUBLISHABLE_KEY||status.ANON_KEY,{auth:{persistSession:false}});
 const email=`home-${crypto.randomUUID()}@archforms.test`,password='Home-local-2026';
 const {data,error}=await client.auth.signUp({email,password,options:{data:{nombre_completo:'Ana Inspectora'}}});expect(error).toBeNull();
 const ids=[crypto.randomUUID(),crypto.randomUUID(),crypto.randomUUID()];
 const visitId=crypto.randomUUID();
 const schema={version:2,sections:[{id:'base',title:'Revisión',fields:[{id:'note',label:'Nota',type:'text'}]}]};
 try{
  for(const [i,id] of ids.entries())expect((await client.from('expediente').insert({id,profesional_id:data.user!.id,nro_expediente:`HOME-${i}`,detalle_obra:['Obra Olivos','Obra Acacias','Obra nueva'][i],ubicacion:`Dirección ${i}`,propietario:'Propietario de ejemplo',checklist_nombre:'Inspección',checklist_esquema_json:schema})).error).toBeNull();
  for(const [i,id] of ids.slice(0,2).entries())expect((await client.from('visita').insert({id:i===0?visitId:crypto.randomUUID(),expediente_id:id,nro_visita:1,fecha:i===0?'2026-11-14':'2026-11-12',checklist_nombre:'Inspección',checklist_esquema_json:schema,checklist_respuestas_json:{},documento_json:{}})).error).toBeNull();
  await page.goto('/');await page.locator('input[name=email]').fill(email);await page.locator('input[name=password]').fill(password);await page.getByRole('button',{name:/Entrar a mi espacio/}).click();
  await expect(page.locator('.desktop-dashboard .hero-card')).toBeVisible();await expect(page.locator('.sidebar')).toBeVisible();await expect(page.locator('.mobile-home')).not.toBeVisible();
  await expect(page.locator('.sidebar-nav').getByRole('button',{name:'Visitas pendientes',exact:true})).toBeVisible();
  await expect(page.locator('.sidebar-nav').getByRole('button',{name:'Ver más',exact:true})).toBeVisible();
  await expect(page.locator('.hero-actions').getByRole('button',{name:'Nuevo expediente',exact:true})).toBeVisible();
  await expect(page.locator('.home-recommendation')).toHaveCount(2);
  await expect(page.locator('.desktop-dashboard .metrics')).toHaveCount(0);
  const heroBackground=await page.locator('.desktop-dashboard .hero-card').evaluate(el=>getComputedStyle(el).backgroundImage);
  await expect(page.locator('.project-card').first()).toContainText('Obra Olivos');
  await page.screenshot({path:'/tmp/opencode/archforms-real-desktop.png',fullPage:true,animations:'disabled'});
  for(const width of [320,390,430,820]){
   await page.setViewportSize({width,height:844});
   await expect(page.locator('.mobile-home')).toBeVisible();await expect(page.locator('.desktop-dashboard')).not.toBeVisible();
   await expect(page.locator('.home-recent-row')).toHaveCount(2);await expect(page.locator('.home-recent-row').first()).toContainText('Obra Olivos');
   await expect(page.locator('.home-recent')).not.toContainText('Dirección');
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   expect(await page.locator('.home-actionbar svg').count()).toBe(0);
   expect(await page.locator('.home-mobile-blue').evaluate(el=>getComputedStyle(el).backgroundImage)).toBe(heroBackground);
   expect(await page.locator('.home-mobile-blue').evaluate(el=>getComputedStyle(el,'::before').content)).not.toBe('none');
  }
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/tmp/opencode/archforms-real-mobile.png',fullPage:true,animations:'disabled'});
  await page.getByRole('button',{name:'Nueva visita',exact:true}).click();
  await expect(page.getByRole('heading',{name:'¿Qué obra vas a visitar?'})).toBeVisible();
  await page.locator('.launcher-work').filter({hasText:'HOME-0'}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button',{name:/Continuar visita 01/}).click();
  await expect(page.getByRole('heading',{name:'Plantilla de visita',exact:true})).toBeVisible();
  await page.locator('.mobile-nav').getByRole('button',{name:/Inicio/}).click();
  await page.getByRole('button',{name:'Nueva visita',exact:true}).click();
  await context.setOffline(true);
  await page.locator('.launcher-work').filter({hasText:'HOME-0'}).click();
  await page.getByRole('button',{name:'Crear otra visita',exact:true}).dblclick();
  await expect(page.locator('.visit-title h1')).toContainText('Visita 02');
  await page.locator('.mobile-nav').getByRole('button',{name:/Inicio/}).click();
  await page.getByRole('button',{name:'Nueva visita',exact:true}).click();
  await page.getByRole('searchbox').fill('HOME-2');
  await page.locator('.launcher-work').click();await expect(page.locator('.visit-title h1')).toContainText('Visita 01');
  await context.setOffline(false);
  await expect.poll(async()=>(await client.from('visita').select('id').eq('expediente_id',ids[0])).data?.length,{timeout:20000}).toBe(2);
  await page.reload();await expect(page.locator('.visit-title h1')).toContainText('Visita 01');
 }finally{
  await context.setOffline(false);
  for(const id of ids)await client.from('expediente').delete().eq('id',id);
  await client.auth.signOut();
 }
});
