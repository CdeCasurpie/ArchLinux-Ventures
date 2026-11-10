# Infraestructura offline — estado y validación

Actualizado: 2026-11-10. Rama: `feat/offline-sync-foundation`.
Todos los cambios de BD se aplicaron exclusivamente a Supabase local. No hubo push,
merge a main ni despliegue remoto.

## Implementación actual

### Persistencia y envío

- SQLite en Android e IndexedDB en web, con entidades y operaciones pendientes.
- Guardado de datos y comando remoto en una transacción; migración del formato antiguo
  conserva un respaldo y el orden de pendientes.
- Autosave de respuestas; barrera de guardado antes de la navegación interna.
- Operaciones idempotentes de perfil, respuestas, expedientes y visitas.
- Adaptación de snapshots antiguos mediante RPC; no se utilizan upserts directos en el
  adaptador del workspace. Campos antiguos no recuperables producen error conservando
  el comando, en lugar de descartarse silenciosamente.
- Sobrescritura por última operación aceptada dentro de la misma unidad. Respuestas y
  campos distintos se combinan; documento y esquema siguen siendo unidades completas.
- Numeración de visitas reconciliada en servidor. La UI y el PDF advierten si aún es provisional.
- Errores permanentes conocidos quedan bloqueados hasta reintento explícito; las entidades
  independientes pueden continuar. No hay una acción automática de descartar trabajo rechazado.

### Recepción incremental

- Bootstrap paginado con cursor previo, seguido por eventos posteriores a ese cursor.
- Triggers registran también escrituras antiguas/directas de expedientes y visitas.
- Páginas ordenadas, cursor validado y aplicación transaccional local junto a los cambios.
- Reaplicación de parches locales pendientes sobre la base remota.
- Tombstones para expedientes/visitas; borrar un expediente elimina sus visitas de la réplica
  cuando no hay trabajo local pendiente que conservar.
- El catálogo de plantillas y el perfil todavía se consultan completos: no se presentan como
  una réplica incremental de todas las tablas de dominio.

### Multimedia

- Coordinación común de datos, perfil, subidas y descargas; las transferencias se ejecutan
  en segundo plano dentro de la app sin bloquear nuevos pases de datos.
- Despacho de outbox multimedia filtrado por cuenta/visitas, incluidos marcadores antiguos
  de transcripción que se convierten en payloads antes de enviarse.
- Payloads congelados en producción; una confirmación antigua no elimina una versión nueva.
- RPC transaccional para archivo, grupo y fotos, con deduplicación por snapshot, comprobación
  de propiedad y existencia del objeto subido. Una transcripción posterior no se revierte por
  el reintento de una operación anterior. El comentario editado no se modifica por ese RPC.
- No se borran originales por tener más de siete días ni por estar sincronizados.
- Journal persistente de descargas por cuenta/visita. Recuperación tras cierre, prioridad de
  pantalla, interrupción de tareas menos prioritarias y reintento desde el coordinador.
- Los archivos parciales completos se reutilizan después de verificarlos; tamaño/checksum
  se comprueban antes de publicar una copia descargada y antes de subir originales locales.
- Reparación de archivos faltantes/corruptos y actualización de metadatos sin borrar las
  fotografías/audio ya descargados.
- La reanudación es por archivo, no por rangos de bytes. No hay limpieza automática por cuota:
  se prioriza conservar originales hasta disponer de una política explícita de caché.

### PDF

- Siempre se regenera localmente. Nunca se sube a Supabase ni se reutiliza automáticamente.
- Se guarda/descarga una copia para abrir y compartir.
- Solo se leen fotografías referenciadas; si faltan, la generación informa error.
- El editor muestra error/reintento tras fallo de carga o espera prolongada.

## Pruebas de esta entrega

- `npm run check`: 119 pruebas unitarias, TypeScript y build correctos.
- `npm run test:integration:local`: cuatro pruebas de integración contra Postgres y Storage locales.
- `npm run test:e2e`: Chromium real, guardado offline, reconexión, lectura en segundo navegador
  y dos PDFs válidos con el backend bloqueado, sin subidas del PDF.
- Cobertura añadida: cola persistente, prioridades, reparación de corrupción, reutilización de
  descargas parciales, aislamiento de cuentas, confirmaciones tardías, cursor/tombstones,
  snapshots antiguos, rollback de metadatos de captura y rechazo de operaciones inválidas.
- Permanecen tres advertencias anteriores de lint y el aviso de tamaño de bundles.

## Android físico: evidencia anterior y límite actual

La entrega anterior se probó en el CPH2783 autorizado: guardado sin backend, cierre forzado,
reapertura desde SQLite, reconexión verificada en Postgres y dos PDFs locales válidos sin red.
La prueba no borró datos ni cambió Wi-Fi/datos móviles. Encontró y permitió corregir el bloqueo
HTTP de loopback en debug y peticiones sin timeout.

El teléfono está desconectado durante esta entrega. Las nuevas transferencias de fotos/audio,
el journal y la réplica incremental no se han vuelto a probar en hardware. No se declara
validación Android completa de esas incorporaciones.

## Ejecutar localmente

```bash
npx supabase start
npx supabase migration up --local
npm run dev:local
npm run test:integration:local
npm run test:e2e
```

Los comandos locales descubren URL/clave pública mediante la CLI y no modifican `.env.local`.
La migración más reciente es 012. Las integraciones rechazan endpoints remotos y usan datos
sintéticos; algunas cuentas y el ledger técnico quedan disponibles para inspección.

APK local:

```bash
JAVA_HOME=/usr/lib/jvm/java-21-temurin ANDROID_HOME=$HOME/Android/Sdk npm run android:build:local
adb reverse tcp:54321 tcp:54321
adb install -r apps/client/android/app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n com.archventures.archforms/.MainActivity
```

Prueba física opt-in: `ANDROID_SERIAL=SERIAL node scripts/test-android-local.mjs`.
No cierra sesiones de usuarios reales, no borra datos y deja una cuenta sintética para inspección.
La excepción HTTP pertenece solo al source set debug y permite exclusivamente loopback.

## Condiciones y límites de despliegue

- No se promete ejecución continua cuando Android está cerrado; sí recuperación al abrir/retomar.
- Antes de desplegar online debe decidirse el retiro de clientes antiguos. Los triggers detectan
  sus escrituras, pero no impiden que un cliente antiguo envíe snapshots completos y sobrescriba
  campos. No confundir compatibilidad de pendientes con compatibilidad indefinida de APK antiguas.
- No se purgan eventos ni deduplicaciones: una futura retención necesita recuperación explícita
  de dispositivos con cursores antiguos. Hay que vigilar crecimiento de BD y almacenamiento local.
- Una edición pendiente sobre una entidad borrada puede necesitar recuperación manual. Se conserva
  el comando y se presenta el error; no se recrea ni descarta automáticamente en el servidor.
- No hay historial de versiones ni resolución colaborativa de documentos completos.
- No se añadieron gestión de formularios, firmas nuevas ni navegación por historial completo.
- No borrar almacenamiento para reparar fallos. Volver a una APK con esquema local anterior requiere
  una recuperación específica; un rollback de código no revierte las migraciones locales.
