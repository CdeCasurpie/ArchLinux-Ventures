# ArchForms

Aplicación offline-first para crear expedientes, registrar visitas de obra y generar informes de inspección. El repositorio conserva el contexto de producto de ArchVentures y la implementación modular del MVP.

## Estado

La **Iteración 1 — cimientos** está terminada: autenticación Supabase, esquema SQL versionado, RLS, Storage privado, persistencia local, outbox, sincronización de perfil, PWA y aplicación Android.

## Desarrollo

Requisitos: Node.js 22+, Docker, Java 21 y Android SDK para compilar Android.

```bash
npm ci
cp apps/client/.env.example apps/client/.env.local
npx supabase start
npm run dev
```

Validación completa:

```bash
npm run check
```

Compilar e instalar Android en un dispositivo conectado:

```bash
npm run build
cd apps/client && npx cap sync android
cd android && ./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

## Estructura

- `apps/client`: React + Vite + Capacitor; PWA web y APK Android.
- `packages/domain`: entidades, validaciones y errores sin dependencias de plataforma.
- `packages/application`: casos de uso, puertos y motor de sincronización.
- `packages/data-local`: adaptadores IndexedDB y SQLite nativo.
- `packages/data-supabase`: Auth y repositorio remoto.
- `packages/contracts`: tipos generados desde PostgreSQL.
- `supabase`: migraciones, RLS, Storage y configuración local reproducible.
- `tests`: pruebas de sincronización y aislamiento RLS.
- `1. Entidades y Contexto`: decisiones de producto, esquema congelado y roadmap.

Las credenciales viven únicamente en archivos `.env.*.local`, ignorados por Git. El cliente utiliza una clave publicable; nunca debe incluir `service_role`.

El mock histórico está en [`prototipo-archforms/index.html`](prototipo-archforms/index.html). La aplicación funcional actual está en `apps/client`.
