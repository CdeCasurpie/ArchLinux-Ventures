# Estilos de ArchForms

Orden de carga: `foundation.css` → `styles.css` (adaptaciones existentes) →
`home-navigation.css` → `system.css` (contratos compartidos).

- `foundation.css` es la base histórica trasladada del prototipo. El cliente ya no
  importa CSS desde `docs/`. El prototipo permanece intacto como referencia.
- `system.css` contiene los roles semánticos, la tipografía, los controles y sus
  variantes responsive. Conservar la paleta de marca y el hero con círculos.
- Manrope variable se sirve desde `public/fonts/`, con su licencia OFL. No depende
  de Google Fonts en ejecución; Workbox incluye el TTF para uso offline.
- Mantener inputs de 16 px y áreas táctiles de 44 px en móvil. Las herramientas
  pueden tener iconos pequeños, pero no reducir su área de interacción.
- Usar `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.btn-danger`;
  `Icon`/`IconButton` y `Modal` de `features/ui.tsx` para nuevas acciones y diálogos.
- Usar `--muted` para texto auxiliar necesario, no grises más claros inventados.
- Reservar estilos inline para valores dinámicos (progreso, geometría de cámara,
  transformaciones). No definir nuevos radios, colores y tipografías por pantalla.
- No cambiar la capa transparente ni la medición de `.mobile-nav` de captura
  nativa sin probar el dispositivo. No animar la superficie nativa a ciegas.
- PDF utiliza medidas de impresión independientes; no aplicar CSS web a su layout.

Validación: `npm run check` y `npm run test:e2e` contra Supabase local.
Revisar especialmente 320/390/820/821/1024/1440 px, foco de diálogos y formularios.
