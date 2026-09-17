# Iteración 1 — Cimientos ArchForms

**Cerrada:** 2026-09-17
**Resultado:** primer corte funcional web/Android conectado a Supabase, con persistencia local y sincronización real.

## Alcance entregado

- Monorepo npm con TypeScript estricto y separación entre dominio, aplicación y adaptadores.
- Cliente React responsive, instalable como PWA y empaquetado con Capacitor para Android.
- Inicio de sesión y registro por email/contraseña mediante Supabase Auth.
- Perfil `Profesional` creado automáticamente al registrar una cuenta.
- Persistencia offline en IndexedDB para web y SQLite real para Android.
- Outbox local atómica: una edición y su operación pendiente se guardan en una sola transacción.
- Motor de sincronización con una sola ejecución concurrente, `upsert` idempotente y conservación de ediciones nuevas durante una sincronización antigua.
- Indicadores de conexión, cambios pendientes, sincronización y conflicto recuperable.
- Esquema remoto completo de nueve tablas, fiel al DBML aprobado.
- RLS en toda la jerarquía, grants explícitos y bucket privado `visita-media`.
- Tipos TypeScript generados desde PostgreSQL.
- CI que ejecuta lint, typecheck, pruebas y build.

## Base de datos

Las cuatro migraciones versionadas están aplicadas tanto en Supabase local como en el proyecto remoto:

1. dominio de nueve tablas y enums;
2. seguridad, RLS, Auth, Storage y RPC de sincronización de perfil;
3. integridad cruzada para fotos y adjuntos;
4. normalización de campos opcionales del perfil.

No se añadieron `Informe`, `Bloque_Informe`, `Visita_Checklist`, colas remotas ni historiales especulativos. El outbox pertenece al dispositivo y el modelo de negocio continúa congelado.

## Pruebas ejecutadas

- El estado local y la operación pendiente se persisten atómicamente.
- Dos solicitudes simultáneas al motor no duplican el envío.
- Una edición nueva no es borrada cuando termina una sincronización anterior.
- El trigger de Auth crea el `Profesional` correspondiente.
- Un usuario puede crear su expediente.
- Otro usuario no puede leerlo ni falsificar su propietario.
- Compilación web/PWA de producción.
- Compilación e instalación del APK debug en el HONOR conectado.
- Apertura de la pantalla de autenticación en Android y creación física de la base SQLite privada.

Comando de verificación reproducible:

```bash
npm run check
```

## Límites conscientes

El perfil es la entidad elegida para validar el primer ciclo local → remoto. El CRUD de expedientes, las visitas, la captura y el PDF pertenecen a las siguientes iteraciones. La autenticación inicial necesita red; después de obtener sesión, el diseño local permite continuar trabajando offline.

## Siguiente corte

La Iteración 2 implementará expediente → checklist independiente → visita. La primera historia debe crear un expediente sin conexión, mostrarlo inmediatamente, sincronizarlo al recuperar red y respetar el aislamiento RLS ya probado.
