# Validación de la base offline — entorno local

Rama: `feat/offline-sync-foundation`. No se ha desplegado a Supabase online.

## Implementado y comprobado

### Última ampliación: workspace idempotente y PDF exclusivamente local

- Migración 009 aplicada solo a la BD local: RPC `sync_workspace_v1` para creación
  y parches de expedientes/visitas, comandos validados con lista de campos permitidos,
  deduplicación y reconciliación de colisiones de numeración bajo bloqueo por propietario.
- Los comandos nuevos se congelan en la transacción de guardado local. No se reconstruyen
  a partir del estado actual durante un reintento. Los pendientes antiguos conservan
  su camino anterior; aún falta cerrar esa compatibilidad antes del despliegue.
- Un error bloquea las siguientes operaciones de esa entidad y sus dependencias,
  pero permite procesar entidades independientes. El trabajo rechazado permanece local.
- Lectura remota paginada por ID para evitar truncar el workspace a 1000 filas.
  Sigue siendo una lectura completa: todavía no es la réplica incremental definitiva.
- El PDF se genera de nuevo en cada solicitud; se retiraron la subida, el reintento de
  subida y la reutilización automática. No se borraron archivos/columnas históricos.
- La generación lee solo fotografías referenciadas y presenta error si faltan.
- Chromium generó y abrió dos PDFs consecutivos con el backend bloqueado y sin
  solicitudes de subida de binarios. La prueba mantiene disponible Vite; no equivale
  a validar el arranque de una PWA completamente offline.
- Integración adicional: creación offline con respuesta perdida, parches en campos
  independientes y dos visitas simultáneas solicitando número 1, conservadas como 1 y 2.

La UI aún no identifica explícitamente números provisionales antes de recibir el
resultado remoto. El registro técnico de cambios de workspace existe, pero todavía
no tiene consumidor incremental en el cliente. No hay aún borrados/tombstones generales.

Resultados de esta ampliación: 102 pruebas unitarias, tres pruebas de integración
local y una prueba de navegador correctas; TypeScript y build correctos. Se compiló
APK local durante la entrega; no hubo validación en dispositivo físico.

- Almacenes locales por entidad y cola transaccional en IndexedDB y SQLite.
- Migración conservando el snapshot anterior como respaldo.
- Autosave de respuestas con operaciones granulares; el guardado de estado/documento nuevo no reemplaza respuestas remotas.
- RPC de respuestas y perfil con deduplicación por usuario e identificador de operación.
- Coordinador de datos/perfil independiente de React: ejecución única por instancia, reconexión, polling y reintentos.
- Recuperación visible si la sesión inicial falla o excede el tiempo de espera.
- Consulta de archivos al abrir la visita, progreso por cantidad y comprobación de tamaño/checksum antes de escribir el archivo.
- Cancelación cooperativa al abandonar la visita (la petición en curso puede acabar, pero no se publica después de observar la cancelación).

## Resultados automatizados

### Ampliación: comprobación del caso observado y navegador real

Se consultó la BD local en modo lectura para el expediente `IthinkIlltry`, visita 1.
Se confirmó `FINALIZADA`, checklist completo y las respuestas `licencia=si`,
`planos=no`, `cuaderno=si`, `epi=na`, `orden=si`, `observacion=no che`.

La integración ahora comprueba también fallo antes del envío, reapertura de la cola,
respuesta perdida después del commit, escritura posterior de otro dispositivo,
30 cambios offline consecutivos y cinco solicitudes duplicadas concurrentes.

`npm run test:e2e` pasó en Chromium real: guardado sin red, lectura directa de la BD
que confirma que aún no recibió el cambio, reconexión y lectura desde otro contexto
de navegador autenticado. Se usa un servidor independiente en el puerto 5178 y datos
sintéticos locales, no la sesión ni el almacenamiento del usuario.

El informe ahora presenta error/reintento si falla su carga local y una salida tras
12 segundos de espera. Esto evita la espera indefinida, pero no hace disponibles
módulos que Vite todavía no haya servido: para validar arranque totalmente offline
hay que probar la APK o la PWA instalada y almacenada, no solo el servidor de desarrollo.
La recuperación visual del informe no tiene aún una prueba automatizada de navegador.

El indicador distingue offline, error, sincronización activa, pendientes e inactividad;
no presenta cero pendientes como prueba de que todos los archivos estén sincronizados.

- `npm run check`: 98 pruebas, TypeScript y build correctos. Permanecen tres advertencias anteriores de lint y advertencia de tamaño de bundles.
- `npm run test:integration:local`: dos pruebas de integración correctas contra Postgres local.
- La integración usa dos almacenes IndexedDB independientes del mismo propietario; prueba edición offline en campos diferentes y posterior guardado de estado sin revertir las respuestas.
- SQLite se prueba con motor real de Node y adaptador de plugin simulado, no con Android real.
- `npm run android:build:local`: APK compilada correctamente contra Supabase local.

Migraciones aplicadas únicamente en local: 007 (respuestas) y 008 (perfil). La 006 existente también se aplicó porque estaba pendiente.

## Probar sin cambiar `.env.local`

```bash
npx supabase start
npx supabase migration up --local
npm run dev:local
```

El último comando obtiene la clave pública del entorno local y sobreescribe las variables solo para ese proceso. No imprime claves ni modifica la configuración online del cliente.

1. Crear una cuenta local y un expediente con visita.
2. Desconectar la red desde DevTools o usar modo avión en Android.
3. Editar varias respuestas y esperar «Guardado en este dispositivo».
4. Salir de la visita y volver; recargar o cerrar/reabrir después de guardar.
5. Recuperar conexión y comprobar que desaparecen los pendientes de datos.
6. Abrir el mismo usuario en otro navegador y comprobar respuestas.
7. Cambiar campos diferentes en ambos clientes; comprobar que se conservan ambos.
8. Cambiar el mismo campo; prevalece la última operación aceptada por el servidor.

Las cuentas locales son independientes de las online. Las pruebas crean cuentas sintéticas locales; no eliminan esas cuentas ni el registro técnico de operaciones. La prueba nueva elimina su visita y expediente de prueba.

## Android local por USB

APK: `apps/client/android/app/build/outputs/apk/debug/app-debug.apk`.

Para usar `127.0.0.1:54321` desde el teléfono se necesita el túnel USB:

```bash
adb reverse tcp:54321 tcp:54321
adb install -r apps/client/android/app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n com.archventures.archforms/.MainActivity
```

No se instaló ni validó en teléfono en esta entrega: `adb devices` no mostró dispositivos.

## Límites actuales: no declarar terminada toda la arquitectura

- El coordinador de datos/perfil convive todavía con `MediaSyncManager`; no es aún un coordinador único de todo el sistema.
- La descarga incremental de respuestas existe como RPC/adaptador, pero el workspace de la app todavía se refresca mediante lectura completa.
- Las operaciones nuevas de expedientes/visitas ya usan RPC idempotente; los pendientes antiguos y multimedia aún requieren adaptación integral.
- No hay todavía tombstones generales. Las creaciones nuevas reconcilian números en servidor; las operaciones antiguas no adquieren esa capacidad automáticamente.
- Los clientes antiguos con escritura completa pueden sobrescribir respuestas; no desplegar sin resolver compatibilidad o exigir actualización.
- La descarga prioriza la visita consultada frente al recorrido completo de arranque, pero no es todavía una cola persistente por archivo con prioridades, caché y reanudación completa.
- El indicador de archivos refleja la consulta actual, no certifica que todo el expediente esté disponible offline. No se garantiza reparación de archivos previamente borrados del dispositivo.
- No hay coordinación explícita entre pestañas, ni garantía de sincronización con Android cerrado.
- Falta validar navegación global durante errores de autosave y extraer el formulario de `App.tsx`.

## Recuperación

No borrar almacenamiento local para resolver fallos: podría haber operaciones pendientes. No volver a una app que abra IndexedDB versión 1 después de migrar a versión 2; hace falta una versión compatible o una recuperación específica. No eliminar los registros técnicos de deduplicación mientras puedan existir reintentos antiguos.
