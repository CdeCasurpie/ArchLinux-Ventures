import { execFileSync, spawnSync } from 'node:child_process';

const mode = process.argv[2] ?? 'dev';
if (!['dev', 'android:build','e2e-server'].includes(mode)) throw new Error('Unsupported local client mode');
const status = JSON.parse(execFileSync('npx', ['supabase', 'status', '-o', 'json'], { encoding: 'utf8' }));
const endpoint = new URL(status.API_URL);
if (endpoint.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(endpoint.hostname)) {
  throw new Error('Only local Supabase is supported by this command');
}
const key = status.PUBLISHABLE_KEY || status.ANON_KEY;
if (!key) throw new Error('Local publishable key missing');
const args=mode==='e2e-server'?['run','dev','-w','@archforms/client','--','--port','5178']:['run',mode,'-w','@archforms/client'];
const result = spawnSync('npm', args, {
  stdio: 'inherit',
  env: { ...process.env, VITE_SUPABASE_URL: endpoint.origin, VITE_SUPABASE_PUBLISHABLE_KEY: key },
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
