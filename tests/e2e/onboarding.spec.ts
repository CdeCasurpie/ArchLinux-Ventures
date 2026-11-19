import {execFileSync} from 'node:child_process';
import {test,expect,type Page} from '@playwright/test';
import {createClient} from '@supabase/supabase-js';

const status=JSON.parse(execFileSync('npx',['supabase','status','-o','json'],{encoding:'utf8'}));
if(!['127.0.0.1','localhost'].includes(new URL(status.API_URL).hostname))throw new Error('Local only');
const client=()=>createClient(status.API_URL,status.PUBLISHABLE_KEY||status.ANON_KEY,{auth:{persistSession:false}});
test.use({reducedMotion:'reduce'});

async function coach(page:Page,id:string){
 const guide=page.locator('.tutorial-coachmark');
 await expect(guide).toHaveAttribute('data-step',id);await expect(guide).toBeVisible();
 await expect(page.locator('[data-tour-highlighted]')).toHaveCount(1);
 expect((await guide.locator('p').innerText()).length).toBeLessThan(160);
 await expect.poll(async()=>{
  const card=await guide.boundingBox(),target=await page.locator('[data-tour-highlighted]').boundingBox();
  if(!card||!target)return false;
  const viewport=page.viewportSize()!;
  const overlaps=card.x<target.x+target.width&&card.x+card.width>target.x&&card.y<target.y+target.height&&card.y+card.height>target.y;
  return card.x>=0&&card.y>=0&&card.x+card.width<=viewport.width&&card.y+card.height<=viewport.height&&!overlaps;
 }).toBe(true);
 return guide;
}

test('recorrido contextual: expediente obligatorio, ayudas breves junto al objetivo y PDF',async({page})=>{
 const email=`tutorial-${crypto.randomUUID()}@archforms.test`,password='Tutorial-local-2026';
 const remote=client(),number=`TUT-${crypto.randomUUID().slice(0,8)}`;
 await page.setViewportSize({width:390,height:844});
 try{
  await page.goto('/');await page.getByRole('button',{name:'Crear una cuenta',exact:true}).click();
  await page.locator('input[name=name]').fill('Arq. Nombre Apellido');await page.locator('input[name=email]').fill(email);await page.locator('input[name=password]').fill(password);await page.getByRole('button',{name:/Crear cuenta/}).click();
  await coach(page,'welcome');
  await expect(page.locator('.tutorial-coachmark')).not.toContainText('Una vez por obra');
  await page.screenshot({path:'/tmp/opencode/tutorial-mobile-welcome.png'});
  await page.locator('[data-tour-highlighted]').click();
  await coach(page,'expediente');await expect(page.getByRole('heading',{name:'Nuevo expediente',exact:true})).toBeVisible();
  await page.locator('.tutorial-coachmark').getByRole('button',{name:/Entendido/}).click();
  await coach(page,'web');await page.locator('.tutorial-coachmark').getByRole('button',{name:/Siguiente/}).click();
  await coach(page,'number');await page.locator('input[name=nro_expediente]').fill(number);
  await page.screenshot({path:'/tmp/opencode/tutorial-mobile-number.png'});
  await page.locator('.tutorial-coachmark').getByRole('button',{name:/Siguiente/}).click();
  await coach(page,'address');await page.locator('input[name=ubicacion]').fill('Jr. Medrano Silva 411');
  for(const [name,value] of Object.entries({urbanizacion:'Urb. Ejemplo',manzana:'A',lote:'5',zonificacion:'RDM'}))await page.locator(`input[name=${name}]`).fill(value);
  await page.locator('.tutorial-coachmark').getByRole('button',{name:/Siguiente/}).click();
  await coach(page,'templates');await page.locator('.template-option').filter({hasText:'Seguridad y salud en obra'}).click();
  await page.locator('.tutorial-coachmark').getByRole('button',{name:'Omitir paso',exact:true}).click();
  await coach(page,'reuse');await page.locator('.tutorial-coachmark').getByRole('button',{name:/Siguiente/}).click();
  const create=await coach(page,'create');await expect(create.getByRole('button',{name:'Omitir paso',exact:true})).toHaveCount(0);await expect(create.getByRole('button',{name:/Siguiente/})).toHaveCount(0);
  await expect(page.getByText(/Paso \d de 3/)).toHaveCount(0);
  await page.locator('[data-tour-highlighted]').click();
  await coach(page,'visit');await page.screenshot({path:'/tmp/opencode/tutorial-mobile-visit.png'});await page.locator('[data-tour-highlighted]').click();
  await coach(page,'checklist');await page.getByLabel('Avance de obra',{exact:false}).fill('10');
  for(const step of ['swipe','capture','photos','audio','processing','summary','conclude']){
   await page.locator('.tutorial-coachmark').getByRole('button',{name:/Siguiente/}).click();await coach(page,step);
   if(step==='swipe'){
    await page.locator('.visit-body').evaluate(element=>{
     const start=new Touch({identifier:1,target:element,clientX:300,clientY:300});
     const end=new Touch({identifier:1,target:element,clientX:100,clientY:302});
     element.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,touches:[start],changedTouches:[start]}));
     element.dispatchEvent(new TouchEvent('touchend',{bubbles:true,touches:[],changedTouches:[end]}));
    });
    await expect(page.locator('.visit-tab.active')).toContainText('Captura');
   }
   if(step==='audio')await page.screenshot({path:'/tmp/opencode/tutorial-mobile-audio.png'});
  }
  await page.locator('[data-tour-highlighted]').click();
  await coach(page,'review');await page.locator('.tutorial-coachmark').getByRole('button',{name:/Siguiente/}).click();
  await coach(page,'pdf');const download=page.waitForEvent('download');await page.locator('[data-tour-highlighted]').click();await (await download).saveAs('/tmp/opencode/archforms-no-signature-heading.pdf');
  await page.locator('.tutorial-coachmark').getByRole('button',{name:/Terminar recorrido/}).click();await expect(page.locator('.tutorial-coachmark')).toHaveCount(0);
  expect((await remote.auth.signInWithPassword({email,password})).error).toBeNull();
  await expect.poll(async()=>(await remote.from('expediente').select('urbanizacion,manzana,lote,zonificacion').eq('nro_expediente',number).single()).data).toEqual({urbanizacion:'Urb. Ejemplo',manzana:'A',lote:'5',zonificacion:'RDM'});
  await page.reload();await expect(page.getByRole('button',{name:'Generar PDF',exact:true})).toBeVisible();await expect(page.locator('.tutorial-coachmark')).toHaveCount(0);
 }finally{await remote.from('expediente').delete().eq('nro_expediente',number);await remote.auth.signOut()}
});

test('cuentas existentes: ayuda visible en escritorio y móvil, reinicio manual y omitir todo',async({page})=>{
 const remote=client(),email=`existing-${crypto.randomUUID()}@archforms.test`,password='Existing-local-2026';
 expect((await remote.auth.signUp({email,password})).error).toBeNull();
 await page.goto('/');await page.locator('input[name=email]').fill(email);await page.locator('input[name=password]').fill(password);await page.getByRole('button',{name:/Entrar a mi espacio/}).click();
 await expect(page.locator('.tutorial-coachmark')).toHaveCount(0);
 for(const width of [1280,390,320]){
  await page.setViewportSize({width,height:844});
  const help=page.getByRole('button',{name:'Ver tutorial',exact:true}).filter({visible:true});
  await expect(help).toHaveCount(1);await help.click();await coach(page,'welcome');
  await page.screenshot({path:`/tmp/opencode/tutorial-welcome-${width}.png`});
  await page.locator('.tutorial-coachmark').getByRole('button',{name:'Omitir todo',exact:true}).click();await expect(page.locator('.tutorial-coachmark')).toHaveCount(0);
 }
 await page.reload();await expect(page.getByRole('button',{name:'Ver tutorial',exact:true}).filter({visible:true})).toBeVisible();await expect(page.locator('.tutorial-coachmark')).toHaveCount(0);
 await remote.auth.signOut();
});
