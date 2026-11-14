# Infraestructura offline — estado y validación

Actualizado: 2026-11-13. Rama: `feat/offline-sync-foundation`.

## Despliegue remoto — 2026-11-13

- Proyecto: `pcmkrfnjdfrnjkqnpqgf`.
- El remoto tenía aplicadas las migraciones `001` a `005`; se aplicaron `006` a `013`
  mediante `supabase db push --linked`.
- `013_checklist_template_links` añade de forma incremental las columnas anulables
  `checklist_template_id` y sus FKs en expediente/visita. También se aplicó localmente;
  es compatible con las instalaciones nuevas que ya incluyen esos campos en `001`.
- Verificación: historial local/remoto coincidente hasta `20260917001300`; dump del
  esquema remoto confirma funciones de sync, validaciones de respuestas, trigger de
  réplica de plantillas, columnas/FKs y políticas RLS por propietario.
- El dry-run posterior devuelve «Remote database is up to date».
- No se reseteó la base remota ni se desplegó el cliente como parte de este push.
  Las pruebas de integración y E2E documentadas siguen siendo contra Supabase local.

Las menciones de despliegue exclusivamente local en las secciones históricas siguientes
corresponden al estado anterior a esta actualización.

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

### Plantillas propias por la réplica (2026-11-12)

- El workspace sync (`sync_workspace_v1`) acepta la entidad `plantilla` (tabla
  `plantilla_checklist`) con campos permitidos `codigo, nombre, version, esquema_json, activa`;
  solo filas propias (`profesional_id = actor`). Las plantillas de plataforma quedan read-only.
- Validación server-side ligera del catálogo: esquema con `sections` no vacío, `version >= 1`
  y `codigo` no vacío. El borrado es lógico (patch `activa: false`); no hay DELETE físico.
- Trigger `replica_plantilla` sobre `plantilla_checklist` (migración 010): las plantillas
  propias entran al feed de réplica con entity normalizado `plantilla`; las de plataforma
  (`profesional_id` nulo) se omiten y se leen directas de la tabla.
- Fuera de la BD, el payload viaja en forma de dominio (`esquema`) y se mapea a
  `esquema_json` solo en el borde de red (`data-supabase`).
- Las consultas de lectura ya no filtran `activa = true`: las propias desactivadas también
  se replican y el UI las oculta (grupo «Desactivados», con reactivación).
- Trazabilidad de plantilla: columnas `checklist_template_id` (FK anulable) en
  `expediente` y `visita` (migración 001), añadidas al allowlist del sync.

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

- `npm run check`: TypeScript, lint y build correctos; 138 pruebas unitarias (incluyen
  catálogo de tipos v2, `withAvanceObra`, estadísticas 9.4 y ciclo offline de plantillas).
- `npm run test:integration:local`: seis pruebas de integración contra Postgres y Storage
  locales, incluidas dos nuevas: protocolo de plantillas (create/patch/réplica/lectura de
  plataforma) y validación de tipos dinámicos de respuestas con espejo `avance_obra →
  avance_general` (incluye rechazo de select fuera de opciones, número fuera de rango,
  percent >100, y un `0` porcentual válido).
- Migraciones `00100`, `00700`, `00900` y `01000` modificadas y reaplicadas con
  `supabase db reset` en local sin errores. El remoto de Supabase sigue sin desplegarse.
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
- No hay historial de versiones de plantillas (cada guardado avanza `version` sobre la misma
  fila) ni resolución colaborativa de documentos completos. El catálogo de plantillas propias
  ya viaja por la réplica; la edición de respuestas desde el editor del informe sigue pendiente.
- No borrar almacenamiento para reparar fallos. Volver a una APK con esquema local anterior requiere
  una recuperación específica; un rollback de código no revierte las migraciones locales.
