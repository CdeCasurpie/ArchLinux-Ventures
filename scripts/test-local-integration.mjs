import { execFileSync, spawnSync } from 'node:child_process';

// Never read the client's environment: it may point to production.
const status = JSON.parse(execFileSync('npx', ['supabase', 'status', '-o', 'json'], {
  encoding: 'utf8',
}));
const url = new URL(status.API_URL);
if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname)) {
  throw new Error('Integration tests require a loopback Supabase endpoint.');
}
const key = status.PUBLISHABLE_KEY || status.ANON_KEY;
if (!key) throw new Error('Local Supabase publishable key is missing.');
const result = spawnSync('npx', ['vitest', 'run', '--config', 'vitest.integration.config.ts'], {
  stdio: 'inherit',
  env: { ...process.env, TEST_SUPABASE_URL: url.origin, TEST_SUPABASE_KEY: key },
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
