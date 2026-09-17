# Iteración 2 — Expedientes, checklists y visitas

**Cerrada:** 2026-09-17

## Resultado

ArchForms permite crear y editar expedientes, personalizar el checklist copiado al expediente, crear visitas y responder su checklist dinámico. Los cambios se guardan primero en el dispositivo y luego se sincronizan con Supabase.

## Diseño canónico

`prototipo-archforms` es la fuente visual oficial de la aplicación. La app funcional comparte directamente sus estilos base y conserva:

- logo ArchForms real;
- Google Sans Flex con fallback Manrope;
- paleta azul/lavanda aprobada;
- sidebar de escritorio;
- topbar y breadcrumbs del prototipo;
- navegación inferior móvil con botón central;
- hero, tarjetas, formularios, detalle de expediente y tabs de visita;
- breakpoints y comportamiento responsive.

No se mantendrá un segundo design system paralelo.

## Funcionalidad

- Dashboard alimentado por datos reales.
- Listado y búsqueda de expedientes.
- Formulario completo de cabecera: licencia, vigencias, propietario, ubicación, tipo/uso de obra, responsable, póliza y planificación.
- Catálogo inicial de tres plantillas en Supabase.
- Selección de plantilla y copia JSON independiente.
- Personalización por expediente: renombrar checklist, editar, añadir o quitar campos.
- Edición posterior del expediente sin afectar visitas existentes.
- Creación de visita con número incremental, fecha y snapshot de cabecera/checklist.
- Renderer para campos booleanos, texto, fecha y número.
- Progreso y guardado parcial del checklist.
- Persistencia en IndexedDB y SQLite nativo.
- Outbox de expedientes y visitas guardada atómicamente con cada registro.
- Sincronización idempotente, mezcla de datos remotos y preservación de cambios locales pendientes.

## Base de datos

El esquema congelado de nueve tablas no cambió. La migración `20260917000500_checklist_catalog.sql` añade únicamente datos iniciales al catálogo `Plantilla_Checklist`; no agrega columnas ni entidades.

La regla comprobada sigue siendo:

```text
Plantilla del catálogo
  → copia editable en Expediente
    → copia histórica independiente en Visita
```

## Verificación

- 5 pruebas automatizadas en 3 archivos.
- Copia independiente de checklist cubierta por prueba.
- Escritura local + outbox y sincronización concurrente cubiertas por prueba.
- RLS comprobada para expedientes y visitas entre dos usuarios.
- Catálogo público autenticado comprobado.
- Lint, TypeScript estricto y build PWA aprobados.
- Migración aplicada localmente y al proyecto Supabase remoto.
- APK compilada, instalada y abierta en el HONOR objetivo.
- SQLite de perfil y workspace abiertas sin colisión al recargar la WebView.

## Fuera de alcance

Las tabs Captura y Resumen se muestran para preservar la arquitectura del flujo, pero se señalan como Iteración 3. Cámara, grupos, audio y conclusiones se integrarán allí; no se simulan en esta entrega.
