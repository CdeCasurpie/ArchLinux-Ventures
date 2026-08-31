# Flujo Adaptativo de Entrevista

Router para elegir guía según el rol detectado en los primeros minutos de conversación.

## Paso 1 — Identificar rol principal
Pregunta abierta: *"¿A qué te dedicas y cómo es una semana típica?"*

| Si menciona... | Guía | Journey |
|:---|:---|:---|
| Inspección ITSE, locales comerciales, INDECI, Anexo 18 | [[Guia de Entrevista - ITSE e IMU]] | [[Journey - Inspector ITSE]] |
| Inspección de obra, supervisor, residente, fiscalización | [[Guia de Entrevista - ITSE e IMU]] | [[Journey - Inspector IMO y Supervisor]] |
| Delegado CAP, comisión revisor, licencias municipales | [[Guia de Entrevista - Delegados CAP y Peritos]] | [[Journey - Delegado CAP]] |
| Perito, tasación judicial, valuación | [[Guia de Entrevista - Delegados CAP y Peritos]] | [[Journey - Perito Tecnico]] |
| Diseño, expediente, proyectos, AutoCAD, cliente | [[Guia de Entrevista - Proyectistas]] | [[Journey - Arquitecto Proyectista]] |
| Taller universitario, entrega final, SketchUp | [[Guia de Entrevista - Estudiantes]] | [[Journey - Estudiante de Arquitectura]] |

## Paso 2 — Si tiene múltiples roles
Muchos profesionales mezclan roles (ej. Vicky = IMO + Delegado + Perito). En ese caso:
1. Preguntar: *"¿Cuál de tus roles te quita más tiempo esta semana?"*
2. Aplicar guía del rol dominante.
3. Al final, bloque rápido: *"Y en tu otro rol de [X], ¿es similar o diferente?"*

## Paso 3 — Bloques obligatorios (todos los roles)
Independiente de la guía, siempre cubrir:
1. **Flujo paso a paso** del último trabajo entregado (con tiempos).
2. **Gestión multi-proyecto:** ¿cuántos activos? ¿cómo retomas?
3. **Herramientas actuales** y si paga por alguna.
4. **Mom Test monetización:** ¿cuánto pagaría por [micro-dolor] vs. suite?

## Paso 4 — Registrar
- Crear/actualizar nota en `Entrevista - [Nombre].md`
- Actualizar estadísticas en perfil correspondiente en `3. Perfiles de Usuario/`
- Si hay audio/video, guardar en repo y linkear desde [[Inventario de Validacion]]

## Referencia
- Plantilla base: [[Plantilla Base de Entrevista (The Mom Test)]]
- Inventario completo: [[Inventario de Validacion]]
