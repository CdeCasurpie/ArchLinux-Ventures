-- Iteración 4: sincronización de captura sobre el modelo aprobado (9 tablas).
--
-- NO crea tablas nuevas: `archivo`, `grupo_captura` y `foto` ya existen
-- (20260917000100_domain.sql) con RLS por propietario (20260917000200_security.sql),
-- y el bucket privado `visita-media` con RLS por primera carpeta = auth.uid().
--
-- Flujo del cliente (apps/client/src/features/media-sync.ts):
--   1. Sube cada binario a `visita-media/{profesional_id}/{visita_id}/{media_id}`.
--   2. Upsert de `archivo` (tipo IMAGEN/AUDIO, storage_key, checksum, SINCRONIZADO).
--   3. Upsert de `grupo_captura` (orden por visita, CONFIRMADO, audio_archivo_id).
--   4. Upsert de `foto` (grupo_captura_id, archivo_id, orden_captura por visita).
-- Todo idempotente por ids locales estables: reintentar no duplica.

-- La FK foto.grupo_captura_id no tenía índice propio; se agrega idempotentemente
-- para el join del resumen de hallazgos.
CREATE INDEX IF NOT EXISTS idx_foto_grupo_captura ON public.foto(grupo_captura_id);
