// Landing pública de ArchForms (solo web, sin sesión). Se carga diferida para no
// pesar en la app de campo. Fotos: Unsplash (licencia Unsplash), autoalojadas en /landing.
import { useEffect, useRef } from 'react';
import { Icon } from '../ui/Icon';
import './landing.css';

type Mode = 'login' | 'register';

export default function Landing({ onEnter }: { onEnter: (mode: Mode) => void }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    document.title = 'ArchForms · Informes de visita de obra';
    const nodes = root.current?.querySelectorAll('.lp-reveal') ?? [];
    if (!('IntersectionObserver' in window)) { nodes.forEach(n => n.classList.add('is-in')); return; }
    const io = new IntersectionObserver(entries => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
    }, { rootMargin: '0px 0px -8% 0px' });
    nodes.forEach(n => io.observe(n));
    return () => { io.disconnect(); document.title = 'ArchForms'; };
  }, []);

  return (
    <div className="lp" ref={root}>
      <header className="lp-top">
        <div className="lp-wrap lp-top-inner">
          <a className="lp-brand" href="#inicio" aria-label="ArchForms, inicio"><img src="/archforms-mark.png" alt="" /><span>ArchForms</span></a>
          <nav className="lp-links" aria-label="Secciones">
            <a href="#como-funciona">Cómo funciona</a>
            <a href="#para-quien">Para quién</a>
            <a href="#preguntas">Preguntas</a>
          </nav>
          <div className="lp-top-actions">
            <button className="lp-btn lp-btn-text" onClick={() => onEnter('login')}>Ingresar</button>
            <button className="lp-btn lp-btn-dark lp-btn-sm" onClick={() => onEnter('register')}>Empezar</button>
          </div>
        </div>
      </header>

      <section className="lp-hero" id="inicio">
        <div className="lp-wrap lp-hero-inner">
          <div className="lp-hero-copy">
            <p className="lp-pill">Para arquitectos que inspeccionan y supervisan obra</p>
            <h1>Sal de la obra con el informe listo.</h1>
            <p className="lp-lead">
              Checklist, fotos y notas de voz en un solo lugar. ArchForms los ordena en un informe PDF
              con la cabecera de tu expediente, incluso sin señal.
            </p>
            <div className="lp-actions">
              <button className="lp-btn lp-btn-dark" onClick={() => onEnter('register')}>Crear una cuenta</button>
              <a className="lp-btn lp-btn-text" href="#como-funciona">Cómo funciona <Icon name="chevron" size={18} /></a>
            </div>
            <ul className="lp-trust">
              <li><Icon name="check" size={16} />Funciona sin señal</li>
              <li><Icon name="check" size={16} />Android y navegador</li>
              <li><Icon name="check" size={16} />PDF listo para firmar</li>
            </ul>
          </div>
          <figure className="lp-hero-figure">
            <div className="lp-plate">
              <img src="/landing/obra-losa.webp" alt="Equipo de supervisión recorriendo una losa de concreto recién vaciada" width={1400} height={933} fetchPriority="high" />
            </div>
            <PhoneMock />
          </figure>
        </div>
      </section>

      <section className="lp-statement">
        <div className="lp-wrap">
          <p className="lp-reveal">
            El recorrido toma una hora. <span>Pasarlo a limpio, cuatro o cinco: notas a mano, decenas de fotos, la cabecera
            copiada otra vez en Word.</span> ArchForms arma el informe mientras recorres la obra.
          </p>
        </div>
      </section>

      <section className="lp-steps" id="como-funciona" aria-labelledby="como-funciona-t">
        <div className="lp-wrap">
          <header className="lp-section-head lp-reveal">
            <p className="lp-eyebrow">Cómo funciona</p>
            <h2 id="como-funciona-t">Tres pasos, en el mismo teléfono.</h2>
          </header>

          <article className="lp-step lp-reveal">
            <div className="lp-step-copy">
              <span className="lp-step-n">1</span>
              <h3>Completa el checklist</h3>
              <p>Sí, No o N.A. con un toque, y texto donde haga falta. Se guarda solo mientras avanzas: no hay botón de guardar que olvidar.</p>
            </div>
            <div className="lp-stage" aria-hidden="true">
              <div className="lp-vignette">
                <div className="v-head"><strong>Exigencias en obra</strong><span>4 de 6</span></div>
                {[
                  ['Licencia de edificación disponible', 'si'],
                  ['Planos aprobados y resellados', 'si'],
                  ['Cuaderno de obra actualizado', 'no'],
                ].map(([label, value]) => (
                  <div className="v-item" key={label}>
                    <span>{label}</span>
                    <span className="v-seg"><i className={value === 'si' ? 'on' : ''}>Sí</i><i className={value === 'no' ? 'on no' : ''}>No</i><i>N.A.</i></span>
                  </div>
                ))}
                <div className="v-saved"><Icon name="check" size={16} />Guardado</div>
              </div>
            </div>
          </article>

          <article className="lp-step lp-step-flip lp-reveal">
            <div className="lp-step-copy">
              <span className="lp-step-n">2</span>
              <h3>Fotografía y dicta</h3>
              <p>Toma las fotos y di en voz alta qué ves. ArchForms las agrupa en un hallazgo y pasa tu voz a texto en el mismo teléfono.</p>
            </div>
            <div className="lp-stage" aria-hidden="true">
              <div className="lp-vignette">
                <div className="v-photos">
                  <img src="/landing/hallazgo-acero.webp" alt="" loading="lazy" width={520} height={520} />
                  <img src="/landing/hallazgo-tablero.webp" alt="" loading="lazy" width={520} height={520} />
                </div>
                <p className="v-note">«Acero de columnas en el eje C sin separadores; el recubrimiento en la cara norte queda por debajo de lo especificado.»</p>
                <div className="v-rec"><span className="v-dot" />Dictando · 0:18</div>
              </div>
            </div>
          </article>

          <article className="lp-step lp-reveal">
            <div className="lp-step-copy">
              <span className="lp-step-n">3</span>
              <h3>Revisa y genera el PDF</h3>
              <p>La cabecera, las respuestas y los hallazgos ya están en orden. Eliges las fotos, ajustas el texto y descargas el PDF.</p>
            </div>
            <div className="lp-stage" aria-hidden="true">
              <div className="p-sheet">
                <div className="p-title"><span>Informe de supervisión</span><span>Visita 03 / 08</span></div>
                <table className="p-table"><tbody>
                  <tr><th>Expediente</th><td>0412-2026-MDSI</td></tr>
                  <tr><th>Obra</th><td>Vivienda multifamiliar, 5 pisos</td></tr>
                  <tr><th>Ubicación</th><td>Av. Los Próceres 1180, San Isidro</td></tr>
                </tbody></table>
                <div className="p-section">Hallazgos</div>
                <div className="p-finding">
                  <img src="/landing/hallazgo-acero.webp" alt="" loading="lazy" width={520} height={520} />
                  <div><b>3.</b> Acero de columnas en el eje C sin separadores; recubrimiento insuficiente en la cara norte.</div>
                </div>
                <div className="p-signs"><span>Responsable de obra</span><span>Arq. supervisor</span></div>
              </div>
            </div>
          </article>
        </div>
      </section>

      <section className="lp-field">
        <div className="lp-wrap">
          <header className="lp-section-head lp-reveal">
            <p className="lp-eyebrow">Hecho para la obra</p>
            <h2>Simple de usar de pie, con el sol de frente.</h2>
          </header>
          <dl className="lp-features lp-reveal">
            <div><dt>Letra grande, botones amplios</dt><dd>Se lee a la distancia del brazo y se toca sin apuntar.</dd></div>
            <div><dt>Sin señal</dt><dd>Todo se guarda en el teléfono y sube a la nube cuando vuelve la conexión.</dd></div>
            <div><dt>Tu formato</dt><dd>Parte de una plantilla y ajústala a lo que pide la municipalidad o el cliente.</dd></div>
            <div><dt>Dictado que se corrige</dt><dd>Escucha el audio original y edita el texto antes de entregar.</dd></div>
            <div><dt>Una carpeta por obra</dt><dd>Cada expediente reúne sus visitas sin volver a escribir la cabecera.</dd></div>
            <div><dt>Revisión en escritorio</dt><dd>Lo capturado en el teléfono se revisa cómodo en la computadora.</dd></div>
          </dl>
        </div>
      </section>

      <section className="lp-who" id="para-quien" aria-labelledby="para-quien-t">
        <div className="lp-wrap lp-who-inner">
          <figure className="lp-who-figure lp-reveal">
            <img src="/landing/arquitecto-planos.webp" alt="Arquitecto revisando un plano impreso con escalímetro sobre la mesa" loading="lazy" width={1200} height={800} />
          </figure>
          <div className="lp-who-copy lp-reveal">
            <p className="lp-eyebrow">Para quién</p>
            <h2 id="para-quien-t">Hecho junto a arquitectos que inspeccionan.</h2>
            <p>Nace de entrevistas con profesionales que redactan informes de visita con frecuencia y hoy lo hacen a mano o en Word.</p>
            <ul className="lp-roles">
              <li>Inspectores municipales de obra</li>
              <li>Delegados del Colegio de Arquitectos</li>
              <li>Supervisores y residentes de obra</li>
              <li>Peritos técnicos</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="lp-faq" id="preguntas" aria-labelledby="preguntas-t">
        <div className="lp-wrap lp-faq-inner">
          <header className="lp-section-head">
            <p className="lp-eyebrow">Preguntas</p>
            <h2 id="preguntas-t">Lo que suelen preguntarnos.</h2>
          </header>
          <div className="lp-faq-list">
            <details>
              <summary>¿Necesito internet en la obra?<Icon name="plus" size={20} /></summary>
              <p>No. Solo para ingresar la primera vez y para respaldar en la nube. El checklist, las fotos y el dictado funcionan sin señal.</p>
            </details>
            <details>
              <summary>¿En qué equipos funciona?<Icon name="plus" size={20} /></summary>
              <p>En teléfonos Android, como aplicación, y en el navegador de tu computadora, donde es más cómodo revisar el informe.</p>
            </details>
            <details>
              <summary>¿Qué pasa con mis fotos?<Icon name="plus" size={20} /></summary>
              <p>Se guardan en tu teléfono y se respaldan en la nube de tu cuenta. Tú decides cuáles entran al informe y en qué orden.</p>
            </details>
            <details>
              <summary>¿Puedo usar el checklist que ya uso?<Icon name="plus" size={20} /></summary>
              <p>Sí. Eliges una plantilla como punto de partida y la ajustas en cada expediente.</p>
            </details>
            <details>
              <summary>¿Cómo empiezo?<Icon name="plus" size={20} /></summary>
              <p>Crea una cuenta, registra tu primer expediente con el número y la dirección, y en tu próxima visita usa el teléfono. ArchForms está en etapa piloto y lo mejoramos con lo que nos cuentan sus usuarios.</p>
            </details>
          </div>
        </div>
      </section>

      <section className="lp-close">
        <div className="lp-wrap">
          <div className="lp-close-panel">
            <h2>Tu próxima visita, con el informe casi listo.</h2>
            <div className="lp-actions">
              <button className="lp-btn lp-btn-light" onClick={() => onEnter('register')}>Crear una cuenta</button>
              <button className="lp-btn lp-btn-text lp-on-dark" onClick={() => onEnter('login')}>Ya tengo cuenta</button>
            </div>
          </div>
        </div>
      </section>

      <footer className="lp-foot">
        <div className="lp-wrap lp-foot-inner">
          <span className="lp-brand"><img src="/archforms-mark.png" alt="" /><span>ArchForms</span></span>
          <span>Un proyecto de ArchVentures · Lima, Perú · 2026</span>
        </div>
      </footer>
    </div>
  );
}

function PhoneMock() {
  return (
    <div className="lp-phone" aria-hidden="true">
      <div className="ph-screen">
        <div className="ph-head"><b>Los Próceres 1180</b><span>Visita 03 · 11 nov</span></div>
        <div className="ph-tabs"><span className="on">Checklist 4/6</span><span>Fotos</span><span>Cerrar</span></div>
        <div className="ph-list">
          <div className="ph-item"><span>Licencia disponible</span><span className="ph-seg"><i className="on">Sí</i><i>No</i><i>N.A.</i></span></div>
          <div className="ph-item"><span>Cuaderno de obra</span><span className="ph-seg"><i>Sí</i><i className="on no">No</i><i>N.A.</i></span></div>
          <div className="ph-item"><span>Personal con EPP</span><span className="ph-seg"><i>Sí</i><i>No</i><i>N.A.</i></span></div>
        </div>
        <div className="ph-saved">✓ Guardado</div>
      </div>
    </div>
  );
}
