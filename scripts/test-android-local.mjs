import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { PDFDocument } from 'pdf-lib';

// Opt-in physical-device check. Never clears app data or changes Wi-Fi settings.
const serial=process.env.ANDROID_SERIAL;
if(!serial)throw new Error('Set ANDROID_SERIAL to the authorized device');
const adb=(...args)=>execFileSync('adb',['-s',serial,...args],{encoding:'utf8'}).trim();
const status=JSON.parse(execFileSync('npx',['supabase','status','-o','json'],{encoding:'utf8'}));
const endpoint=new URL(status.API_URL);
if(endpoint.protocol!=='http:'||!['127.0.0.1','localhost'].includes(endpoint.hostname)||endpoint.port!=='54321')throw new Error('Default local Supabase required');
const client=createClient(endpoint.origin,status.PUBLISHABLE_KEY||status.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
let attached;
async function attach(){
  if(attached)await attached.close();
  for(let attempt=0;attempt<50;attempt++){
    try{
      const pid=adb('shell','pidof','com.archventures.archforms');
      adb('forward','tcp:9223',`localabstract:webview_devtools_remote_${pid}`);
      attached=await chromium.connectOverCDP('http://127.0.0.1:9223');
      const page=attached.contexts()[0].pages()[0];
      if(page){page.setDefaultTimeout(20000);return page}
    }catch{}
    await delay(200);
  }
  throw new Error('Unable to attach to debug WebView');
}
const email=`android-${crypto.randomUUID()}@archforms.test`,password='Android-local-test-2026';
const caseId=crypto.randomUUID(),visitId=crypto.randomUUID(),label=`Android ${caseId}`;
let tunnelRemoved=false;
let offlineSession;
try{
  adb('reverse','tcp:54321','tcp:54321');
  adb('shell','input','keyevent','KEYCODE_WAKEUP');
  adb('shell','wm','dismiss-keyguard');
  let page=await attach();
  // Preserve existing signed-in sessions rather than silently logging users out.
  if(await page.locator('.profile-card').count()){
    const identity=await page.locator('.profile-card').textContent();
    if(!/android-[a-f0-9-]+@archforms\.test/.test(identity??''))throw new Error('Existing user session: stop without signing it out');
    await page.locator('.profile-card').dispatchEvent('click');
    await page.getByRole('button',{name:'Cerrar sesión',exact:true}).dispatchEvent('click');
  }
  await expect(page.locator('input[name=email]')).toBeVisible();
  const {data,error}=await client.auth.signUp({email,password});
  if(error||!data.session)throw error??new Error('Local account creation failed');
  const schema={version:1,sections:[{id:'base',title:'Prueba Android',fields:[{id:'note',label:'Nota',type:'text'}]}]};
  const inserted=await client.from('expediente').insert({id:caseId,profesional_id:data.user.id,nro_expediente:caseId,detalle_obra:label,ubicacion:'Prueba física',checklist_nombre:'Android',checklist_esquema_json:schema});
  if(inserted.error)throw inserted.error;
  const visit=await client.from('visita').insert({id:visitId,expediente_id:caseId,nro_visita:1,fecha:'2026-11-09',checklist_nombre:'Android',checklist_esquema_json:schema,checklist_respuestas_json:{},documento_json:{}});
  if(visit.error)throw visit.error;
  await page.locator('input[name=email]').fill(email);
  await page.locator('input[name=password]').fill(password);
  await page.locator('form').evaluate(form=>form.requestSubmit());
  async function openVisit(target){
    await target.locator('button.project-card').filter({hasText:label}).dispatchEvent('click');
    await target.getByRole('button',{name:'Abrir',exact:true}).dispatchEvent('click');
    await expect(target.locator('.check-item textarea')).toBeVisible();
  }
  await openVisit(page);
  adb('reverse','--remove','tcp:54321');tunnelRemoved=true;
  // Removing adb reverse does not close existing keep-alive sockets. Also block
  // WebView network explicitly to prevent a false offline result.
  offlineSession=await page.context().newCDPSession(page);
  await offlineSession.send('Network.enable');
  await offlineSession.send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
  await page.locator('.check-item textarea').fill('Persistido en SQLite Android sin backend');
  await expect(page.getByText('Guardado en este dispositivo',{exact:true}).first()).toBeVisible();
  expect((await client.from('visita').select('checklist_respuestas_json').eq('id',visitId).single()).data?.checklist_respuestas_json).toEqual({});
  console.log('PASS: local save with backend unreachable; server unchanged');
  adb('shell','am','force-stop','com.archventures.archforms');
  adb('shell','am','start','-n','com.archventures.archforms/.MainActivity');
  page=await attach();
  await openVisit(page);
  await expect(page.locator('.check-item textarea')).toHaveValue('Persistido en SQLite Android sin backend');
  console.log('PASS: persisted session, SQLite answers and pending queue survive force-stop');
  adb('reverse','tcp:54321','tcp:54321');tunnelRemoved=false;
  await page.evaluate(()=>window.dispatchEvent(new Event('online')));
  await expect.poll(async()=>(await client.from('visita').select('checklist_respuestas_json').eq('id',visitId).single()).data?.checklist_respuestas_json.note,{timeout:60000}).toBe('Persistido en SQLite Android sin backend');
  console.log('PASS: reconnection sends persisted pending operation to local Postgres');
  await mkdir('/tmp/opencode/android-validation',{recursive:true});
  await writeFile('/tmp/opencode/android-validation/checklist.png',execFileSync('adb',['-s',serial,'exec-out','screencap','-p']));
  await page.getByRole('button',{name:/3 Resumen/}).dispatchEvent('click');
  await page.getByRole('button',{name:/Concluir visita/}).dispatchEvent('click');
  await expect(page.getByRole('button',{name:'Generar PDF',exact:true})).toBeVisible();
  offlineSession=await page.context().newCDPSession(page);
  await offlineSession.send('Network.enable');
  await offlineSession.send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
  for(let generation=0;generation<2;generation++){
    await page.getByRole('button',{name:'Generar PDF',exact:true}).dispatchEvent('click');
    await expect(page.getByText('PDF generado en este dispositivo. No se sube a la nube.',{exact:true})).toBeVisible({timeout:30000});
    await expect(page.getByRole('button',{name:'Generar PDF',exact:true})).toBeEnabled();
    const bytes=execFileSync('adb',['-s',serial,'exec-out','cat',`/sdcard/Documents/ArchForms/Informe-${caseId}-V01.pdf`]);
    const pdf=await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThan(0);
  }
  console.log('PASS: two offline native PDF generations saved readable PDFs in Documents/ArchForms');
  console.log('Physical device checks completed. Synthetic account remains signed in.');
}finally{
  if(offlineSession)await offlineSession.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1}).catch(()=>{});
  if(tunnelRemoved)adb('reverse','tcp:54321','tcp:54321');
  if(attached)await attached.close();
  await client.auth.signOut();
  // Keep synthetic data for inspection on the device; no user records are removed.
}
