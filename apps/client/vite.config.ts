import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import {VitePWA} from 'vite-plugin-pwa';
export default defineConfig({
 plugins:[react(),VitePWA({
  registerType:'autoUpdate',
   manifest:{name:'ArchForms',short_name:'ArchForms',theme_color:'#01437a',background_color:'#f5f7fb',display:'standalone',icons:[{src:'/archforms-icon.png',sizes:'512x512',type:'image/png',purpose:'any maskable'}]},
  workbox:{navigateFallback:'/index.html',globPatterns:['**/*.{js,css,html,png,svg,ttf}'],maximumFileSizeToCacheInBytes:4*1024*1024}
 })],
 server:{port:5173,strictPort:true}
});
