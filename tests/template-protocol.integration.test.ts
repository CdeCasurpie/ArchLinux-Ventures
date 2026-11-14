import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import { SupabaseWorkspaceRepository } from '@archforms/data-supabase';
import { IndexedWorkspaceRepository } from '@archforms/data-local';
import { workspaceOperation, WorkspaceSyncEngine } from '@archforms/application';
import type { ChecklistTemplate } from '@archforms/domain';
import type { Database } from '@archforms/contracts';

const url = process.env.TEST_SUPABASE_URL;
const key = process.env.TEST_SUPABASE_KEY;
if (!url || !key || new URL(url).protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(new URL(url).hostname)) {
  throw new Error('Use npm run test:integration:local; remote endpoints are forbidden.');
}

function template(profesional_id: string, overrides: Partial<ChecklistTemplate> = {}): ChecklistTemplate {
  return {
    id: crypto.randomUUID(), codigo: `USR-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    nombre: 'Mi checklist de integración', version: 1, profesional_id, activa: true,
    esquema: { version: 2, sections: [{ id: 's1', title: 'General', fields: [
      { id: 'estado', label: 'Estado', type: 'select', options: ['Bueno', 'Malo'] },
    ] }] },
    ...overrides,
  };
}

describe('plantilla protocol and dynamic answer fields on local Postgres', () => {
  it('creates, duplicates and replicates own templates; platform rows stay read-only', async () => {
    const client = createClient<Database>(url!, key!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await client.auth.signUp({ email: `tpl-${crypto.randomUUID()}@archforms.test`, password: 'Local-template-test-2026' });
    expect(error).toBeNull();
    const owner = data.user!.id;
    const local = new IndexedWorkspaceRepository(`tpl-${crypto.randomUUID()}`);
    const remote = new SupabaseWorkspaceRepository(client as SupabaseClient<Database>);
    const record = template(owner), copy = template(owner, { nombre: 'Mi checklist copia' });
    try {
      // Offline: queda en la outbox y sube al reconectar (B1).
      await local.save(owner, workspaceOperation('plantilla', record));
      await new WorkspaceSyncEngine(local, remote, owner).run();
      const row = (await client.from('plantilla_checklist').select('*').eq('id', record.id).single()).data;
      expect(row).toMatchObject({ codigo: record.codigo, profesional_id: owner, activa: true });
      expect(row?.esquema_json).toMatchObject({ version: 2, sections: [{ id: 's1' }] });
      expect((await local.read(owner)).pending).toEqual([]);

      // Duplicar: nueva fila con id y código propios; la original no cambia.
      await local.save(owner, workspaceOperation('plantilla', copy));
      await new WorkspaceSyncEngine(local, remote, owner).run();
      expect((await client.from('plantilla_checklist').select('id,codigo,nombre,version').eq('id', record.id).single()).data)
        .toMatchObject({ id: record.id, codigo: record.codigo, nombre: record.nombre, version: 1 });
      expect((await client.from('plantilla_checklist').select('id,codigo,nombre,version').eq('id', copy.id).single()).data)
        .toMatchObject({ id: copy.id, codigo: copy.codigo, nombre: 'Mi checklist copia', version: 1 });

      // La única mutación permitida sobre una plantilla existente es su ciclo de vida.
      await local.save(owner, workspaceOperation('plantilla', { ...copy, activa: false }));
      await new WorkspaceSyncEngine(local, remote, owner).run();
      expect((await client.from('plantilla_checklist').select('activa').eq('id', copy.id).single()).data).toEqual({ activa: false });

      // Réplica incremental: las plantillas propias llegan por sync_replica_pull_v1.
      const head = await remote.fetchReplica();
      expect(head.plantillas.find(item => item.id === record.id)?.nombre).toBe(record.nombre);
      expect(head.plantillas.find(item => item.id === copy.id)?.activa).toBe(false);
      const direct = await client.rpc('sync_replica_pull_v1', { after_revision: 0, page_size: 200 });
      expect((direct.data as unknown as { entity: string }[] | null)?.filter(event => event.entity === 'plantilla').length).toBeGreaterThan(0);
      await local.mergeRemote(owner, await remote.fetchAll());

      // Validación server-side del catálogo.
      const broken = template(owner, { esquema: { version: 2, sections: [] } });
      await local.save(owner, workspaceOperation('plantilla', broken));
      await expect(new WorkspaceSyncEngine(local, remote, owner).run()).rejects.toThrow();
      await local.acknowledge(owner, (await local.read(owner)).pending[0].id);

      // Campos no permitidos y plantillas de plataforma: rechazados.
      const forbidden = await client.rpc('sync_workspace_v1', {
        operation_id: crypto.randomUUID(), entity: 'plantilla', entity_id: record.id,
        mutation: 'patch', payload: { profesional_id: crypto.randomUUID() },
      });
      expect(forbidden.error).not.toBeNull();
      const seeded = (await client.from('plantilla_checklist').select('id').eq('codigo', 'G050').single()).data;
      const platform = await client.rpc('sync_workspace_v1', {
        operation_id: crypto.randomUUID(), entity: 'plantilla', entity_id: seeded!.id,
        mutation: 'patch', payload: { nombre: 'Hack' },
      });
      expect(platform.error).not.toBeNull();
    } finally {
      await client.from('plantilla_checklist').delete().in('id', [record.id, copy.id]);
      await client.auth.signOut();
    }
  }, 30000);

  it('validates dynamic answer types and mirrors avance_obra into avance_general', async () => {
    const client = createClient<Database>(url!, key!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await client.auth.signUp({ email: `ans-${crypto.randomUUID()}@archforms.test`, password: 'Local-answers-test-2026' });
    expect(error).toBeNull();
    const owner = data.user!.id;
    const expedienteId = crypto.randomUUID(), visitaId = crypto.randomUUID();
    const schema = { version: 2, sections: [{ id: 's', title: 'General', fields: [
      { id: 'estado', label: 'Estado', type: 'select', options: ['Bueno', 'Regular', 'Malo'] },
      { id: 'altura', label: 'Altura', type: 'number', min: 0, max: 50, unit: 'm' },
      { id: 'avance_obra', label: 'Avance de obra', type: 'percent', required: true },
      { id: 'nota', label: 'Nota', type: 'textarea' },
    ] }] };
    try {
      expect((await client.from('expediente').insert({ id: expedienteId, profesional_id: owner, nro_expediente: expedienteId, ubicacion: 'Test', checklist_nombre: 'Base', checklist_esquema_json: schema })).error).toBeNull();
      expect((await client.from('visita').insert({ id: visitaId, expediente_id: expedienteId, nro_visita: 1, fecha: '2026-11-12', checklist_nombre: 'Base', checklist_esquema_json: schema, checklist_respuestas_json: {}, documento_json: {} })).error).toBeNull();

      const patch = { operation_id: crypto.randomUUID(), visita_id: visitaId, patch: {} };
      // Tipos válidos: select dentro de opciones, número en rango, percent 0–100, párrafo.
      expect((await client.rpc('sync_patch_answers_v1', { ...patch, operation_id: crypto.randomUUID(), patch: { estado: 'Regular', altura: 12.5, avance_obra: 40, nota: 'Muro con panda' } })).error).toBeNull();
      let row = (await client.from('visita').select('checklist_respuestas_json,checklist_completado,avance_general').eq('id', visitaId).single()).data;
      expect(row).toMatchObject({ checklist_respuestas_json: { estado: 'Regular', altura: 12.5, avance_obra: 40, nota: 'Muro con panda' }, checklist_completado: true, avance_general: 40 });

      // El espejo sigue a las nuevas respuestas y a las anulaciones.
      expect((await client.rpc('sync_patch_answers_v1', { ...patch, operation_id: crypto.randomUUID(), patch: { avance_obra: 65 } })).error).toBeNull();
      expect((await client.from('visita').select('avance_general').eq('id', visitaId).single()).data?.avance_general).toBe(65);
      expect((await client.rpc('sync_patch_answers_v1', { ...patch, operation_id: crypto.randomUUID(), patch: { avance_obra: null } })).error).toBeNull();
      expect((await client.from('visita').select('avance_general,checklist_completado').eq('id', visitaId).single()).data)
        .toMatchObject({ avance_general: null, checklist_completado: false });

      // Rechazos: fuera del catálogo, fuera de rango, porcentaje fuera de 0–100.
      expect((await client.rpc('sync_patch_answers_v1', { ...patch, operation_id: crypto.randomUUID(), patch: { estado: 'Excelente' } })).error).not.toBeNull();
      expect((await client.rpc('sync_patch_answers_v1', { ...patch, operation_id: crypto.randomUUID(), patch: { altura: 99 } })).error).not.toBeNull();
      expect((await client.rpc('sync_patch_answers_v1', { ...patch, operation_id: crypto.randomUUID(), patch: { avance_obra: 150 } })).error).not.toBeNull();
      // Un 0 porcentual es una respuesta válida, no un campo vacío.
      expect((await client.rpc('sync_patch_answers_v1', { ...patch, operation_id: crypto.randomUUID(), patch: { avance_obra: 0 } })).error).toBeNull();
      expect((await client.from('visita').select('checklist_completado,avance_general').eq('id', visitaId).single()).data)
        .toMatchObject({ checklist_completado: true, avance_general: 0 });
    } finally {
      await client.from('visita').delete().eq('id', visitaId);
      await client.from('expediente').delete().eq('id', expedienteId);
      await client.auth.signOut();
    }
  }, 30000);
});
