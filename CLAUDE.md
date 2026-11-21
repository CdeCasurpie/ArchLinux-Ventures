# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository scope

This git repo (`ArchVentures`) is the ArchForms MVP monorepo plus product context. Product and business documents live in `docs/context/` (business rules, roadmap in `1-entidades-y-contexto/Estado del Proyecto y Roadmap MVP ArchForms.md`, UI canon in `prototipo-archforms/`). Read the roadmap and the functional plan before changing business behavior. Most UI/UX text and domain vocabulary is Spanish; keep new user-facing strings in Spanish.

## Commands

Node 22+, npm workspaces. Install with `npm ci` (its `postinstall` applies `patches/capacitor-whisper+0.2.1.patch` via `patch-package --error-on-fail`; do not bypass it). Copy `apps/client/.env.example` to `apps/client/.env.local` for remote/local config.

- `npm run check` — the full gate: `oxlint` on `apps/client/src packages tests`, `tsc --noEmit`, `vitest run` (unit tests), and the client build. Run before finishing a task.
- `npm test` — unit tests only (`vitest.config.ts` includes `tests/**/*.test.ts` and excludes `*.integration.test.ts`).
- Single unit test: `npx vitest run tests/sync.test.ts` (or `-t "name"` to filter by test name).
- `npm run test:integration:local` — integration tests (`*.integration.test.ts`) against local Supabase only. Requires `npx supabase start` first. The script discovers the local URL/key via the Supabase CLI and refuses remote endpoints. The script ignores extra arguments and always runs the whole integration suite. For one file, with local Supabase running, pass the env it sets: `TEST_SUPABASE_URL=<API_URL> TEST_SUPABASE_KEY=<PUBLISHABLE_KEY or ANON_KEY> npx vitest run -c vitest.integration.config.ts tests/rls.integration.test.ts` (values from `npx supabase status -o json`).
- `npm run test:e2e` — Playwright (`tests/e2e/*.spec.ts`), starts a dev server on `127.0.0.1:5178` through `scripts/client-local.mjs e2e-server`. Needs local Supabase running and `npx playwright install chromium`. Single spec: `npx playwright test tests/e2e/offline-sync.spec.ts`.
- `npm run dev:local` — Vite dev server wired to local Supabase (`scripts/client-local.mjs`). `npm run dev` uses the env in `apps/client/.env.local` instead.
- `npm run typecheck`, `npm run lint` — individual pieces of `check`.
- Supabase: `npx supabase start|stop|status`. Migrations are in `supabase/migrations/` (timestamped SQL, applied in order).
- Android: `npm run android:build:local` (or `android:build`) runs the Vite build, `cap sync android`, and `gradlew assembleDebug`. `deploy:android` also installs the APK over `adb` and relaunches `com.karen.archforms`. Requires Java 21 (`JAVA_HOME` must point at a JDK 21 on Arch) and the Android SDK. Native whisper weight-resolution test: `cd apps/client/android && ./gradlew :capacitor-whisper:testDebugUnitTest --tests com.olaysco.capacitorwhisper.WhisperModelFileTest`.
- CI (`.github/workflows/ci.yml`) runs: `npm ci` → `npm run check` → `supabase start` → `test:integration:local` → Playwright chromium → `test:e2e` → `supabase stop`. A change is not green until all of these pass locally where relevant.

## Architecture

Offline-first field app: visits (`Visita`), expedientes, checklists, photos/audio, signatures and PDF reports. Work is captured locally first and synced to Supabase later, so most data flows have a local copy plus an outbox.

Layers (TypeScript path aliases in root `tsconfig.json`; the dependency direction is domain ← application ← data adapters ← client):

- `packages/domain` — pure entities and validation (`Profile`, `Visita`, `LocalState`, `validateProfile`, checklist field types). No I/O.
- `packages/contracts` — generated Supabase types (`database.types.ts`) re-exported; the wire shape of the backend.
- `packages/application` — use-cases and sync engine, UI-independent:
  - `SyncCoordinator` (`sync-coordinator.ts`) owns one instance per signed-in account. It runs an ordered list of `SyncTask`s, supports `request()` for immediate passes after local edits, polling with backoff on failure, and background tasks. Changes to sync timing must keep these semantics.
  - `answer-sync.ts`, `scoped-media.ts`, `transfer-queue.ts` — per-entity sync and media upload/download queues.
  - Repository interfaces (`LocalRepository`, `WorkspaceLocalRepository`, `MediaOutboxRepository`) are defined here and implemented by the adapters below.
- `packages/data-local` — offline storage. Web uses IndexedDB (`idb`); native Android uses `@capacitor-community/sqlite`. `workspace-mutations.ts` builds the pending-mutation records (`prepareMutation`, `answerOperation`) that go into the outbox. Native DB opens are deduplicated per name (see the comment in the file before touching connection code).
- `packages/data-supabase` — remote repositories: `answer-sync.ts`, `capture-reader.ts`, `read-pages.ts`. Reads go through paged queries (`read-pages.ts`).
- `packages/report-pdf` — report generation with `@react-pdf/renderer` and `pdf-lib` (`informe.tsx`, `layout.ts`, `paginate.ts`, `mosaic.ts`). Print measurements are independent of web CSS.
- `apps/client` — React 19 + Vite + `react-router-dom` PWA, wrapped by Capacitor for Android (`android/`, `capacitor.config.ts`). Feature code lives in `src/features/` (screens like `Capture.tsx`, `Report.tsx`, `ExpedienteDetail.tsx`, `Onboarding.tsx`, and services like `download-service.ts`, `media-sync.ts`, `transcription-service.ts`, `whisper-service.ts`). Platform branches are in `platform.ts`, and native-only capabilities are wired in `native-audio.ts`, `platform-safety-template.ts`.
- `supabase/` — schema, RLS policies and migrations. Security and integrity live in the database (RLS in `20260917000200_security.sql`, cascade and integrity migrations), so client checks are never the only guard.

Sync and data invariants to preserve when editing:
- Local writes go to the local store and an outbox first; the UI must not wait on the network. Outbox state is reconciled by the sync tasks, not by the screens.
- Profile edits follow a pending/base/conflict model (`Pending` with `base`; `ConflictError` when the server version changed on another device).
- Media is scoped (`scoped-media.ts`) and transferred through a queue; deletions cascade in the DB, so client deletion must match the server's cascade migrations.
- Checklist templates are versioned and linked to instances (`checklist_template_links` migration); instances keep their template reference.

## Styling and UI

- Canonical design is the static prototype in `docs/context/prototipo-archforms/` and `docs/prototipos/`. The client's CSS was copied from it, and the prototype itself must stay unchanged.
- CSS load order: `foundation.css` → `styles.css` → `home-navigation.css` → `system.css` (see `apps/client/src/styles/README.md`). Add new tokens and controls to `system.css`, not per-screen.
- Reuse `.btn*` classes and `Icon`/`IconButton`/`Modal` from `features/ui.tsx`. Inputs are 16px and touch targets are 44px on mobile.
- Validate layouts at 320/390/820/821/1024/1440 px. Avoid touching the native capture layer or `.mobile-nav` measurements without device testing.

## Working notes

- Native behavior (SQLite, camera preview, whisper transcription, file paths) can only be verified on an Android device; unit and e2e tests run in the web build with fake IndexedDB (`fake-indexeddb`).
- `patch-package` patches are fragile: after changing `patches/*.patch` or upgrading `capacitor-whisper`, rebuild and reinstall the APK.
- `patch-package-error.json.gz` at the root is a generated log; do not edit it.
- Playwright writes results to `/tmp/opencode/...` per `playwright.config.ts`; that path is configured, not a convention to copy.
