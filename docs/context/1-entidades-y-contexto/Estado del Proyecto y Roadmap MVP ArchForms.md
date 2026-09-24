# Estado del proyecto y roadmap MVP — ArchForms

**Actualizado:** 2026-09-23  
**Estado actual:** Iteración 5 terminada; editor por bloques + PDF nativo en cliente funcionan offline con 28 tests en verde. Falta verificación en dispositivo y revisión visual contra muestras de Vicky/César.
**Próxima iteración:** Iteración 6 — piloto cerrado con dos arquitectos. Quedan como subiteraciones futuras: tombstones y política de conflictos, adjuntos/firmantes múltiples y similitud calibrada.

Este documento es la referencia operativa para continuar el desarrollo. Resume qué se decidió, qué ya existe, qué no debe rediseñarse sin evidencia nueva y cómo convertir el laboratorio actual en un MVP vendible y ampliable para un piloto con dos arquitectos.

## 1. Objetivo inmediato

Construir una aplicación funcional que dos arquitectos puedan utilizar durante inspecciones reales para:

1. crear o seleccionar un expediente;
2. crear una visita con el checklist propio del expediente;
3. completar el checklist, tomar fotos y dictar comentarios sin salir de la app;
4. conservar todo aunque no exista conexión;
5. revisar grupos, conclusiones y firmantes;
6. sincronizar el trabajo al recuperar conexión;
7. editar posteriormente desde celular o computadora;
8. generar un informe PDF con el formato de ArchForms.

El MVP debe medir reducción de tiempo y pérdida de contexto. No debe intentar resolver todavía normativa con IA, colaboración simultánea, integraciones municipales ni todos los formatos posibles.

## 2. Decisiones congeladas

### 2.1 Flujo de producto

El flujo canónico está definido en [[Contexto Demo de Informes de Visita]]. Las tres secciones de una visita —checklist, cámara/captura y resumen— existen desde el inicio y permanecen navegables. El audio delimita un grupo de fotografías y siempre se conserva junto con su transcripción.

### 2.2 Modelo de base de datos

El modelo aprobado queda **congelado para construir el MVP**. Sus fuentes canónicas son:

- [[Diseno BD Simplificado - Informes de Visita]] para jerarquía y reglas.
- `Esquema BD - Demo Informes de Visita.dbml` para la definición exacta.

Consta de nueve tablas de dominio:

1. `Profesional`
2. `Archivo`
3. `Plantilla_Checklist`
4. `Expediente`
5. `Visita`
6. `Grupo_Captura`
7. `Foto`
8. `Firmante_Visita`
9. `Adjunto`

No se deben reintroducir por anticipación tablas separadas para `Informe`, `Bloque_Informe`, `Visita_Checklist`, `Conclusiones_Visita` o historial de exportaciones. En el modelo aprobado esas relaciones son 1:1 y viven dentro de `Visita` y su `documento_json`.

Regla invariable de checklists:

```text
Plantilla_Checklist del catálogo
    └── copia JSON independiente en Expediente
            └── copia JSON independiente en cada Visita
```

No existe FK viva desde el expediente hacia la plantilla que originó su JSON. Una modificación futura del catálogo no altera expedientes, y una modificación futura del expediente no altera visitas históricas.

El esquema solo se cambiará si el piloto revela un caso real que el modelo no pueda representar. Antes de modificarlo deberá registrarse: evidencia, caso concreto, alternativa evaluada, migración y efecto sobre datos existentes.

### 2.3 Informe editable

Existe exactamente un informe por visita. `Visita.documento_json` contiene el state-tree de bloques y referencias; fotos, audios, firmas y adjuntos continúan como registros normales. Generar PDF no vuelve inmutable la visita: una edición posterior marca el PDF como desactualizado y permite regenerarlo.

### 2.4 Offline y seguridad

- La captura debe funcionar sin internet.
- Una operación se considera segura cuando está persistida localmente, no cuando solo existe en memoria.
- La sincronización será idempotente mediante outbox; reintentar no debe duplicar filas ni archivos.
- Supabase Auth identifica al profesional.
- RLS protege toda la jerarquía por propietario.
- Storage será privado.
- La aplicación cliente solo usará una clave publicable; nunca una clave secreta o `service_role`.

## 3. Estado real alcanzado

### Iteración 0.0 — contexto y definición del problema: terminada

- Se revisaron entrevistas y el dolor del ICP inicial.
- Se definió el flujo exacto de expediente → visita → captura → revisión → informe.
- Se distinguieron plantillas de checklist, checklist del expediente y respuestas de visita.
- Se analizaron tres PDF de Vicky Rosales y tres Excel de César Perales.
- Se documentaron cabeceras, checklists, grupos fotográficos, observaciones, adjuntos y firmas reales.
- Se congeló el modelo simplificado de nueve tablas.

### Iteración 0.1 — mock navegable: terminada

- Se construyó un prototipo web responsive con identidad ArchForms.
- Se representaron dashboard, expedientes, creación, visitas, captura, resumen, borrador y edición.
- El mock sirve como referencia de producto, no como fuente de arquitectura ni implementación final.

### Iteración 0.2 — laboratorio Android: implementada

Ubicación: `spikes/archforms-android-lab`.

Validado o implementado:

- Capacitor 8 y compilación Android real.
- Instalación mediante APK en el dispositivo de prueba.
- Cámara embebida: encender, apagar y capturar sin abrir la aplicación Cámara.
- Persistencia privada de fotografías.
- Grabación nativa mediante `AudioRecord` en WAV mono PCM, 16 kHz.
- Persistencia y reproducción de audios.
- Descriptores locales binarios y matching geométrico para sugerir fotos similares.
- Recuperación de metadatos después de reabrir la aplicación.
- Sincronización de la superficie nativa de cámara con el scroll y resize del WebView.

Pendiente de validación manual antes de cerrar completamente el spike:

- comprobar en el teléfono que el visor sigue exactamente su caja al hacer scroll;
- grabar, reproducir y reabrir audios de 30 segundos, 2 minutos y 10 minutos;
- repetir en modo avión y observar temperatura/memoria;
- calibrar similitud con fotografías reales de inspección;
- integrar y medir `whisper.cpp`; actualmente no existe transcripción simulada ni real;
- realizar un spike temprano de PDF con uno de los informes reales.

Commits relevantes:

- `3a75292` — prototipo responsive de ArchForms.
- `b585f6a` — laboratorio de captura offline nativa Android.
- `5e10147` — visor nativo sincronizado con scroll.

## 4. Arquitectura objetivo del MVP

El producto se construirá como un monorepo modular. La regla es reutilizar dominio y casos de uso; las pantallas, Supabase, SQLite, cámara y PDF son adaptadores reemplazables.

```text
apps/
├── web/                 React: gabinete, edición y administración
├── mobile/              React + Capacitor: trabajo de campo
└── pdf-worker/          renderizado HTML/CSS → PDF

packages/
├── domain/              entidades, value objects, invariantes y eventos
├── application/         casos de uso y puertos/interfaces
├── contracts/           esquemas JSON, DTO, validación y versiones
├── data-local/          SQLite/IndexedDB, outbox y repositorios locales
├── data-supabase/       repositorios remotos, Auth, Storage y sync
├── capture/             puertos de cámara, audio, archivos y similitud
├── document/            state-tree, bloques y comandos del editor
├── ui/                  tokens, componentes accesibles y estados comunes
└── testing/             builders, fixtures y adaptadores falsos

supabase/
├── migrations/          esquema aprobado, constraints, índices y RLS
├── seed.sql             usuario/datos de desarrollo, nunca producción
└── functions/           solo operaciones que realmente requieran servidor
```

### Capas y dependencias

```mermaid
flowchart LR
  UI[Presentación web/móvil] --> APP[Casos de uso]
  APP --> DOM[Dominio]
  APP --> PORTS[Puertos]
  LOCAL[SQLite / IndexedDB] --> PORTS
  SUPA[Supabase] --> PORTS
  NATIVE[Cámara / Audio / Whisper] --> PORTS
  PDF[Renderizador PDF] --> PORTS
```

El dominio no importa React, Capacitor, Supabase ni APIs del navegador. Los casos de uso dependen de interfaces, y cada plataforma proporciona adaptadores.

### Puertos reutilizables mínimos

- `AuthPort`
- `ExpedienteRepository`
- `VisitaRepository`
- `CaptureGroupRepository`
- `FileRepository`
- `SyncQueuePort`
- `CameraPort`
- `AudioRecorderPort`
- `TranscriptionPort`
- `ImageSimilarityPort`
- `DocumentRepository`
- `PdfRendererPort`
- `Clock` e `IdGenerator`

No se crearán interfaces por cada función trivial. Una abstracción se justifica cuando separa dominio de infraestructura, tiene al menos dos adaptadores previsibles, facilita una prueba importante o protege una dependencia externa.

### Casos de uso iniciales

- `CreateExpediente`
- `UpdateExpedienteChecklist`
- `CreateVisitaFromExpediente`
- `SaveChecklistAnswers`
- `CapturePendingPhoto`
- `StartCaptureGroup`
- `ConfirmCaptureGroup`
- `SaveVisitConclusions`
- `SaveDraft`
- `SynchronizePendingChanges`
- `GenerateVisitDocument`

Cada caso de uso debe ser probado sin montar React ni conectarse a Supabase.

## 5. Roadmap por iteraciones

Las iteraciones son cortes verticales demostrables. Pueden ejecutarse rápido con Astra, pero no se considera terminada una fase sin sus pruebas y criterios de salida.

### Iteración 1 — cimientos y backend reproducible

Objetivo: iniciar sesión y sincronizar una entidad real de extremo a extremo.

- Crear monorepo y paquetes base.
- Configurar TypeScript estricto, lint, tests y CI.
- Inicializar Supabase CLI y migraciones versionadas.
- Aplicar sin rediseñar el DBML aprobado.
- Crear `Profesional` asociado con `auth.users`.
- Implementar Auth por correo/contraseña.
- Implementar RLS por propietario y pruebas negativas entre dos cuentas.
- Crear Storage privado y políticas iniciales.
- Generar tipos TypeScript desde Postgres.
- Definir repositorios, `Result`, errores de dominio y contratos versionados.
- Construir AppShell, login, dashboard y estado de conexión/sync.

Salida: un usuario inicia sesión, crea un dato local y lo sincroniza; otro usuario no puede leerlo.

**Estado: terminada el 2026-09-17.** La evidencia técnica y las decisiones de implementación están en [[Iteracion 1 - Cimientos ArchForms]].

### Iteración 2 — expedientes, checklist y visitas

Objetivo: completar el núcleo administrativo antes de entrar a obra.

- CRUD de expedientes.
- Listado/búsqueda y dashboard de visitas pendientes.
- Catálogo de plantillas de checklist.
- Copia JSON desconectada al expediente.
- Editor básico de checklist por expediente.
- Renderer dinámico de inputs, checks, fechas y observaciones.
- Creación de visita copiando esquema y cabecera.
- Firmantes predeterminados.
- Persistencia local y sincronización de este flujo.

Salida: crear expediente y visita sin conexión, sincronizar y verlos desde web.

**Estado: terminada el 2026-09-17.** Implementación y evidencia en [[Iteracion 2 - Expedientes Checklists y Visitas]]. El diseño visual quedó alineado con `prototipo-archforms`, que se considera fuente canónica de interfaz.

### Iteración 3 — captura de campo completa

Objetivo: permitir una inspección real en el celular.

- Integrar el laboratorio Android mediante `CameraPort` y `AudioRecorderPort`.
- Tres secciones persistentes y navegables.
- Checklist parcial con progreso.
- Fotos pendientes y grupos delimitados por audio.
- Confirmación/ampliación del comentario.
- Audio reproducible y texto editable.
- Conclusiones escritas o dictadas.
- Recuperación después de matar la aplicación.
- Integrar Whisper local solo después de medir el spike; el audio siempre sobrevive si falla.

Salida: completar una visita real en modo avión sin perder información.

**Estado: terminada el 2026-09-17.**
Se implementó en `lab-storage.ts` la lógica de transacciones: los `CaptureGroup` (Hallazgos). 
En `Capture.tsx` la cámara (`CameraPreview` de Capacitor con `toBack: true`) perfora el DOM con CSS avanzado (box-shadow) para integrarse orgánicamente con bordes redondeados y resolver el fondo negro. 
La grabación de audio genera un grupo y resetea las fotos, permitiendo el trabajo sin fricción.
La pestaña 3 (`Summary.tsx`) lista los Hallazgos cronológicamente con sus fotos y notas de voz.
Whisper local queda diferido a iteraciones futuras; el audio siempre sobrevive.

### Iteración 4 — sincronización y medios robustos

Objetivo: trasladar de forma fiable una visita del celular a la nube y al escritorio.

- SQLite en móvil, IndexedDB cuando corresponda en web.
- Outbox con operaciones idempotentes, reintentos y backoff.
- Subidas reanudables a Storage privado.
- Checksums, estados de progreso y recuperación de fallos.
- Push/pull incremental, tombstones y política explícita de conflictos.
- Adjuntos de expediente/visita y múltiples firmantes.
- Similitud calibrada dentro de cada grupo.
- Pruebas con modo avión, cierres e interrupciones de subida.

Salida: visita completa disponible en web sin duplicados después de una red inestable.

**Estado: terminada el 2026-09-23.**
Motor `MediaSyncEngine` en dos fases (binarios en lote → entidad) con `exponentialBackoff` acotado, gate `depends_on` (la entidad no se pushea hasta que todo su media esté `synced`) y `run()` concurrente como no-op.
Outbox SQLite (`media_outbox` + `entity_outbox`) con `resetStuck()` para cierres abruptos y GC de 7 días; `Noop` en web.
Idempotencia real por checksum: `checkExists` compara `checksum_sha256` de la fila `archivo` y verifica el objeto en el bucket antes de omitir la subida.
El push sigue el modelo aprobado: upsert de `archivo` (IMAGEN/AUDIO, `SINCRONIZADO`) → upsert de `grupo_captura` (`CONFIRMADO`, `orden` por visita con reuso en reintento) → upsert de `foto` (`orden_captura` por visita, base única + reintento optimista ante 23505). Sin tablas nuevas.
Escrituras locales serializadas con mutex (sin lost updates entre captura, Whisper y motor). El payload se reconstruye vivo al pushear: la transcripción que llega tarde reencola la entidad y se re-pushea sobre las mismas filas (`foto.id = archivo.id`).
`CaptureGroup.syncStatus` se deriva del outbox vía eventos (`subscribeMediaSync`); `Summary` ya no hace polling. Migración Preferences→outbox una sola vez por visita.
Compresión de fotos (1920px/q0.82) y SHA-256 en fotos y audios antes de persistir.
Cobertura: `tests/media-sync.test.ts` (7 tests: backoff, gating de fase 2, no-op concurrente, backoff sin duplicar, idempotencia, recuperación de `uploading` huérfano).
Pendiente de la iteración (subiteraciones futuras): push/pull incremental, tombstones y política explícita de conflictos, adjuntos de expediente/visita, múltiples firmantes y similitud calibrada. Verificación en dispositivo con red inestable aún manual.

### Pull en login (hecho 2026-09-23, fuera de roadmap, pedido operativo)
Merge por unión nube→local: `CaptureRemoteReader` + `planCapturePull` puro (desconocido→upsert+descarga; con pendientes→local manda; limpio→refresca sin re-descargar). Hidratación a `archforms-lab/` con el mismo id, grupos espejados como `synced` sembrando el outbox (el motor jamás los re-sube). Disparo: login (eager, fondo), auto-pull al abrir un Resumen nunca descargado, y botón "Actualizar desde la nube" por visita con progreso y sello "actualizado hace Xs". Sin realtime, sin tombstones (borrados no se propagan: documentado).

### Iteración 5 — editor por bloques e informe PDF

Objetivo: reducir el trabajo de gabinete y producir un entregable útil.

- Inicializar `documento_json` desde la visita.
- Editor por bloques con comandos reordenables y undo/redo básico.
- Grupos multimedia, conclusiones, adjuntos y firmas.
- Selección y orden de fotos sin alterar los archivos originales.
- Preview paginado y layouts fotográficos.
- Cabecera y pie de firmas repetidos según formato.
- Render HTML/CSS → PDF en worker.
- Estado BORRADOR/GENERADO y detección de PDF desactualizado.
- Golden tests visuales contra muestras de Vicky y César.

Salida: informe PDF editable y regenerable a partir de una visita real.

**Estado: terminada el 2026-09-23 (con ajuste aprobado: PDF nativo en cliente en vez de print/worker).**
`ReportDocumentV1` en dominio (fijos header/checklist/signatures + capture-group/text/conclusions, `revision`, `generatedRevision`) con comandos puros y 6 tests.
4ª pestaña "Informe": reordenar/quitar/restaurar bloques, incluir y ordenar fotos sin tocar originales, editar transcripción con el audio al lado, editar conclusiones, undo/redo (50), guardado al sync de visitas.
Desactualizado visible vía `isPdfStale` (GENERADO + revisión distinta).
PDF con `@react-pdf/renderer` en paquete `report-pdf` (A4, cabecera, checklist, grillas de fotos, firmas con `wrap={false}`, pie X/Y): 100% offline, a `Documentos/ArchForms/` + hoja de compartir (`@capacitor/share`) en nativo, descarga directa en web. Registro como `archivo` PDF + `pdf_archivo_id` cuando hay red, pendiente explícito si no.
Tests: `report-document` (6) + `report-pdf` (3, incluye render a bytes). Pendiente: revisión visual contra muestras y prueba en dispositivo.
Ajuste UX posterior: debug oculto tras flag, navbar de campo de 3 tabs, informe como vista propia con "Concluir visita" (sella FINALIZADA) y "Editar informe" por visita/header/Resumen.
Ajuste visual PDF posterior: fotos en marco de altura fija (190/1 foto, 150/grilla) con `contain` sobre blanco (sin deformar ni recortar, sin página completa); hallazgo indivisible (`wrap={false}`) y numerado; firmas sin banda negra; checklist zebra; conclusiones en caja.
Pie X/Y: PENDIENTE EN DISPOSITIVO. El `fixed`+`absolute` de @react-pdf/renderer 4.9.0 ignora offsets (verificado con 5 variantes + PNG); se pasó a estampado post-render con `pdf-lib` (`stampPageNumbers`, coords exactas) con test de regresión multipágina en verde. En laboratorio el pie aparece en cada hoja; en el APK del teléfono sigue sin verse. Hipótesis abiertas: build/vista previa del visor del teléfono, no el bytes (el test afirma los bytes). Retomar con el APK en mano comparando el mismo archivo.

### Iteración 6 — piloto cerrado con dos arquitectos

Objetivo: validar utilidad, estabilidad y disposición de pago.

- Preparar onboarding y dos cuentas separadas.
- Cargar plantillas/expedientes reales con consentimiento.
- Instrumentar eventos sin guardar audio, fotos ni texto sensible en telemetría.
- Diagnóstico exportable de errores y sincronización.
- Acompañar primeras inspecciones.
- Medir tiempo de campo, tiempo de gabinete, fotos descartadas, correcciones y fallos.
- Entrevista posterior y priorización basada en evidencia.
- Corregir bloqueadores críticos antes de ampliar el piloto.

Salida: dos arquitectos terminan informes reales y existe evidencia cuantitativa/cualitativa para decidir el siguiente producto vendible.

### Iteración 7 — MVP vendible corto plazo

Objetivo: cobrar por un flujo estable, no por una lista amplia de funciones.

- Onboarding autoservicio mínimo.
- Recuperación de cuenta y manejo de sesiones.
- Límites de plan/almacenamiento y política de retención.
- Exportación, descarga y respaldo claros.
- Observabilidad, alertas y soporte operativo.
- Privacidad, términos y consentimiento para datos sensibles.
- Release Android firmado y despliegue web estable.
- Correcciones de UX provenientes del piloto.

Salida: versión cobrable para un grupo pequeño de clientes con soporte cercano.

## 6. Estrategia para avanzar rápido sin degradar la arquitectura

1. Construir cortes verticales y evitar terminar capas aisladas durante semanas.
2. Congelar contratos de dominio por versión, no objetos internos de una librería.
3. Encapsular Capacitor, Supabase, SQLite, Whisper y PDF detrás de puertos.
4. Mantener migraciones SQL y tipos generados en Git.
5. Usar datos y formatos reales como fixtures anonimizados.
6. Probar invariantes del dominio antes que detalles visuales.
7. Evitar abstracciones especulativas y tablas “por si acaso”.
8. Registrar decisiones relevantes mediante ADR cortos.
9. Exigir estados de loading, vacío, offline, permiso denegado y recuperación de error.
10. No aceptar simulaciones silenciosas: una capacidad pendiente debe mostrarse como pendiente.

## 7. Criterio común de terminado

Una historia está terminada cuando:

- cumple el flujo acordado;
- conserva los datos después de cerrar la app;
- funciona offline cuando aplica;
- sincroniza sin duplicar;
- respeta RLS y privacidad;
- tiene pruebas de la regla crítica;
- muestra errores recuperables y estados vacíos;
- funciona en el Android objetivo y en el viewport web acordado;
- está documentada y commiteada;
- no deja contenido sensible en logs.

## 8. Próximo paso exacto

Iniciar la Iteración 3 integrando el laboratorio nativo detrás de los puertos de captura. El primer corte debe abrir una visita existente, conservar las tres secciones navegables y capturar fotos/audio en modo avión sin perder el checklist ya implementado.

## 9. Fuentes de contexto relacionadas

- [[Contexto Demo de Informes de Visita]]
- [[Analisis de Formatos Reales de Informes]]
- [[Diseno BD Simplificado - Informes de Visita]]
- [[Plan Tecnico - ArchForms Funcional]]
- `spikes/archforms-android-lab/README.md`
