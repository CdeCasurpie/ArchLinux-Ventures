# ArchForms MVP

Aplicación offline-first para crear expedientes, registrar visitas de obra y generar informes de inspección. El repositorio separa claramente la implementación técnica modular de todo el contexto, diseño e historial de producto de ArchVentures.

---

## 📖 Guía de Lectura para Desarrolladores e Inteligencias Artificiales

Si eres una IA asistiendo en el desarrollo o un desarrollador nuevo clonando el repositorio, **lee primero esta sección**. El repositorio está dividido estrictamente en dos partes:

### 1. El Contexto (Archivos de Lectura y Diseño)
Todo el "por qué", el modelo mental del negocio, las reglas del diseño y el conocimiento del usuario vive en la carpeta **`docs/context/`**. No adivines reglas de negocio, encuéntralas aquí:
- `docs/context/1-entidades-y-contexto/`: Documentos core del negocio. Lee **`Estado del Proyecto y Roadmap MVP ArchForms.md`** para saber en qué iteración nos encontramos hoy, y **`Plan Tecnico - ArchForms Funcional.md`** para entender la arquitectura.
- `docs/context/2-problemas/` y `3-perfiles-usuario/`: Mapeo del dolor del usuario.
- `docs/context/prototipo-archforms/`: Fuente canónica de diseño UI/UX (HTML/CSS estático original). Siempre basar las vistas de React en este diseño.

### 2. El Código Fuente (Aplicación)
La lógica dura (React, Capacitor, Supabase) sigue un diseño modular por paquetes.
- `apps/client`: Frontend React + Vite + Capacitor. Aquí vive la PWA web y el contenedor de la APK Android.
- `packages/domain`: Entidades puras, reglas de negocio e interfaces TypeScript.
- `packages/application`: Casos de uso y motor de sincronización offline-first.
- `packages/data-local` / `data-supabase`: Implementaciones de repositorios (IndexedDB, SQLite, Postgres/Supabase).
- `supabase`: Esquema de la BD, migraciones, políticas de seguridad (RLS) y configuraciones de Supabase local.

---

## 🚀 Requisitos e Instrucciones para Correr el Proyecto

### 1. Requisitos para la primera vez (First-time setup)
Para compilar y trabajar en este monorepo necesitarás:
- **Node.js 22+** y `npm`.
- **Docker** (requerido por Supabase CLI para levantar la base de datos local).
- **Supabase CLI** instalado de forma global o local.
- **Java 21 (Temurin)** (estrictamente requerido por Gradle para compilar la app de Android).
- **Android SDK** (generalmente ubicado en `~/Android/Sdk`).

### 2. Instalación
Al clonar por primera vez, instala las dependencias y prepara las variables de entorno:
```bash
npm ci
cp apps/client/.env.example apps/client/.env.local
```

### 3. Levantar el Backend Local (Supabase)
```bash
npx supabase start
```
Esto levantará los contenedores de Postgres, Auth, Storage y aplicará las migraciones SQL que viven en `supabase/migrations`.

### 4. Levantar la App Web en Modo Desarrollo
```bash
npm run dev -w @archforms/client
```

### 5. Validación de Código (Testing y Linting)
Antes de hacer commit o al terminar una tarea, siempre ejecuta:
```bash
npm run check
```
*(Esto corre `oxlint`, TypeScript `tsc --noEmit`, y las pruebas de `vitest` en todo el monorepo).*

---

## 📱 Compilar y Desplegar la App de Android

Capacitor requiere sincronizar los assets web antes de compilar nativo. Si estás en **Arch Linux** u otra distribución donde la versión de Java por defecto no es la 21, necesitas forzar explícitamente `JAVA_HOME`.

### Comando rápido para construir e instalar (Recomendado):
El siguiente comando construye la app de React, inyecta los assets en Android, compila el APK y la instala en tu dispositivo conectado por USB (`adb`), forzando además su ejecución:

```bash
JAVA_HOME=/usr/lib/jvm/java-21-temurin ANDROID_HOME=$HOME/Android/Sdk PATH=/usr/lib/jvm/java-21-temurin/bin:$HOME/Android/Sdk/platform-tools:$PATH npm run android:build -w @archforms/client && adb install -r apps/client/android/app/build/outputs/apk/debug/app-debug.apk && adb shell am force-stop com.archventures.archforms && adb shell monkey -p com.archventures.archforms -c android.intent.category.LAUNCHER 1
```

### Paso a paso (Manual):
1. Construye el cliente web: `npm run build -w @archforms/client`
2. Sincroniza con Capacitor: `cd apps/client && npx cap sync android`
3. Compila el APK: `cd apps/client/android && JAVA_HOME=/usr/lib/jvm/java-21-temurin ./gradlew assembleDebug`
4. Instala vía ADB: `adb install -r app/build/outputs/apk/debug/app-debug.apk`
