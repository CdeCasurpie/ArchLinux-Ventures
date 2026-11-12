# ArchForms · Sistema visual

Fuente de verdad: tokens de `apps/client/src/styles.css` (app) y `apps/client/src/landing/landing.css` (landing).

## Dirección
Moderno y minimalista: superficies blancas sobre gris muy claro, listas agrupadas con esquinas amplias, controles en píldora y una sola tinta de acción. Pocos pasos: "Nueva visita" está siempre a mano (botón central del menú en el teléfono, botón principal de la barra lateral en escritorio) y abre un selector de obra; el expediente nuevo pide 3 datos y el resto queda plegado como opcional.

## Color (contenido; hex de respaldo + OKLCH)
| Token | Uso | Hex |
|---|---|---|
| `--bg` | fondo de la app | `#f5f7f9` |
| `--surface` | listas, paneles, campos | `#fefeff` |
| `--fill` / `--fill-2` | pistas de controles segmentados, botones secundarios | `#ebedef` / `#e1e3e6` |
| `--ink` / `--ink-2` / `--ink-3` | texto principal (16:1) / secundario (6.6:1) / terciario (≥4.6:1) | `#16181e` / `#545860` / `#6b6e76` |
| `--accent` | acciones, selección, avance (5.4:1 con blanco) | `#1e66d1` |
| `--ok` / `--warn` / `--danger` | guardado / pendiente o sin conexión / error y respuesta "No" | `#187c49` / `#9a5a00` / `#c92f33` |
| `--night` | botones del landing y panel de cierre | `#0f1217` |

Sin conexión es ámbar, no rojo: nada se perdió.

## Tipografía
**Geist** (variable, autoalojada con `@fontsource-variable/geist`, en el precache de la PWA). Cuerpo 17 px, títulos 34 px con espaciado −0.028em, pesos 500–650. En el landing los titulares llegan a 76 px con −0.048em.

## Navegación
- Historial real: el botón atrás del navegador, el gesto y el botón de Android vuelven a la pantalla anterior.
- Las pestañas raíz (Inicio, Expedientes, Plantillas, Perfil) reinician el historial; las pantallas internas se apilan.
- Transiciones con View Transitions (deslizamiento corto de 280 ms; hacia atrás, en sentido inverso). Se desactivan con `prefers-reduced-motion` y con la cámara activa.

## Componentes
- `.list` + `.row`: listas agrupadas (icono o número, título, subtítulo, meta, flecha).
- `.segmented`: Sí / No / N.A. en píldora; "No" en rojo, "N.A." en gris, con `aria-pressed`.
- `.sheet`: hoja inferior en el teléfono, diálogo centrado en escritorio.
- `.disclosure-row`: secciones opcionales plegables.
- Iconos de trazo en `apps/client/src/ui/Icon.tsx`.
