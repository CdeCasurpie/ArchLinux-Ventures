import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir:'tests/e2e',
  timeout:60000,
  workers:1,
  use:{baseURL:'http://127.0.0.1:5178',trace:'retain-on-failure'},
  outputDir:'/tmp/opencode/archforms-playwright-results',
  webServer:{command:'node scripts/client-local.mjs e2e-server',url:'http://127.0.0.1:5178',reuseExistingServer:false,timeout:30000},
});
