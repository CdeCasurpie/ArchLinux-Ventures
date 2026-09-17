import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import {VitePWA} from 'vite-plugin-pwa';
export default defineConfig({
 plugins:[react(),VitePWA({
  registerType:'autoUpdate',
  manifest:{name:'ArchForms',short_name:'ArchForms',theme_color:'#01437a',background_color:'#f5f7fb',display:'standalone',icons:[{src:'/archforms-mark.png',sizes:'512x512',type:'image/png'}]},
  workbox:{navigateFallback:'/index.html',globPatterns:['**/*.{js,css,html,png,svg}']}
 })],
 server:{port:5173,strictPort:true}
});
