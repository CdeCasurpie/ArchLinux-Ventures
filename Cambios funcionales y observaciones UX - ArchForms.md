# ArchForms — Cambios funcionales y observaciones de experiencia de uso

Este documento reúne y reorganiza las necesidades identificadas durante la revisión con arquitectos y la revisión del código actual. Es un inventario de cambios de comportamiento y experiencia de uso: no define una secuencia de implementación, estimaciones ni una arquitectura técnica.

**Despliegue remoto 2026-11-13:** se aplicaron las migraciones `006` a `013` en el
proyecto Supabase `pcmkrfnjdfrnjkqnpqgf`. La nueva migración
`20260917001300_checklist_template_links.sql` incorpora de forma incremental los
campos `checklist_template_id` y sus claves foráneas en expedientes y visitas, ya que
la migración `001` original estaba aplicada en remoto. Se verificaron el historial
local/remoto coincidente, las funciones de sincronización, el trigger de réplica de
plantillas y las políticas de acceso por propietario. El dry-run posterior informa
«Remote database is up to date». Las notas anteriores sobre cambios únicamente
locales describen el estado previo a este despliegue. No se desplegó el cliente web
ni se instaló una nueva APK como parte de esta operación.

**Revisión 2026-11-10:** se implementaron autosave, protocolo idempotente, réplica incremental
de expedientes/visitas y transferencias persistentes. Estado y pruebas en
`docs/offline-sync-validation.md`. Esto no da por implementadas las funcionalidades de
formularios, firmas, resumen ni editor descritas a continuación. El PDF ahora se regenera
siempre en el dispositivo y no se almacena en Supabase; las observaciones originales
de vigencia del PDF deben interpretarse a la luz de esa decisión.

**Revisión 2026-11-12:** se implementaron las observaciones 9.3, 9.4 y las conclusiones
de la sección 6 (escritura directa y dictado en el resumen). La regla de completitud por
obligatoriedad se aplicó en cliente, fusión de réplica y servidor: la migración
`20260917000700_sync_answers.sql` fue modificada, por lo que al desplegar esta rama hay
que reaplicarla en el destino (en local ya se reaplicó con `db reset`; el remoto no se
ha tocado). Ver detalles en cada sección.

**Revisión 2026-11-12 (formularios dinámicos):** se implementaron las secciones 3
(selección del formulario + retorno expediente⇄plantillas), 4 (checklist dinámico con
catálogo de 7 tipos y campo de sistema «Avance de obra») y 5 (biblioteca de formularios
con editor visual y sync offline-first de plantillas propias). Se modificaron las
migraciones `00100`, `00900`, `00700` y `01000` (ya reaplicadas en local con `db reset`;
el remoto de Supabase sigue sin desplegarse). La sección Plantillas adopta el editor y
gestor completos, manteniendo el nombre visible «Checklist». Ver detalles y linaje de
`visita.avance_general` en las secciones 3, 4 y 5.

## Estado actual de las funcionalidades agregadas

La aplicación implementa actualmente el flujo completo de plantillas, instancias de
expediente y snapshots de visita:

- Las plantillas reutilizables son **inmutables**. Desde la biblioteca no se editan en
  el mismo registro; la acción disponible es «Duplicar», que crea una plantilla nueva
  con `id`, `codigo` y `version: 1` propios.
- Cada expediente conserva una copia propia del checklist (`checklist_nombre` y
  `checklist_esquema_json`). Editar el checklist desde el expediente solo modifica esa
  copia, nunca la plantilla de origen.
- Al crear una visita se copia el checklist actual del expediente. La visita conserva
  ese snapshot aunque posteriormente cambien la plantilla o el expediente.
- Una instancia de expediente puede publicarse como una plantilla reutilizable nueva.
  La publicación no modifica las visitas existentes ni cambia el enlace del expediente
  a su plantilla original.
- Si se crea una plantilla desde un expediente, el borrador de la cabecera, el esquema,
  el nombre y la selección se conservan al volver desde la biblioteca. La nueva plantilla
  queda seleccionada y el usuario debe pulsar «Guardar cambios» para persistir el
  expediente.
- Los cambios pendientes del expediente tienen una guardia explícita: «Guardar
  cambios», «Descartar» o «Seguir editando». También existe protección al cerrar o
  recargar la página mediante `beforeunload`.
- Todas las operaciones de plantillas siguen el flujo **offline-first**: se guardan
  primero en el almacenamiento local, quedan en la cola pendiente y se envían a
  Supabase al recuperar la conexión mediante `sync_workspace_v1`. Esto incluye crear,
  duplicar, publicar y activar/desactivar plantillas.
- Las plantillas se almacenan en la tabla `plantilla_checklist`. Las plantillas de
  plataforma tienen `profesional_id = NULL` y son visibles para todos los usuarios
  autenticados. Las plantillas creadas por usuarios tienen el `profesional_id` del
  creador y solo se devuelven a ese usuario mediante las políticas RLS; actualmente no
  existe un mecanismo para compartirlas con otros usuarios.
- La biblioteca muestra plantillas propias activas y desactivadas, además de las
  plantillas de plataforma. Desactivar es una operación lógica para conservar la
  integridad de las referencias desde expedientes y visitas.
- Se añadieron pruebas unitarias, de almacenamiento/sincronización, de integración y
  E2E para verificar la copia independiente, la publicación, la protección de visitas
  existentes y la sincronización offline.

Se distinguen las solicitudes de los usuarios, las capacidades que ya existen parcialmente y las observaciones adicionales detectadas en el código. Una observación de código no equivale a un fallo reproducido en todos los dispositivos.

### Actualización 2026-11-13 — editor integral, recuperación y PDF (prioridades 1–3)

- **Checklist dentro del informe:** se pueden responder y corregir los siete tipos de
  campo sin salir del editor. La acción «Añadir o editar campos de esta visita» abre el
  editor visual sobre el snapshot de esa visita; al usar la nueva versión se guarda
  localmente y se encola su sincronización. El expediente, las otras visitas y la
  plantilla conservan sus copias.
- **Revisión integral:** el resumen muestra la cabecera de consulta y las respuestas
  del checklist antes de los hallazgos. Las conclusiones y los firmantes aparecen antes
  del cierre de campo. El editor presenta los datos de cabecera, los controles reales
  del checklist, las observaciones, la organización de fotos, las conclusiones y las
  firmas en el orden del documento. Cabecera, checklist y firmas conservan su condición
  de bloques fijos; cambiar esa regla sigue siendo una decisión pendiente.
- **Firmantes:** el resumen y el editor permiten añadir, editar y quitar hasta seis
  firmantes, con nombre, cargo e identificación/colegiatura. Cada firma puede quedar
  vacía o incorporar una imagen; se admite PNG, JPEG o WebP y se normaliza a JPEG
  pequeño antes de guardarla. Los firmantes y sus imágenes se almacenan en
  `documento_json.signers`, viajan con la cola del documento y aparecen en el PDF.
  No se implementó firma digital certificada ni un gestor de adjuntos generales.
- **Protección del informe:** los cambios del documento se autoguardan en el
  dispositivo con un escritor serializado. La navegación y la generación de PDF
  esperan los guardados pendientes; si falla el guardado, se informa el error y se
  ofrece reintento. También se advierte al cerrar/recargar con un guardado pendiente.
  Las ediciones de tarjetas independientes se rebasan sobre la última copia local
  para conservar respuestas, esquema y firmantes recientes. Las conclusiones o firmas
  creadas desde el resumen inicializan el documento con los hallazgos locales existentes.
- **Navegación:** existe una pila de pantallas conectada con atrás/adelante del
  navegador y con el botón atrás de Android. Se conservan expediente y visita,
  posición de lectura, búsqueda de expedientes y pestaña de visita dentro de la sesión;
  el contexto se recupera al recargar. El contenido del informe se recupera del
  almacenamiento local. La guardia del expediente también intercepta el regreso del
  navegador. La integración del botón físico de Android está implementada, pero su
  comportamiento todavía debe comprobarse en el dispositivo.
- **Errores y sincronización:** la apertura de sesión tiene espera limitada, reintento
  y regreso al inicio de sesión sin borrar datos locales. El formulario de acceso
  libera el estado ocupado aunque falle la petición. Conclusiones, firmantes e informe
  tienen reintentos de guardado; los errores de cierre o transferencia se muestran al
  usuario, además de liberar los controles ocupados.
- **Archivos offline:** se conserva la cola persistente y priorizada de descargas
  existente. El resumen utiliza esa misma cola, evitando un segundo pull paralelo.
  Se comprueban archivos al abrir, reconectar o volver a primer plano, en lugar de
  repetir la descarga con cada cambio local de respuestas o del documento. Los mensajes
  distinguen datos, hallazgos enviados, fotografías/audio comprobados y PDF local;
  hay conteo/progreso determinado cuando se conoce el total, indicador indeterminado
  durante la comprobación y acciones visibles para reintentar transferencias.
- **Planificación y PDF:** el PDF muestra «Visita 02/8» cuando existe un total previsto;
  sin total muestra únicamente la visita. El total es opcional y, si se informa, debe
  ser un entero positivo. Superar lo previsto no bloquea nuevas visitas ni recorta la
  numeración; la revisión de cabecera advierte de esa situación. La aplicación compara
  las fuentes del PDF generado —documento, cabecera, planificación, respuestas y datos
  profesionales— y avisa si la copia anterior queda desactualizada. En Android se
  bloquean abrir/compartir esa copia desde el panel hasta regenerarla. El PDF sigue
  generándose localmente y no se sube a Supabase; las copias exportadas fuera de la app
  no se actualizan automáticamente.
- **CSS:** tarjetas de firmantes e imágenes con tamaños limitados, cabecera legible en
  cuadrícula, progreso de archivos y adaptación de esos controles a pantallas pequeñas.

**Validación de esta actualización:** `npm run check` correcto (146 pruebas, TypeScript
y build); integración local: 6 pruebas; E2E Chromium: 3 pruebas, incluyendo edición
offline, reconexión, atrás/adelante, recarga, aislamiento del esquema de visita, imagen
de firma y regeneración de PDF tras corregir respuestas. Persisten tres advertencias
anteriores de lint y el aviso de tamaño de bundles. Esta actualización no añadió
migraciones ni desplegó cambios al Supabase remoto.

## 1. Navegación y conservación del estado

### Necesidades identificadas

- Contar con un historial o pila de pantallas: al retroceder, regresar a la pantalla y al estado anteriores, no simplemente a una sección fija.
- Conservar el contexto de trabajo: expediente y visita seleccionados, pestaña abierta, posición de lectura y datos del formulario que se estaba completando.
- Permitir salir temporalmente de un formulario para crear un recurso relacionado y regresar sin perder lo ingresado.
- Mantener un comportamiento coherente entre el botón de regreso de la interfaz, el navegador y el botón o gesto de regreso de Android.

### Caso importante: crear un formulario desde un expediente

Si el usuario está creando un expediente y necesita un formulario nuevo, debe poder abrir su creación, terminarla y volver al expediente con todos los datos conservados y el nuevo formulario seleccionado.

**Situación actual (2026-11-13):** retorno expediente⇄biblioteca y guardia de cambios
implementados. La navegación general ahora utiliza historial de pantallas y conserva
el contexto de sesión descrito en la actualización anterior; la validación física del
gesto/botón atrás en Android sigue pendiente.

## 2. Guardado local, nube y disponibilidad offline

### Necesidades identificadas

- Diferenciar claramente el guardado en el dispositivo de la sincronización con Supabase.
- El trabajo debe poder guardarse y continuar sin conexión. La ausencia de internet no debe confundirse con un error de guardado local.
- Comunicar si un contenido está guardado localmente, pendiente de subir, sincronizándose, sincronizado o con error.
- No presentar como descargados o disponibles offline los archivos que todavía existen únicamente en la nube.

### Descarga de visitas y fotografías

- Dar prioridad al contenido de la pantalla, expediente o visita que el usuario está consultando.
- Las descargas de otras visitas no deben impedir acceder primero a la información que se necesita en ese momento.
- Mostrar el progreso de descarga de las fotografías pendientes, con una barra o porcentaje y una cantidad comprensible, por ejemplo: «12 de 20 fotos descargadas».
- Distinguir una descarga en curso de una descarga detenida, fallida o pendiente de conexión.
- Cuando no pueda calcularse un porcentaje real, evitar porcentajes ficticios: mostrar cantidad de archivos o un estado de carga explícito.

## 3. Expedientes

### Total de visitas programadas

- Permitir ingresar y modificar el total de visitas previstas para la obra.
- Reflejar ese dato en el informe PDF, por ejemplo: «Visita 2/8».
- Mantener coherencia entre el expediente, el listado de visitas y el informe generado.

**Situación actual (2026-11-13):** el formulario permite ingresar o modificar un total
opcional positivo. El detalle mantiene el conteo de visitas creadas y el PDF muestra
el número real de visita sobre el total programado. Si no se conoce, se deja vacío y
el PDF omite el denominador; superar lo previsto conserva la numeración real y no
bloquea nuevas visitas.

### Selección del formulario

- Mostrar primero los tres formularios usados más recientemente por el usuario.
- Si no existe historial de uso, mostrar tres plantillas predeterminadas de la plataforma.
- Ofrecer una vista previa fiel al formulario real: controles, secciones y tipos de respuesta, no solamente nombres de campos.
- Incluir una acción «Crear nuevo formulario» que permita volver al expediente sin perder información.
- Al regresar, dejar seleccionado el formulario recién creado y colocarlo en la primera posición de esas tres opciones.

**Aspecto por precisar:** qué cuenta como «uso reciente» y cómo se combina ese criterio con la creación de un formulario nuevo.

**Situación actual (implementado el 12-11-2026, ajustado el 13-11-2026):** el expediente ya trae `checklist_template_id` (FK a la plantilla de origen, en `expediente` y `visita`) y el panel de selección muestra primero las tres opciones de «Uso reciente» —checklists de las visitas más recientes ordenadas por `fecha` descendente; sin historial, tres plantillas de plataforma—, seguidas del resto del catálogo, con vista previa fiel renderizada por tipo de campo. La acción «Crear nuevo formulario» redirige a la sección Plantillas conservando el borrador del expediente íntegro; al terminar, el retorno automático deja la plantilla recién creada seleccionada y anclada en la primera posición. La acción «Editar checklist de este expediente» edita **solo la copia del expediente** (no la plantilla) y exige pulsar «Guardar cambios»; si se intenta salir con cambios pendientes se ofrece guardar o descartar explícitamente. Publicar la copia como plantilla crea una fila nueva e inmutable y mantiene el enlace original. El retorno desde la biblioteca solo existe si se vino del expediente.

## 4. Checklist de visita: evolución a formulario dinámico

### Concepto y terminología

- Tratar el checklist como un formulario dinámico, no únicamente como una lista de verificaciones de sí/no.
- Unificar el nombre visible en la aplicación. Decisión adoptada: el nombre visible se mantiene como **«Checklist»** (no se renombra a «Formularios»).
- Permitir distintos tipos de campos y bloques. Catálogo aprobado (7 tipos): `boolean` (Sí/No/N.A.), `text` (texto corto), `textarea` (párrafo), `number` (con unidad opcional, p. ej. m, m², S/), `percent` (0–100), `date` y `select` (opción única de una lista configurable). El esquema está versionado (`version: 2`, compatible con esquemas `version: 1` existentes).
- Incluir un campo de porcentaje de avance de obra, diferenciándolo del porcentaje de llenado del formulario.

**Situación actual (implementado el 12-11-2026):** el componente compartido `ChecklistForm` renderiza el catálogo completo por tipo (segmentado Sí/No/N.A., texto corto, párrafo, número con unidad, porcentaje 0–100 con sufijo `%` sin slider, fecha y selección única —radios si hay ≤4 opciones, lista desplegable si hay más—) tanto en la visita como en las vistas previas. El **avance de obra** es un campo de sistema obligatorio (`avance_obra`, tipo `percent`): se inyecta automáticamente en el esquema del expediente y de cada visita, aparece en el editor de plantillas deshabilitado con la nota «Campo de sistema · no editable», y en la visita se muestra como tarjeta destacada. La validación del patch de respuestas en el servidor acepta los 7 tipos (opciones del `select`, rangos min/max, 0–100 para porcentajes); un `0` cuenta como respuesta válida y la completitud por obligatoriedad lo respeta.

**Nota de linaje de `avance_general`:** la columna `visita.avance_general` existía en la BD desde la migración 001 sin uso; hoy se **espeja** desde la respuesta `avance_obra` del checklist (migración 007 escribe la columna al recibir el patch). El checklist es la única fuente de verdad para el usuario; la columna es un reflejo de consulta. **Decisión futura:** eliminar la columna de la BD o retirar el campo del checklist; mientras tanto, cualquier lectura de avance debe preferir `checklist_respuestas_json.avance_obra`.

### Guardado automático

- Guardar automáticamente las respuestas en el dispositivo.
- Eliminar la necesidad de presionar «Guardar checklist» para conservar el trabajo.
- Mostrar un estado de guardado comprensible, sin confundirlo con la sincronización en la nube.
- Conservar las respuestas al cambiar de pestaña, retroceder o volver a abrir la visita.

**Situación actual:** autosave implementado y botones manuales retirados. Las respuestas y
su operación pendiente se persisten juntas. Hay indicadores de guardado/error y una
barrera de navegación interna que espera el guardado local.

### Edición posterior

- Permitir completar o corregir el formulario también desde el editor del informe.
- Poder añadir campos omitidos y responderlos, con una experiencia equivalente a llenar el formulario inicialmente.
- Las modificaciones de una visita no deben alterar otras visitas históricas ni la plantilla de origen.

**Situación actual:** el esquema admite campos booleanos, texto, fecha y número. La ampliación solicitada va más allá de ese conjunto.

**Actualización (2026-11-13):** el esquema admite el catálogo de siete tipos y el
editor del informe permite corregir respuestas y añadir o editar campos de la copia
de esa visita. Las respuestas se autoguardan mediante el protocolo de patches; el
esquema se guarda al pulsar «Usar esta versión». Las otras visitas no cambian.

## 5. Biblioteca de formularios y plantillas

### Creación y reutilización

- Convertir la sección actual de plantillas en un espacio completo de gestión de formularios.
- Permitir crear formularios propios desde cero o a partir de formularios y plantillas anteriores.
- Ofrecer un editor visual comparable, como referencia de interacción, al constructor de Google Forms: crear campos, configurar sus características y organizar el contenido.
- Mostrar una vista previa que represente cómo se completará realmente el formulario.
- Conservar la distinción entre plantilla reutilizable, copia del expediente y copia de cada visita.

### Tres plantillas base

La creación debe ofrecer tres puntos de partida:

1. Una plantilla general amplia, con la mayoría de los campos útiles para el trabajo habitual de un arquitecto.
2. Una plantilla orientada a otro tipo frecuente de obra.
3. Una plantilla orientada a un tercer tipo frecuente de obra.

Los dos tipos de obra específicos y el contenido de las tres plantillas quedan pendientes de validación con los arquitectos; no se asumen aquí categorías que todavía no se han acordado.

**Situación histórica:** antes de la implementación de la biblioteca, la sección `Templates` solo mostraba tarjetas con nombre, cantidad de secciones, cantidad de campos y versión. La situación actual se describe en la actualización siguiente.

**Actualización (implementado el 12-11-2026):** la sección Plantillas es ahora la **Biblioteca de formularios**: gestor completo con búsqueda, agrupación «De la plataforma» / «Mis formularios» / «Desactivados», y un **editor visual** comparable al constructor de Google Forms —secciones reordenables, campos configurables por tipo (etiqueta, descripción, obligatoriedad, opciones, min/max, unidad), reordenar y eliminar, con vista previa fiel a la vez real de llenado—. Las plantillas creadas sin conexión siguen el mismo flujo offline-first del resto del workspace: guardado local primero (outbox) y subida al reconectar, con distintivo «Pendiente de subir» en la tarjeta. El borrado es **lógico** (desactivar/reactivar), nunca físico, para preservar la integridad de la FK `checklist_template_id`. Las tres plantillas base de plataforma (G050, SUPERVISION, VACIO) permanecen intactas y no editables; el fallback offline las mantiene siempre disponibles. **Todas las plantillas son inmutables:** la acción «Editar» se sustituye por «Duplicar», que crea una plantilla nueva con id y código propios. La copia del expediente es la instancia editable y solo cambia ese expediente; cada visita conserva su propia copia congelada. Publicar una instancia como plantilla crea una plantilla nueva sin modificar el expediente de origen ni sus visitas. Desactivar/reactivar sigue siendo una mutación de ciclo de vida permitida.

## 6. Resumen de visita — paso 3

### Contenido y jerarquía

- Mostrar una revisión integral de la visita, no únicamente los grupos capturados o un indicador de respuestas.
- Incluir la cabecera como información de consulta, no editable en esta pantalla.
- Mostrar el contenido del formulario con sus respuestas, incluyendo qué quedó sin responder cuando corresponda.
- Presentar las observaciones y fotografías con claridad.
- Evitar que el porcentaje de llenado del checklist domine toda la percepción del avance de la visita.
- Colocar la acción y el estado de conclusión de la visita al final, después de revisar el contenido, las conclusiones y los firmantes.
- Explicar con claridad la diferencia entre concluir el trabajo de campo, editar el informe y generar el PDF.

### Conclusiones

- Permitir escribir conclusiones generales o dictarlas mediante audio.
- Las conclusiones son opcionales y pueden quedar vacías.
- El texto obtenido por dictado debe poder revisarse y corregirse.

**Situación actual (2026-11-12):** el resumen ya ofrece un campo de conclusiones con
autoguardado y dos vías de entrada: escribir directamente o dictar por voz (Web Speech
API del navegador, español). El texto queda siempre en el textarea para revisarlo y
corregirlo. Comparte el bloque `conclusions` del documento del informe con el editor,
de modo que no se crean dos contenidos distintos; si la visita nunca abrió el editor,
el guardado inicializa el documento incluyendo los hallazgos locales existentes
(ajuste del 13-11-2026). El dictado requiere
Chrome/Edge e internet; en la app Android el botón permanece desactivado de momento
con un aviso, y el dictado nativo (Whisper) queda como trabajo futuro. Firmantes y
firmas mediante imágenes se implementaron el 13-11-2026.

### Firmantes y firmas

- Priorizar la sección de firmantes, distinguiéndola de los adjuntos generales.
- Permitir asociar una fotografía o imagen escaneada de la firma a cada firmante.
- Ofrecer por ahora dos opciones operativas: dejar la firma vacía o incorporar una imagen de la firma.
- Comunicar la firma digital como una posibilidad futura, no como una función disponible.
- No presentar una imagen de firma como si fuera una firma digital certificada.

**Situación actual (2026-11-13):** la sección «Firmantes y firmas» está disponible en
el resumen y en el informe, con edición de identidad e imágenes opcionales y
autoguardado offline-first. El PDF incorpora esas imágenes o conserva el espacio
sin imagen. El tratamiento futuro de adjuntos generales queda por precisar; no se
solicita eliminarlos del modelo.

## 7. Editor integral del informe

### Ver el documento completo

- Permitir consultar todo lo que aparecerá en el informe, siguiendo el orden real de salida del PDF.
- Adaptar la presentación a la pantalla para que sea legible; no es necesario reproducir una hoja A4 diminuta en el celular.
- Mostrar la cabecera completa, el formulario, las observaciones completas, fotografías, conclusiones y firmantes.
- Hacer evidente qué contenido es editable y cuál se modifica desde otra sección.

La cabecera se pide no editable en el resumen. Su posibilidad de edición dentro del editor integral debe aclararse antes de asumir un comportamiento diferente.

### Bloques dinámicos

- Ofrecer una experiencia de bloques editables y reorganizables, similar a un cuaderno de Colab como referencia de interacción.
- Permitir cambiar el orden de los bloques de contenido.
- Permitir añadir observaciones nuevas, aunque no provengan de una captura previa.
- Admitir bloques de observación con varias fotografías o únicamente texto.
- Permitir editar las observaciones completas y organizar sus fotografías.
- Permitir incorporar imágenes de firmas en la sección correspondiente.

**Situación actual (2026-11-13):** existen bloques de captura, texto y conclusiones,
con movimiento de bloques no fijos, selección/orden de fotos y deshacer/rehacer.
Cabecera, checklist y firmas son bloques fijos, ahora con su contenido visible y los
controles correspondientes en el editor. Las respuestas y los firmantes se editan
directamente; la cabecera se consulta y se modifica desde el expediente. El historial
de deshacer/rehacer sigue siendo de la sesión del editor; el contenido se autoguarda.

**Aspecto por definir:** si cabecera, formulario y firmas mantendrán posiciones fijas o también podrán moverse. La solicitud de bloques móviles no resuelve por sí sola esta regla.

### Formulario dentro del informe

- Permitir responder, corregir y añadir campos desde el editor.
- Mantener consistentes las respuestas de la visita, el resumen y el PDF.
- No obligar a abandonar el editor para corregir un dato olvidado del formulario.

**Situación actual (2026-11-13):** implementado para respuestas y edición del esquema
de la visita, con la misma representación de controles que el checklist principal.

## 8. Aplicación Android: barra del sistema y encabezado

- Corregir la superposición de la hora y los indicadores del sistema con el encabezado de la aplicación.
- Elegir una presentación coherente: respetar el área de la barra de estado para verla sin superposición o utilizar un modo inmersivo que la oculte correctamente.
- Evitar soluciones que simplemente tapen la hora mientras dejan controles o información inaccesibles.
- Comprobar el comportamiento tanto en pantallas habituales como en captura de cámara y con diferentes tamaños de pantalla.

Este punto proviene del comportamiento observado en el celular; no se da por diagnosticada aquí su causa nativa exacta.

## 9. Observaciones adicionales de diseño y funcionamiento

Estos puntos se añaden a las solicitudes anteriores a partir de la lectura del código y de los incidentes de esta revisión.

### 9.1 Inicio de sesión sin salida clara ante fallos

En `App.tsx`, la carga inicial espera `getSession()` sin un manejo explícito de rechazo ni una salida de espera con recuperación. Ya se observó la pantalla «Abriendo tu espacio…» durante fallos de renovación de sesión.

**Necesidad:** mostrar un error recuperable y ofrecer reintento o regreso al inicio de sesión, sin exigir borrar el almacenamiento del navegador ni poner en riesgo trabajo local pendiente.

**Situación actual (2026-11-13):** implementados límite de espera, manejo de rechazo,
reintento y regreso a la pantalla de acceso sin borrar trabajo local.

### 9.2 Indicadores que pueden prometer más de lo disponible

La visita muestra «Disponible sin conexión», y el espacio de trabajo puede anunciar «Todo sincronizado» después de sincronizar perfil y datos de expedientes/visitas, mientras el multimedia se gestiona por separado.

**Necesidad:** que los mensajes distingan datos, fotografías, audios e informe PDF. «Disponible offline» y «Todo sincronizado» deben reflejar el alcance real, no solo una parte del trabajo.

**Situación actual (2026-11-13):** los indicadores principales distinguen datos y
archivos; el resumen informa del envío de hallazgos locales y el panel de descarga
comprueba fotografías/audio por separado. El PDF se identifica como una copia local
generada bajo demanda.

### 9.3 Completitud del formulario y obligatoriedad

El resumen calculaba la completitud contando todos los campos respondidos, aunque el
esquema admite `required`. La advertencia «Te falta concluir el checklist» convive con
una acción para concluir de todos modos.

**Necesidad:** distinguir campos obligatorios de opcionales y decidir qué impide realmente concluir una visita. No presentar un formulario como incorrecto solo porque sus campos opcionales están vacíos.

**Implementado (2026-11-12):** la completitud ahora depende solo de los campos
obligatorios (`checklistCompleted` en `packages/domain`), aplicada en el guardado local
de respuestas, en la fusión de la réplica incremental y en el servidor
(`sync_patch_answers_v1`, migración 007 modificada y reaplicada en local). Los campos
obligatorios se marcan con asterisco en el checklist, se advierte «Faltan N campos
obligatorios por responder» al pie del checklist, y el diálogo para concluir ahora
indica exactamente cuántos obligatorios faltan. Un formulario sin campos obligatorios
nunca queda bloqueado por completitud; el porcentaje de llenado sigue siendo informativo.

### 9.4 Progreso por sección poco claro

El encabezado de cada sección del checklist utilizaba el conteo global de respuestas, no el de esa sección.

**Necesidad:** mostrar un progreso global claramente identificado o un conteo propio por sección, evitando repetir números que parezcan corresponder a cada grupo.

**Implementado (2026-11-12):** cada sección muestra su propio conteo «X de Y
respondidas» y el global aparece identificado como «Avance global: X de Y · Z%».
Además se corrigió un conteo: una respuesta anulada (`null`) ya no cuenta como
respondida.

### 9.5 Conservación del trabajo del editor

**Situación actual (2026-11-13):** el editor autoguarda el documento localmente, muestra
el estado y ofrece reintento. La barrera de navegación espera ese guardado y evita
salir si falló; `beforeunload` advierte mientras el guardado está pendiente. Al volver
se recupera el contenido local. El historial de deshacer/rehacer permanece en memoria.

### 9.6 Vigencia del PDF después de cambios externos al documento

**Situación actual (2026-11-13):** el PDF se regenera siempre desde las fuentes locales
actuales después de esperar el guardado. Durante la sesión se compara la copia
generada con documento, cabecera, respuestas y datos profesionales; si cambian se
indica «PDF anterior desactualizado». Una prueba E2E verifica que corregir una
respuesta exige regenerar el PDF aunque no cambie la revisión de los bloques.

### 9.7 Orden inicial de observaciones

El editor ordena inicialmente los grupos capturados del más reciente al más antiguo.

**Decisión pendiente:** confirmar si los arquitectos esperan orden cronológico, orden inverso u otro criterio. El resumen, editor y PDF deben explicar y conservar el mismo orden elegido.

### 9.8 Estados de error y recuperación

**Situación actual (2026-11-13):** el checklist utiliza autoguardado, no el antiguo
botón manual. Checklist, informe, conclusiones y firmantes distinguen estado de
guardado local y error, con reintento. Las acciones de acceso, cierre de campo y
transferencia liberan el estado ocupado aunque fallen y muestran el error al usuario.

## 10. Referencias de la revisión

- `apps/client/src/App.tsx`: navegación, expedientes, formulario de visita y catálogo de plantillas.
- `apps/client/src/features/Summary.tsx`: resumen, completitud, conclusión de visita, conclusiones editables con dictado y secciones pendientes.
- `apps/client/src/features/dictation.ts`: dictado por voz del resumen (Web Speech API, solo web).
- `apps/client/src/features/serial-autosave.ts`: autoguardado serializado del checklist y de las conclusiones.
- `apps/client/src/features/Report.tsx`: edición, guardado y generación del informe.
- `apps/client/src/features/media-sync.ts`: sincronización de archivos y grupos de captura.
- `packages/domain/src/index.ts`: esquema del formulario, visitas, bloques del informe y regla de completitud.
- `packages/report-pdf/src/informe.tsx`: composición del PDF.
- `supabase/migrations/20260917000700_sync_answers.sql`: recomputación de completitud en el servidor (modificada el 2026-11-12).
- `tests/checklist-completion.test.ts`: pruebas de la regla de completitud por obligatoriedad.

El documento no cambia por sí mismo las reglas de negocio existentes ni autoriza modificaciones del esquema. Las decisiones abiertas se mantienen explícitas para no convertir supuestos en requisitos.
