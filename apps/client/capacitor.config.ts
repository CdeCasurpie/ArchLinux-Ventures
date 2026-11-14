import type { CapacitorConfig } from '@capacitor/cli';
const config: CapacitorConfig={
  appId:'com.archventures.archforms',
  appName:'ArchForms',
  webDir:'dist',
  backgroundColor: '#00000000',
  // Sin viewport-fit=cover, SystemBars reserva el área nativa de ambas barras,
  // también en WebViews recientes, sin duplicar offsets en controles fijos/cámara.
  plugins: { SystemBars: { insetsHandling: 'native', hidden: false } }
};
export default config;
