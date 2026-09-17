const app = document.querySelector('#app');
const breadcrumbs = document.querySelector('#breadcrumbs');
const modal = document.querySelector('#modal');
const modalContent = document.querySelector('#modalContent');
const toast = document.querySelector('#toast');
const toastText = document.querySelector('#toastText');

const state = {
  view: 'dashboard',
  visitTab: 'checklist',
  pendingPhotos: 4,
  groups: 3,
  recording: false,
  awaitingAudioConfirmation: false,
  checklistAnswers: { licencia: 'si', planos: 'si', cuaderno: 'si', epi: 'si', orden: 'no' }
};

const projects = [
  { id: 'molina', code: 'E-06328-2026', title: 'Remodelación C.C. La Molina', address: 'Av. Raúl Ferrero Rebagliati 1355 · La Molina', visits: '6 de 7', updated: 'Hoy, 10:32', status: 'active', statusText: 'En curso' },
  { id: 'chorrillos', code: '32956-2025', title: 'Vivienda Malecón Costa Sur', address: 'Malecón Costa Sur 658 · Chorrillos', visits: '18 de 54', updated: 'Ayer, 18:10', status: 'draft', statusText: 'Borrador' },
  { id: 'brasas', code: '6525-2022', title: 'N&AN Brasas Peruanas', address: 'Calle Uno, Mz. C-6, Lote 23 · SJM', visits: '9 visitas', updated: '12 ago. 2026', status: 'review', statusText: 'Revisión' },
  { id: 'barranco', code: '01842-2026', title: 'Edificio multifamiliar Barranco', address: 'Jr. Centenario 412 · Barranco', visits: '2 de 16', updated: '08 ago. 2026', status: 'active', statusText: 'En curso' }
];

const screenTitles = {
  dashboard: 'Inicio',
  expedientes: 'Expedientes',
  'crear-expediente': 'Nuevo expediente',
  expediente: 'Expedientes <i>›</i> <b>Remodelación C.C. La Molina</b>',
  visita: 'Expedientes <i>›</i> Visita 07',
  editor: 'Visita 07 <i>›</i> <b>Editor del informe</b>',
  borradores: 'Borradores',
  plantillas: 'Plantillas de checklist'
};

function statusBadge(project) {
  return `<span class="status ${project.status}">${project.statusText}</span>`;
}

function projectCard(project) {
  return `
    <article class="card project-card" data-action="open-expediente" data-project="${project.id}" tabindex="0">
      <div class="project-top"><span class="project-icon">⌂</span>${statusBadge(project)}</div>
      <h3>${project.title}</h3>
      <p class="project-address">${project.address}</p>
      <div class="project-meta">
        <span>Expediente<strong>${project.code}</strong></span>
        <span>Visitas<strong>${project.visits}</strong></span>
      </div>
    </article>`;
}

function dashboardView() {
  return `
    <div class="page-enter">
      <section class="hero-grid">
        <article class="hero-card">
          <p class="eyebrow">Miércoles, 17 de septiembre</p>
          <h1>Tu visita de obra, lista antes de llegar a casa.</h1>
          <p>Captura evidencias, dicta observaciones y deja que ArchForms prepare el informe por ti.</p>
          <div class="hero-actions">
            <button class="btn btn-primary btn-lg" data-view="expediente">＋ Nueva visita</button>
            <button class="btn btn-secondary btn-lg" data-view="expedientes">Ver expedientes</button>
          </div>
        </article>
        <article class="today-card">
          <div class="today-card-header"><h3>Próxima visita</h3><span class="date-chip">HOY · 3:30 PM</span></div>
          <div class="today-visit">
            <strong>Remodelación C.C. La Molina</strong>
            <span>Visita 07 de 07</span>
            <span>Av. Raúl Ferrero Rebagliati 1355</span>
          </div>
          <button class="btn btn-primary" data-action="start-visit">Empezar visita <span>→</span></button>
        </article>
      </section>

      <section class="metrics">
        <article class="card metric"><div class="metric-label"><span>Expedientes activos</span><i>▤</i></div><strong>04</strong><small>2 con visita esta semana</small></article>
        <article class="card metric"><div class="metric-label"><span>Informes generados</span><i>✓</i></div><strong>28</strong><small>+6 este mes</small></article>
        <article class="card metric"><div class="metric-label"><span>Borradores</span><i>◫</i></div><strong>02</strong><small>Pendientes de revisar</small></article>
        <article class="card metric"><div class="metric-label"><span>Tiempo recuperado</span><i>⌁</i></div><strong>18h</strong><small>Estimado este mes</small></article>
      </section>

      <div class="section-heading"><h2>Continúa donde lo dejaste</h2><button class="section-link" data-view="expedientes">Ver todos →</button></div>
      <section class="project-grid">${projects.slice(0, 3).map(projectCard).join('')}</section>
    </div>`;
}

function expedientesView() {
  return `
    <div class="page-enter">
      <header class="page-heading">
        <div><p class="eyebrow">Obras e inspecciones</p><h1>Expedientes</h1><p>Una sola cabecera para todas las visitas de cada obra.</p></div>
        <div class="heading-actions"><button class="btn btn-primary btn-lg" data-view="crear-expediente">＋ Nuevo expediente</button></div>
      </header>
      <div class="filterbar">
        <label class="search-field"><span>⌕</span><input type="search" placeholder="Buscar por expediente, propietario o dirección"></label>
        <select aria-label="Filtrar por estado"><option>Todos los estados</option><option>En curso</option><option>Borrador</option></select>
        <select aria-label="Ordenar"><option>Más recientes</option><option>Nombre A–Z</option></select>
      </div>
      <section class="expedient-list">
        ${projects.map(p => `
          <article class="expedient-row" data-action="open-expediente" tabindex="0">
            <span class="exp-icon">▤</span>
            <div class="exp-primary"><strong>${p.title}</strong><span>${p.code} · ${p.address}</span></div>
            <div class="exp-cell"><span>Última actividad</span><strong>${p.updated}</strong></div>
            <div class="exp-cell hide-tablet"><span>Visitas</span><strong>${p.visits}</strong></div>
            ${statusBadge(p)}
            <button class="row-arrow" aria-label="Abrir expediente">›</button>
          </article>`).join('')}
      </section>
    </div>`;
}

function crearExpedienteView() {
  return `
    <div class="page-enter">
      <header class="page-heading">
        <div><p class="eyebrow">Nuevo proyecto</p><h1>Crear expediente</h1><p>Esta información formará la cabecera de todas las visitas. Podrás editarla después.</p></div>
      </header>
      <div class="form-layout">
        <form class="card form-card" id="expedienteForm">
          <section class="form-section">
            <div class="form-section-title"><span class="step-number">1</span><div><h3>Identificación</h3><p>Datos principales de la licencia y el expediente.</p></div></div>
            <div class="form-grid">
              <div class="form-group"><label>Número de expediente <span class="required">*</span></label><input class="field" value="E-06328-2026"></div>
              <div class="form-group"><label>Número de licencia</label><input class="field" value="0087-2026"></div>
              <div class="form-group"><label>Modalidad</label><select><option>Modalidad D</option><option>Modalidad C</option><option>Modalidad B</option></select></div>
              <div class="form-group"><label>Municipalidad / entidad</label><input class="field" value="Municipalidad de La Molina"></div>
              <div class="form-group"><label>Vigencia desde</label><input class="field" type="date" value="2026-05-04"></div>
              <div class="form-group"><label>Vigencia hasta</label><input class="field" type="date" value="2029-05-03"></div>
            </div>
          </section>
          <section class="form-section">
            <div class="form-section-title"><span class="step-number">2</span><div><h3>Obra y responsables</h3><p>Datos que se reutilizarán en la cabecera.</p></div></div>
            <div class="form-grid">
              <div class="form-group full"><label>Propietario / razón social <span class="required">*</span></label><input class="field" value="CENCOSUD PERÚ SHOPPING S.A.C."></div>
              <div class="form-group full"><label>Ubicación de la obra <span class="required">*</span></label><input class="field" value="Av. Raúl Ferrero Rebagliati 1355, La Molina"></div>
              <div class="form-group"><label>Tipo de obra</label><select><option>Remodelación</option><option>Obra nueva</option><option>Ampliación</option></select></div>
              <div class="form-group"><label>Uso del predio</label><input class="field" value="Centro comercial"></div>
              <div class="form-group"><label>Responsable de obra</label><input class="field" value="Luis Fernando Bautista Molina"></div>
              <div class="form-group"><label>CIP / colegiatura</label><input class="field" value="CIP 289550"></div>
              <div class="form-group full"><label>Detalle de obra</label><textarea rows="3">Remodelación de locales comerciales, acabados e instalaciones.</textarea></div>
            </div>
          </section>
          <section class="form-section">
            <div class="form-section-title"><span class="step-number">3</span><div><h3>Póliza y planificación</h3><p>Información complementaria visible en los informes.</p></div></div>
            <div class="form-grid">
              <div class="form-group"><label>Compañía de póliza CAR</label><input class="field" value="Pacífico Seguros"></div>
              <div class="form-group"><label>Visitas programadas</label><input class="field" type="number" value="7"></div>
              <div class="form-group"><label>Inicio de póliza</label><input class="field" type="date" value="2026-08-09"></div>
              <div class="form-group"><label>Fin de póliza</label><input class="field" type="date" value="2026-09-19"></div>
            </div>
          </section>
          <div class="form-actions"><button type="button" class="btn btn-secondary" data-view="expedientes">Cancelar</button><button type="submit" class="btn btn-primary btn-lg">Crear expediente →</button></div>
        </form>
        <aside class="card template-panel">
          <p class="eyebrow">Checklist inicial</p><h2>Elige un punto de partida</h2><p>Se copiará al expediente. Luego podrás personalizarlo sin cambiar la plantilla original.</p>
          <div class="template-option selected"><span class="template-radio"></span><div class="template-copy"><strong>Verificación técnica · G.050</strong><span>26 campos · Seguridad y cumplimiento</span></div></div>
          <div class="template-option"><span class="template-radio"></span><div class="template-copy"><strong>Supervisión general de obra</strong><span>18 campos · Avance y calidad</span></div></div>
          <div class="template-option"><span class="template-radio"></span><div class="template-copy"><strong>Checklist vacío</strong><span>Empieza una estructura propia</span></div></div>
          <div class="checklist-preview">
            <div class="checklist-preview-head"><span>Vista previa</span><button class="edit-link" type="button" data-action="customize-checklist">Personalizar</button></div>
            ${Array(6).fill('<div class="mini-check"><span></span><span></span></div>').join('')}
          </div>
        </aside>
      </div>
    </div>`;
}

function expedienteView() {
  return `
    <div class="page-enter">
      <section class="detail-banner">
        <p class="eyebrow">Expediente E-06328-2026</p>
        <h1>Remodelación C.C. La Molina</h1>
        <p>Av. Raúl Ferrero Rebagliati 1355 · Urb. El Remanso de La Molina</p>
        <div class="detail-meta">
          <div><span>Propietario</span><strong>Cencosud Perú Shopping S.A.C.</strong></div>
          <div><span>Licencia</span><strong>0087-2026 · Modalidad D</strong></div>
          <div><span>Vigencia</span><strong>04/05/2026 — 03/05/2029</strong></div>
          <div><span>Checklist</span><strong>Verificación técnica · G.050</strong></div>
        </div>
        <div class="detail-actions"><button class="btn btn-primary btn-lg" data-action="start-visit">＋ Nueva visita</button><button class="btn btn-secondary">Editar expediente</button></div>
      </section>
      <section class="card timeline-card">
        <div class="section-heading"><div><p class="eyebrow">Historial</p><h2>Visitas de inspección</h2></div><span class="date-chip">6 de 7 completadas</span></div>
        ${[
          ['06', '18 ago. 2026', 'Informe generado', '42%', 'active'],
          ['05', '24 jun. 2026', 'Informe generado', '36%', 'active'],
          ['04', '10 jun. 2026', 'Borrador editable', '28%', 'draft'],
          ['03', '25 may. 2026', 'Informe generado', '19%', 'active']
        ].map(v => `<article class="visit-row"><span class="visit-number">${v[0]}</span><div><h3>Visita ${v[0]} · ${v[1]}</h3><p>${v[2]} · Avance general ${v[3]}</p></div><div class="visit-actions"><span class="status ${v[4]}">${v[2].includes('Borrador') ? 'Borrador' : 'Finalizado'}</span><button class="btn btn-secondary" data-view="editor">Abrir</button></div></article>`).join('')}
      </section>
    </div>`;
}

function visitChrome(content) {
  const tabs = [
    ['checklist', '1', 'Checklist', state.visitTab === 'checklist' ? 'En progreso' : '58% completo'],
    ['capture', '2', 'Captura', `${state.groups} grupos`],
    ['review', '3', 'Resumen', 'Revisar']
  ];
  return `
    <div class="page-enter visit-shell">
      <header class="visit-header">
        <div class="visit-title"><button class="back-button" data-view="expediente">←</button><div><h1>Visita 07 · La Molina</h1><p>Exp. E-06328-2026 · Hoy, 17 sep. 2026</p></div></div>
        <span class="offline-pill">● Disponible sin conexión</span>
      </header>
      <nav class="visit-tabs">${tabs.map(t => `<button class="visit-tab ${state.visitTab === t[0] ? 'active' : ''}" data-tab="${t[0]}"><span class="tab-num">${t[1]}</span><span>${t[2]}<span class="tab-state"> · ${t[3]}</span></span></button>`).join('')}</nav>
      <section class="visit-body">${content}</section>
    </div>`;
}

function checklistView() {
  const items = [
    ['licencia', 'Licencia de edificación disponible', 'Documento vigente en obra'],
    ['planos', 'Planos aprobados y resellados', 'Arquitectura y especialidades'],
    ['cuaderno', 'Cuaderno de obra actualizado', 'Asiento correspondiente a la visita'],
    ['epi', 'Personal con EPP completo', 'Casco, calzado, chaleco y protección'],
    ['orden', 'Orden y limpieza en zona de trabajo', 'Rutas y áreas de circulación libres'],
    ['senalizacion', 'Señalización y rutas de evacuación', 'Visible durante toda la jornada']
  ];
  return visitChrome(`
    <div class="checklist-layout">
      <article class="card checklist-card">
        <p class="eyebrow">Verificación técnica · G.050</p><h2>Checklist de visita</h2><p>Completa lo que puedas ahora. Puedes cambiar de sección y regresar en cualquier momento.</p>
        <div class="progress-line"><i></i></div>
        <section class="check-group">
          <div class="check-group-title"><h3>Exigencias obligatorias en obra</h3><span>4 de 6 respondidas</span></div>
          ${items.map(item => {
            const value = state.checklistAnswers[item[0]];
            return `<div class="check-item"><div><strong>${item[1]}</strong><small>${item[2]}</small></div><div class="segmented"><button class="${value === 'si' ? 'active' : ''}" data-check="${item[0]}" data-value="si">Sí</button><button class="${value === 'no' ? 'active' : ''}" data-check="${item[0]}" data-value="no">No</button><button class="${value === 'na' ? 'active' : ''}" data-check="${item[0]}" data-value="na">N/A</button></div></div>`;
          }).join('')}
        </section>
        <div class="form-group" style="margin-top:20px"><label>Observaciones del checklist</label><textarea rows="3" placeholder="Añade una precisión si es necesario…">El residente registra la visita en el asiento correspondiente.</textarea></div>
      </article>
      <aside class="card visit-aside"><p class="eyebrow">Progreso</p><h3>Datos de la visita</h3><div class="aside-stat"><span>Checklist</span><strong>58% completado</strong></div><div class="aside-stat"><span>Fotos capturadas</span><strong>${state.pendingPhotos + state.groups * 3}</strong></div><div class="aside-stat"><span>Grupos confirmados</span><strong>${state.groups}</strong></div><button class="btn btn-primary" data-tab="capture">Continuar a cámara →</button><button class="btn btn-ghost" data-action="save-draft">Guardar borrador</button></aside>
    </div>`);
}

function captureView() {
  const photoThumbs = Array(state.pendingPhotos).fill(0).map((_, i) => `<span class="photo-thumb ${i === state.pendingPhotos - 1 ? 'new' : ''}"></span>`).join('');
  return visitChrome(`
    <div class="camera-layout">
      <section class="camera-card">
        <div class="camera-feed"></div><div class="camera-center"></div>
        <div class="camera-top"><span class="camera-chip">Visita 07 · Grupo pendiente</span><span class="camera-chip">HDR · AUTO</span></div>
        <div class="camera-controls"><div class="camera-control-label">${state.pendingPhotos} fotos pendientes</div><button class="shutter" data-action="take-photo" aria-label="Tomar foto"></button><button class="flip-camera" aria-label="Cambiar cámara">↻</button></div>
      </section>
      <aside class="capture-side">
        <article class="card pending-card"><div class="pending-head"><h3>Fotos pendientes</h3><span>${state.pendingPhotos}</span></div><div class="thumbnail-grid">${photoThumbs || '<p style="grid-column:1/-1;font-size:10px">Toma fotos para iniciar un grupo.</p>'}</div></article>
        <article class="card audio-card">
          <p class="eyebrow">Comentario del grupo</p><h3>${state.recording ? 'Escuchando…' : state.awaitingAudioConfirmation ? 'Comentario listo' : 'Describe lo que observas'}</h3>
          <button class="mic-button ${state.recording ? 'recording' : ''}" data-action="toggle-record" aria-label="${state.recording ? 'Detener grabación' : 'Grabar audio'}">${state.recording ? '■' : '●'}</button>
          <div class="waveform">${Array(17).fill('<i></i>').join('')}</div>
          <p>${state.recording ? 'Transcripción 100% local en curso' : 'El audio agrupará todas las fotos pendientes.'}</p>
          <div class="live-transcript">${state.recording || state.awaitingAudioConfirmation ? 'En el cuarto piso continúan realizando enchapes y pintura; queda pendiente la instalación de mobiliario…' : 'La transcripción aparecerá aquí mientras hablas.'}</div>
          ${state.awaitingAudioConfirmation ? '<button class="btn btn-primary" style="margin-top:10px" data-action="confirm-audio">✓ Confirmar grupo</button><button class="btn btn-ghost" data-action="toggle-record">＋ Ampliar audio</button>' : ''}
        </article>
      </aside>
    </div>`);
}

function photoGrid(count = 4) {
  return `<div class="group-photos">${Array(count).fill('<span class="photo-thumb"></span>').join('')}</div>`;
}

function reviewView() {
  const groupTexts = [
    'En cuarto piso continúan los trabajos de enchape, pintura e instalación de muebles.',
    'Se verifica vaciado de losa de mezzanine; queda pendiente ejecutar la escalera.',
    'Trabajos de drywall en baños y ambientes debajo de graderías.'
  ];
  return visitChrome(`
    <div class="review-layout">
      <section class="card summary-card">
        <div class="summary-block"><div class="block-head"><div><span class="block-kicker">Cabecera</span><h3>Expediente E-06328-2026</h3></div><button class="edit-link">Editar</button></div><div class="compact-data"><div><span>Propietario</span><strong>Cencosud Perú Shopping</strong></div><div><span>Licencia</span><strong>0087-2026</strong></div><div><span>Visita</span><strong>07 de 07</strong></div></div></div>
        <div class="summary-block"><div class="block-head"><div><span class="block-kicker">Checklist</span><h3>Verificación técnica · G.050</h3></div><button class="edit-link" data-tab="checklist">Completar 42%</button></div><div class="progress-line" style="margin-bottom:0"><i></i></div></div>
        ${groupTexts.map((text, index) => `<div class="summary-block"><div class="block-head"><div><span class="block-kicker">Grupo ${String(index + 1).padStart(2, '0')}</span><h3>${index === 0 ? 'Acabados del cuarto piso' : index === 1 ? 'Losa de mezzanine' : 'Drywall e instalaciones'}</h3></div><button class="edit-link">Editar</button></div><div class="group-preview">${photoGrid(index === 1 ? 3 : 4)}<div class="group-comment"><p>${text}</p><span class="audio-mini">▶ Escuchar audio · 0:${18 + index * 7}</span></div></div></div>`).join('')}
        <div class="summary-block"><div class="block-head"><div><span class="block-kicker">Cierre</span><h3>Conclusiones de la visita</h3></div><button class="edit-link">● Dictar</button></div><textarea class="conclusion-area" placeholder="Escribe o dicta las conclusiones…">La obra presenta un avance general aproximado de 42%. Se deberá ampliar la vigencia de la póliza CAR y mantener libres las rutas de evacuación.</textarea></div>
      </section>
      <aside class="card finish-panel"><p class="eyebrow">Antes de terminar</p><h3>Resumen de captura</h3><ul><li>Cabecera del expediente lista</li><li>${state.groups} grupos fotográficos confirmados</li><li>Audio original guardado</li><li>Conclusiones agregadas</li></ul><button class="btn btn-primary btn-lg" data-view="editor">Terminar toma de datos →</button><button class="btn btn-secondary" data-action="save-draft">Guardar como borrador</button><button class="btn btn-ghost" data-tab="capture">Volver a cámara</button></aside>
    </div>`);
}

function visitaView() {
  if (state.visitTab === 'capture') return captureView();
  if (state.visitTab === 'review') return reviewView();
  return checklistView();
}

function paperContent() {
  return `
    <div class="paper-header"><div class="paper-brand"><img src="assets/archforms-mark.png" alt=""><span><strong>ARCH</strong>FORMS</span></div><div class="paper-code"><b>INFORME DE VERIFICACIÓN TÉCNICA N° 07</b><br>2026-VERC/MDLM</div></div>
    <section class="paper-block"><span class="drag-handle">⠿</span><div class="paper-title">DATOS DE LA VISITA</div><table class="paper-table"><tr><td>EXPEDIENTE</td><td>E-06328-2026 (BÁSICO N°019119)</td><td>VISITA</td><td>7 / 7</td></tr><tr><td>PROPIETARIO</td><td colspan="3">CENCOSUD PERÚ SHOPPING S.A.C.</td></tr><tr><td>UBICACIÓN</td><td colspan="3">AV. RAÚL FERRERO REBAGLIATI 1355 · LA MOLINA</td></tr><tr><td>FECHA</td><td>17/09/2026</td><td>AVANCE</td><td>42%</td></tr></table></section>
    <section class="paper-block"><span class="drag-handle">⠿</span><div class="paper-title">CUMPLIMIENTO DE NORMA G.050</div><div class="paper-checks"><span>Descripción</span><span>Sí</span><span>No</span><span>Licencia de edificación disponible</span><span>✓</span><span></span><span>Planos aprobados y resellados</span><span>✓</span><span></span><span>Orden y limpieza de la obra</span><span></span><span>✓</span></div></section>
    <section class="paper-block"><span class="drag-handle">⠿</span><div class="paper-title">REGISTRO FOTOGRÁFICO</div><div class="paper-photo-grid">${Array(6).fill('<div class="paper-photo"></div>').join('')}</div><p class="paper-caption">EN CUARTO PISO CONTINÚAN REALIZANDO ENCHAPES Y PINTURA. PENDIENTE INSTALACIÓN DE MOBILIARIO.</p></section>
    <section class="paper-block"><span class="drag-handle">⠿</span><div class="paper-title">CONCLUSIONES</div><p class="paper-caption">La obra presenta un avance general aproximado de 42%. Se deberá ampliar la vigencia de la póliza CAR y mantener libres las rutas de evacuación.</p></section>
    <footer class="paper-footer"><div class="signature-line"><b>VICKY E. ROSALES CAMACHO</b><br>INSPECTORA · CAP 6469</div><div class="signature-line"><b>LUIS F. BAUTISTA MOLINA</b><br>RESPONSABLE DE OBRA · CIP 289550</div></footer>`;
}

function editorView() {
  return `
    <div class="page-enter">
      <header class="page-heading"><div><p class="eyebrow">Documento editable</p><h1>Informe de visita 07</h1><p>Reordena bloques, corrige textos y decide qué evidencia aparecerá en el PDF.</p></div><span class="status draft">Borrador guardado</span></header>
      <div class="editor-shell">
        <aside class="card editor-panel"><h3>Añadir bloque</h3><div class="block-palette"><div class="palette-item"><i>T</i>Texto libre</div><div class="palette-item"><i>▦</i>Grupo de fotos</div><div class="palette-item"><i>✓</i>Checklist</div><div class="palette-item"><i>⌁</i>Adjunto</div><div class="palette-item"><i>✎</i>Firmas</div></div><p style="font-size:9px;margin:16px 0 0">Arrastra un bloque al documento para añadirlo.</p></aside>
        <section>
          <div class="document-toolbar"><div class="tool-group"><button class="tool"><b>B</b></button><button class="tool"><i>I</i></button><button class="tool">≡</button><button class="tool">↶</button><button class="tool">↷</button></div><div class="tool-group"><button class="tool">90%</button><button class="tool">A4</button></div></div>
          <div class="document-canvas"><article class="paper">${paperContent()}</article></div>
          <div class="editor-actions"><button class="btn btn-secondary" data-action="save-draft">Guardar borrador</button><button class="btn btn-soft" data-action="preview-pdf">◉ Vista previa</button><button class="btn btn-primary" data-action="generate-pdf">Generar PDF →</button></div>
        </section>
        <aside class="card editor-panel inspector-panel"><h3>Propiedades</h3><div class="property"><label>Título del bloque</label><input class="field" value="Registro fotográfico"></div><div class="property"><label>Distribución de fotos</label><select><option>Automática</option><option>2 columnas</option><option>3 columnas</option></select></div><div class="toggle-row"><span>Conservar proporción</span><button class="toggle on"></button></div><div class="toggle-row"><span>Mostrar comentario</span><button class="toggle on"></button></div><div class="toggle-row"><span>Repetir firmas</span><button class="toggle on"></button></div></aside>
      </div>
    </div>`;
}

function borradoresView() {
  return `
    <div class="page-enter"><header class="page-heading"><div><p class="eyebrow">Trabajo pendiente</p><h1>Borradores</h1><p>Informes guardados que todavía puedes revisar y generar.</p></div></header>
      <section class="project-grid">
        <article class="card project-card" data-view="editor"><div class="project-top"><span class="project-icon">◫</span><span class="status draft">Borrador</span></div><h3>Visita 04 · N&AN Brasas</h3><p class="project-address">Checklist completo · 3 grupos · Falta conclusión</p><div class="project-meta"><span>Guardado<strong>Hace 18 min</strong></span><span>Progreso<strong>82%</strong></span></div></article>
        <article class="card project-card" data-view="editor"><div class="project-top"><span class="project-icon">◫</span><span class="status review">Revisar</span></div><h3>Visita 18 · Costa Sur</h3><p class="project-address">Informe completo · PDF desactualizado</p><div class="project-meta"><span>Guardado<strong>Ayer, 18:10</strong></span><span>Progreso<strong>100%</strong></span></div></article>
      </section>
    </div>`;
}

function plantillasView() {
  return `
    <div class="page-enter"><header class="page-heading"><div><p class="eyebrow">Catálogo reutilizable</p><h1>Plantillas de checklist</h1><p>Al usar una plantilla se copia al expediente; los cambios posteriores son independientes.</p></div><button class="btn btn-primary">＋ Nueva plantilla</button></header>
      <section class="project-grid">
        ${[['Verificación técnica · G.050','26 campos','Sistema'],['Supervisión general de obra','18 campos','Sistema'],['Control de instalaciones','14 campos','Personalizada']].map((t,i) => `<article class="card project-card"><div class="project-top"><span class="project-icon">✓</span><span class="date-chip">${t[2]}</span></div><h3>${t[0]}</h3><p class="project-address">${t[1]} · checks, observaciones e inputs</p><div class="project-meta"><span>Versión<strong>v${i + 1}.0</strong></span><span>Usada en<strong>${4-i} expedientes</strong></span></div></article>`).join('')}
      </section>
    </div>`;
}

const views = {
  dashboard: dashboardView,
  expedientes: expedientesView,
  'crear-expediente': crearExpedienteView,
  expediente: expedienteView,
  visita: visitaView,
  editor: editorView,
  borradores: borradoresView,
  plantillas: plantillasView
};

function render(view = state.view) {
  state.view = view;
  app.innerHTML = (views[view] || dashboardView)();
  breadcrumbs.innerHTML = screenTitles[view] || 'Inicio';
  document.querySelectorAll('[data-view]').forEach(el => el.classList.toggle('active', el.dataset.view === view));
  window.scrollTo({ top: 0, behavior: 'smooth' });
  requestAnimationFrame(() => app.focus({ preventScroll: true }));
}

function showToast(message) {
  toastText.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => toast.classList.remove('show'), 2600);
}

function openPreview(generated = false) {
  modalContent.innerHTML = `
    <header class="preview-header"><p class="eyebrow">${generated ? 'PDF generado' : 'Vista previa'}</p><h2 id="modalTitle">Informe de visita 07</h2><p>${generated ? 'El archivo está listo para compartir o imprimir.' : 'Así se verá el documento al exportarlo.'}</p></header>
    <article class="preview-paper">${paperContent()}</article>
    <div class="preview-actions"><button class="btn btn-secondary" data-close-modal>Cerrar</button>${generated ? '<button class="btn btn-primary">↓ Descargar PDF</button>' : '<button class="btn btn-primary" data-close-modal>Volver a editar</button>'}</div>`;
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
}

function openChecklistCustomizer() {
  modalContent.innerHTML = `
    <header class="preview-header"><p class="eyebrow">Copia para este expediente</p><h2 id="modalTitle">Personalizar checklist</h2><p>Estos cambios no modificarán la plantilla original.</p></header>
    <div class="card form-card"><div class="check-group-title"><h3>Exigencias obligatorias</h3><button class="btn btn-soft">＋ Campo</button></div>${['Licencia de edificación','Planos aprobados','Cuaderno de obra','Personal con EPP'].map((x,i) => `<div class="check-item"><div><strong>${x}</strong><small>Respuesta: Sí / No / N.A.</small></div><div><button class="btn btn-ghost">☰</button><button class="btn btn-ghost">Editar</button></div></div>`).join('')}</div>
    <div class="preview-actions"><button class="btn btn-secondary" data-close-modal>Cancelar</button><button class="btn btn-primary" data-close-modal data-action="customization-saved">Guardar copia personalizada</button></div>`;
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
}

function closeModal() {
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
}

document.addEventListener('click', event => {
  const viewTarget = event.target.closest('[data-view]');
  if (viewTarget) {
    event.preventDefault();
    render(viewTarget.dataset.view);
    return;
  }

  const tabTarget = event.target.closest('[data-tab]');
  if (tabTarget) {
    state.visitTab = tabTarget.dataset.tab;
    render('visita');
    return;
  }

  const checkTarget = event.target.closest('[data-check]');
  if (checkTarget) {
    state.checklistAnswers[checkTarget.dataset.check] = checkTarget.dataset.value;
    render('visita');
    showToast('Respuesta guardada en el dispositivo');
    return;
  }

  const actionTarget = event.target.closest('[data-action]');
  if (actionTarget) {
    const action = actionTarget.dataset.action;
    if (action === 'open-expediente') render('expediente');
    if (action === 'start-visit') { state.visitTab = 'checklist'; render('visita'); }
    if (action === 'save-draft') showToast('Borrador guardado y listo para sincronizar');
    if (action === 'take-photo') { state.pendingPhotos += 1; render('visita'); showToast(`Foto ${state.pendingPhotos} guardada localmente`); }
    if (action === 'toggle-record') {
      if (state.awaitingAudioConfirmation) state.awaitingAudioConfirmation = false;
      state.recording = !state.recording;
      if (!state.recording) state.awaitingAudioConfirmation = true;
      render('visita');
    }
    if (action === 'confirm-audio') {
      state.groups += 1;
      state.pendingPhotos = 0;
      state.recording = false;
      state.awaitingAudioConfirmation = false;
      render('visita');
      showToast(`Grupo ${state.groups} creado con audio y transcripción`);
    }
    if (action === 'preview-pdf') openPreview(false);
    if (action === 'generate-pdf') openPreview(true);
    if (action === 'customize-checklist') openChecklistCustomizer();
    if (action === 'customization-saved') showToast('Checklist personalizado para este expediente');
    return;
  }

  if (event.target.closest('[data-close-modal]') || event.target === modal) closeModal();

  const toggle = event.target.closest('.toggle');
  if (toggle) toggle.classList.toggle('on');

  const template = event.target.closest('.template-option');
  if (template) {
    document.querySelectorAll('.template-option').forEach(item => item.classList.remove('selected'));
    template.classList.add('selected');
  }
});

document.addEventListener('submit', event => {
  if (event.target.id === 'expedienteForm') {
    event.preventDefault();
    render('expediente');
    showToast('Expediente creado con su checklist independiente');
  }
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeModal();
  const card = event.target.closest('[data-action="open-expediente"]');
  if (card && (event.key === 'Enter' || event.key === ' ')) render('expediente');
});

render();
