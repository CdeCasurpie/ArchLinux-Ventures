import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import { SupabaseAnswerSyncRemote, SupabaseWorkspaceRepository } from '@archforms/data-supabase';
import { IndexedWorkspaceRepository } from '@archforms/data-local';
import { WorkspaceSyncEngine, workspaceOperation } from '@archforms/application';
import type { Database } from '@archforms/contracts';

const url = process.env.TEST_SUPABASE_URL;
const key = process.env.TEST_SUPABASE_KEY;
if (!url || !key || new URL(url).protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(new URL(url).hostname)) {
  throw new Error('Use npm run test:integration:local; remote endpoints are forbidden.');
}

describe('answer patch protocol v1 on local Postgres', () => {
  it('deduplicates, merges fields, orders concurrent changes and isolates owners', async () => {
    const client = createClient(url!, key!, { auth: { persistSession: false, autoRefreshToken: false } });
    const outsider = createClient(url!, key!, { auth: { persistSession: false, autoRefreshToken: false } });
    const expedienteId = crypto.randomUUID(), visitaId = crypto.randomUUID();
    try {
      for (const account of [client, outsider]) {
        const { data, error } = await account.auth.signUp({ email: `sync-${crypto.randomUUID()}@archforms.test`, password: 'Local-test-only-2026' });
        expect(error).toBeNull();
        expect(data.session).not.toBeNull();
      }
      const { data: { user } } = await client.auth.getUser();
      const schema = { version: 1, sections: [{ id: 'base', title: 'Base', fields: [
        { id: 'a', label: 'A', type: 'text' }, { id: 'b', label: 'B', type: 'boolean' },
      ] }] };
      expect((await client.from('expediente').insert({ id: expedienteId, profesional_id: user!.id, nro_expediente: expedienteId, ubicacion: 'Test', checklist_nombre: 'Base', checklist_esquema_json: schema })).error).toBeNull();
      expect((await client.from('visita').insert({ id: visitaId, expediente_id: expedienteId, nro_visita: 1, fecha: '2026-09-17', checklist_nombre: 'Base', checklist_esquema_json: schema, checklist_respuestas_json: {}, documento_json: {} })).error).toBeNull();

      const operation = crypto.randomUUID();
      const request = { operation_id: operation, visita_id: visitaId, patch: { a: 'first' } };
      const first = await client.rpc('sync_patch_answers_v1', request);
      expect(first.error).toBeNull();
      const second = await client.rpc('sync_patch_answers_v1', { ...request, operation_id: crypto.randomUUID(), patch: { a: 'latest', b: 'si' } });
      expect(second.error).toBeNull();
      const retry = await client.rpc('sync_patch_answers_v1', request);
      expect(retry.error).toBeNull();
      expect(retry.data).toEqual(first.data);
      const adapter = new SupabaseAnswerSyncRemote(client as SupabaseClient<Database>);
      expect(await adapter.push({operationId:operation,visitaId,patch:{a:'first'}})).toMatchObject({visitaId,answers:{a:'first'}});
      expect(await adapter.pull(0,2)).toHaveLength(2);
      expect((await client.from('visita').select('checklist_respuestas_json,checklist_completado').eq('id', visitaId).single()).data).toMatchObject({ checklist_respuestas_json: { a: 'latest', b: 'si' }, checklist_completado: true });
      expect((await client.rpc('sync_patch_answers_v1', { ...request, patch: { a: 'reuse' } })).error).not.toBeNull();
      expect((await client.rpc('sync_patch_answers_v1', { ...request, operation_id: crypto.randomUUID(), patch: { missing: 'x' } })).error).not.toBeNull();
      expect((await outsider.rpc('sync_patch_answers_v1', { ...request, operation_id: crypto.randomUUID() })).error).not.toBeNull();
      expect((await outsider.rpc('sync_pull_answers_v1')).data).toEqual([]);

      const concurrent = await Promise.all(['x', 'y', 'z'].map(a => client.rpc('sync_patch_answers_v1', { ...request, operation_id: crypto.randomUUID(), patch: { a } })));
      for (const result of concurrent) expect(result.error).toBeNull();
      const ordered = concurrent.map(result => result.data).sort((a, b) => a.revision - b.revision);
      expect((await client.from('visita').select('checklist_respuestas_json').eq('id', visitaId).single()).data?.checklist_respuestas_json).toEqual({ a: ordered.at(-1).answers.a, b: 'si' });

      let cursor = 0;
      const changes: { revision: number }[] = [];
      for (;;) {
        const page = await client.rpc('sync_pull_answers_v1', { after_revision: cursor, page_size: 2 });
        expect(page.error).toBeNull();
        if (!page.data.length) break;
        changes.push(...page.data);
        cursor = page.data.at(-1).revision;
      }
      expect(changes).toHaveLength(5);
      expect(new Set(changes.map(change => change.revision)).size).toBe(5);
      expect((await client.rpc('sync_pull_answers_v1', { after_revision: -1 })).error).not.toBeNull();

      // Two independent offline stores from the same initial remote snapshot.
      const remote = new SupabaseWorkspaceRepository(client as SupabaseClient<Database>);
      const a = new IndexedWorkspaceRepository(`device-a-${crypto.randomUUID()}`);
      const b = new IndexedWorkspaceRepository(`device-b-${crypto.randomUUID()}`);
      const snapshot = await remote.fetchAll();
      await a.mergeRemote(user!.id,snapshot);
      await b.mergeRemote(user!.id,snapshot);
      await a.saveAnswers(user!.id,visitaId,{a:'offline A'});
      await b.saveAnswers(user!.id,visitaId,{b:'no'});
      await new WorkspaceSyncEngine(a,remote,user!.id).run();
      await new WorkspaceSyncEngine(b,remote,user!.id).run();
      const staleVisit=snapshot.visitas.find(visit=>visit.id===visitaId)!;
      await b.save(user!.id,workspaceOperation('visita',{...staleVisit,estado:'FINALIZADA'}));
      await new WorkspaceSyncEngine(b,remote,user!.id).run();
      expect((await client.from('visita').select('checklist_respuestas_json').eq('id',visitaId).single()).data?.checklist_respuestas_json).toEqual({a:'offline A',b:'no'});
      expect((await b.read(user!.id)).pending).toEqual([]);
      const profileRequest={operation_id:crypto.randomUUID(),nombre:'Primer nombre',cargo:null,colegiatura:null};
      const profileFirst=await client.rpc('sync_profile_v1',profileRequest);
      expect(profileFirst.error).toBeNull();
      expect((await client.rpc('sync_profile_v1',{...profileRequest,operation_id:crypto.randomUUID(),nombre:'Último nombre'})).error).toBeNull();
      expect((await client.rpc('sync_profile_v1',profileRequest)).data).toEqual(profileFirst.data);
      expect((await client.from('profesional').select('nombre_completo').single()).data?.nombre_completo).toBe('Último nombre');
    } finally {
      await client.from('visita').delete().eq('id', visitaId);
      await client.from('expediente').delete().eq('id', expedienteId);
      await Promise.all([client.auth.signOut(), outsider.auth.signOut()]);
    }
  }, 30000);
});
