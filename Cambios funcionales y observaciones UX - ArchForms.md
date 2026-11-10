# ArchForms — Cambios funcionales y observaciones de experiencia de uso

Este documento reúne y reorganiza las necesidades identificadas durante la revisión con arquitectos y la revisión del código actual. Es un inventario de cambios de comportamiento y experiencia de uso: no define una secuencia de implementación, estimaciones ni una arquitectura técnica.

**Revisión 2026-11-10:** se implementaron autosave, protocolo idempotente, réplica incremental
de expedientes/visitas y transferencias persistentes. Estado y pruebas en
`docs/offline-sync-validation.md`. Esto no da por implementadas las funcionalidades de
formularios, firmas, resumen ni editor descritas a continuación. El PDF ahora se regenera
siempre en el dispositivo y no se almacena en Supabase; las observaciones originales
de vigencia del PDF deben interpretarse a la luz de esa decisión.

Se distinguen las solicitudes de los usuarios, las capacidades que ya existen parcialmente y las observaciones adicionales detectadas en el código. Una observación de código no equivale a un fallo reproducido en todos los dispositivos.

## 1. Navegación y conservación del estado

### Necesidades identificadas

- Contar con un historial o pila de pantallas: al retroceder, regresar a la pantalla y al estado anteriores, no simplemente a una sección fija.
- Conservar el contexto de trabajo: expediente y visita seleccionados, pestaña abierta, posición de lectura y datos del formulario que se estaba completando.
- Permitir salir temporalmente de un formulario para crear un recurso relacionado y regresar sin perder lo ingresado.
- Mantener un comportamiento coherente entre el botón de regreso de la interfaz, el navegador y el botón o gesto de regreso de Android.

### Caso importante: crear un formulario desde un expediente

Si el usuario está creando un expediente y necesita un formulario nuevo, debe poder abrir su creación, terminarla y volver al expediente con todos los datos conservados y el nuevo formulario seleccionado.

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

**Situación actual:** el modelo ya incluye `total_visitas_programadas`, y el detalle del expediente lo utiliza para mostrar las visitas creadas respecto del total. La necesidad es revisar y completar la experiencia de ingreso y su presentación en el PDF, sin duplicar el dato.

**Comportamientos por definir:** qué mostrar si no se conoce el total y qué sucede si las visitas realizadas superan las previstas.

### Selección del formulario

- Mostrar primero los tres formularios usados más recientemente por el usuario.
- Si no existe historial de uso, mostrar tres plantillas predeterminadas de la plataforma.
- Ofrecer una vista previa fiel al formulario real: controles, secciones y tipos de respuesta, no solamente nombres de campos.
- Incluir una acción «Crear nuevo formulario» que permita volver al expediente sin perder información.
- Al regresar, dejar seleccionado el formulario recién creado y colocarlo en la primera posición de esas tres opciones.

**Aspecto por precisar:** qué cuenta como «uso reciente» y cómo se combina ese criterio con la creación de un formulario nuevo.

## 4. Checklist de visita: evolución a formulario dinámico

### Concepto y terminología

- Tratar el checklist como un formulario dinámico, no únicamente como una lista de verificaciones de sí/no.
- Unificar el nombre visible en la aplicación. «Formularios» describe mejor el alcance solicitado; «Checklists» sigue siendo una alternativa pendiente de decisión.
- Permitir distintos tipos de campos y bloques. El catálogo concreto de controles debe acordarse con ejemplos reales de uso.
- Incluir un campo de porcentaje de avance de obra, diferenciándolo del porcentaje de llenado del formulario.

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

**Situación actual:** la sección `Templates` muestra tarjetas con nombre, cantidad de secciones, cantidad de campos y versión. No constituye todavía el gestor y constructor solicitado.

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

**Situación actual:** el resumen muestra un mensaje de funcionalidad futura en lugar de un campo de conclusiones. El documento del informe sí contempla un bloque de conclusiones; ambas experiencias deben ser coherentes y no crear dos contenidos distintos.

### Firmantes y firmas

- Priorizar la sección de firmantes, distinguiéndola de los adjuntos generales.
- Permitir asociar una fotografía o imagen escaneada de la firma a cada firmante.
- Ofrecer por ahora dos opciones operativas: dejar la firma vacía o incorporar una imagen de la firma.
- Comunicar la firma digital como una posibilidad futura, no como una función disponible.
- No presentar una imagen de firma como si fuera una firma digital certificada.

**Situación actual:** «Firmantes y Adjuntos» es una sección pendiente en el resumen. El tratamiento futuro de adjuntos generales queda por precisar; no se solicita eliminarlos del modelo.

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

**Situación actual:** ya existen bloques de captura, texto y conclusiones, y funciones para mover algunos bloques y deshacer o rehacer cambios. Cabecera, checklist y firmas son bloques fijos. No se trata de construir todo desde cero, sino de ampliar y unificar la edición.

**Aspecto por definir:** si cabecera, formulario y firmas mantendrán posiciones fijas o también podrán moverse. La solicitud de bloques móviles no resuelve por sí sola esta regla.

### Formulario dentro del informe

- Permitir responder, corregir y añadir campos desde el editor.
- Mantener consistentes las respuestas de la visita, el resumen y el PDF.
- No obligar a abandonar el editor para corregir un dato olvidado del formulario.

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

### 9.2 Indicadores que pueden prometer más de lo disponible

La visita muestra «Disponible sin conexión», y el espacio de trabajo puede anunciar «Todo sincronizado» después de sincronizar perfil y datos de expedientes/visitas, mientras el multimedia se gestiona por separado.

**Necesidad:** que los mensajes distingan datos, fotografías, audios e informe PDF. «Disponible offline» y «Todo sincronizado» deben reflejar el alcance real, no solo una parte del trabajo.

### 9.3 Completitud del formulario y obligatoriedad

El resumen calcula la completitud contando todos los campos respondidos, aunque el esquema admite `required`. La advertencia «Te falta concluir el checklist» convive con una acción para concluir de todos modos.

**Necesidad:** distinguir campos obligatorios de opcionales y decidir qué impide realmente concluir una visita. No presentar un formulario como incorrecto solo porque sus campos opcionales están vacíos.

### 9.4 Progreso por sección poco claro

El encabezado de cada sección del checklist utiliza el conteo global de respuestas, no el de esa sección.

**Necesidad:** mostrar un progreso global claramente identificado o un conteo propio por sección, evitando repetir números que parezcan corresponder a cada grupo.

### 9.5 Conservación del trabajo del editor

El editor dispone de un guardado explícito y mantiene cambios e historial de deshacer en memoria.

**Necesidad adicional a validar:** conservar borradores o advertir antes de abandonar un documento con cambios sin guardar. El usuario debe saber si su edición ya está protegida al retroceder o cerrar la app.

### 9.6 Vigencia del PDF después de cambios externos al documento

La comprobación de vigencia usa la revisión del documento, pero el PDF también depende de datos como la cabecera y las respuestas del formulario.

**Riesgo a verificar:** que un PDF aparezca vigente después de cambiar información que no incrementa la revisión del árbol de bloques. El usuario debe poder reconocer cuándo necesita regenerarlo.

### 9.7 Orden inicial de observaciones

El editor ordena inicialmente los grupos capturados del más reciente al más antiguo.

**Decisión pendiente:** confirmar si los arquitectos esperan orden cronológico, orden inverso u otro criterio. El resumen, editor y PDF deben explicar y conservar el mismo orden elegido.

### 9.8 Estados de error y recuperación

El guardado manual del checklist activa el estado «Guardando…», pero no utiliza `finally` para restablecerlo si falla la operación.

**Necesidad:** evitar controles permanentemente ocupados y mostrar si el error corresponde a almacenamiento local o conexión, junto con una forma segura de reintentar.

## 10. Referencias de la revisión

- `apps/client/src/App.tsx`: navegación, expedientes, formulario de visita y catálogo de plantillas.
- `apps/client/src/features/Summary.tsx`: resumen, completitud, conclusión de visita y secciones pendientes.
- `apps/client/src/features/Report.tsx`: edición, guardado y generación del informe.
- `apps/client/src/features/media-sync.ts`: sincronización de archivos y grupos de captura.
- `packages/domain/src/index.ts`: esquema del formulario, visitas y bloques del informe.
- `packages/report-pdf/src/informe.tsx`: composición del PDF.

El documento no cambia por sí mismo las reglas de negocio existentes ni autoriza modificaciones del esquema. Las decisiones abiertas se mantienen explícitas para no convertir supuestos en requisitos.
