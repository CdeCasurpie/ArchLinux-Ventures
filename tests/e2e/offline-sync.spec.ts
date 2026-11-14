import { execFileSync } from 'node:child_process';
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { PDFDocument } from 'pdf-lib';

test('browser saves offline, reconnects and another browser reads server values',async({browser,page,context})=>{
  const status=JSON.parse(execFileSync('npx',['supabase','status','-o','json'],{encoding:'utf8'}));
  if(!['127.0.0.1','localhost'].includes(new URL(status.API_URL).hostname))throw new Error('Local only');
  const client=createClient(status.API_URL,status.PUBLISHABLE_KEY||status.ANON_KEY,{auth:{persistSession:false}});
  const email=`browser-${crypto.randomUUID()}@archforms.test`,password='Browser-test-local-2026';
  const {data,error}=await client.auth.signUp({email,password});
  expect(error).toBeNull();
  const caseId=crypto.randomUUID(),visitId=crypto.randomUUID();
  const schema={version:1,sections:[{id:'base',title:'Prueba',fields:[{id:'note',label:'Nota de prueba',type:'text'}]}]};
  const label=`Browser ${caseId}`;
  try{
    expect((await client.from('expediente').insert({id:caseId,profesional_id:data.user!.id,nro_expediente:caseId,detalle_obra:label,ubicacion:'Local',checklist_nombre:'Prueba',checklist_esquema_json:schema})).error).toBeNull();
    expect((await client.from('visita').insert({id:visitId,expediente_id:caseId,nro_visita:1,fecha:'2026-11-09',checklist_nombre:'Prueba',checklist_esquema_json:schema,checklist_respuestas_json:{},documento_json:{}})).error).toBeNull();
    async function openVisit(target:typeof page){
      await target.goto('/');
      await target.locator('input[name=email]').fill(email);
      await target.locator('input[name=password]').fill(password);
      await target.getByRole('button',{name:/Entrar a mi espacio/}).click();
      await target.locator('button.project-card').filter({hasText:label}).click();
      await target.getByRole('button',{name:'Abrir',exact:true}).click();
      await expect(target.locator('.check-item input')).toBeVisible();
    }
    await openVisit(page);
    await context.setOffline(true);
    await page.locator('.check-item input').fill('Guardado offline desde Chromium');
    await expect(page.getByText('Guardado en este dispositivo',{exact:true}).first()).toBeVisible();
    await expect(page.getByRole('button',{name:'Sincronización: Sin conexión',exact:true})).toBeVisible();
    expect((await client.from('visita').select('checklist_respuestas_json').eq('id',visitId).single()).data?.checklist_respuestas_json).toEqual({});
    await context.setOffline(false);
    await expect.poll(async()=>(await client.from('visita').select('checklist_respuestas_json').eq('id',visitId).single()).data?.checklist_respuestas_json.note,{timeout:15000}).toBe('Guardado offline desde Chromium');
    const other=await browser.newContext();
    try{
      const otherPage=await other.newPage();
      await openVisit(otherPage);
      await expect(otherPage.locator('.check-item input')).toHaveValue('Guardado offline desde Chromium');
    }finally{await other.close()}
    // PDF rendering must not depend on a reachable backend or upload a binary.
    await page.getByRole('button',{name:/3 Resumen/}).click();
    await page.getByRole('button',{name:/Concluir visita/}).click();
    await expect(page.getByRole('button',{name:'Generar PDF',exact:true})).toBeVisible();
    let binaryUploads=0;
    page.on('request',request=>{
      if(request.url().includes('/storage/v1/object/')&&['POST','PUT'].includes(request.method()))binaryUploads++;
    });
    await page.route(`${status.API_URL}/**`,route=>route.abort('connectionrefused'));
    for(let attempt=0;attempt<2;attempt++){
      const downloadPromise=page.waitForEvent('download');
      await page.getByRole('button',{name:'Generar PDF',exact:true}).click();
      const download=await downloadPromise;
      expect(download.suggestedFilename()).toMatch(/\.pdf$/);
      const stream=await download.createReadStream();
      const chunks:Buffer[]=[];
      for await(const chunk of stream!)chunks.push(Buffer.from(chunk));
      const pdf=await PDFDocument.load(Buffer.concat(chunks));
      expect(pdf.getPageCount()).toBeGreaterThan(0);
    }
    expect(binaryUploads).toBe(0);
  }finally{
    await client.from('visita').delete().eq('id',visitId);
    await client.from('expediente').delete().eq('id',caseId);
    await client.auth.signOut();
  }
});
