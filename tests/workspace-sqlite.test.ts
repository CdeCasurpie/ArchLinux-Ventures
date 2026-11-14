import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it, vi } from 'vitest';

const databases = vi.hoisted(() => new Map<string, unknown>());
vi.mock('@capacitor-community/sqlite', () => ({
  CapacitorSQLite: {},
  SQLiteConnection: class {
    async isConnection() { return { result: false }; }
    async createConnection(name: string) {
      const db = databases.get(name) as DatabaseSync ?? new DatabaseSync(':memory:');
      databases.set(name, db);
      return {
        isDBOpen: async () => ({ result: true }),
        execute: async (sql: string) => { db.exec(sql); },
        query: async (sql: string, values: never[] = []) => ({ values: db.prepare(sql).all(...values) }),
        run: async (sql: string, values: never[] = []) => { db.prepare(sql).run(...values); },
        executeSet: async (statements: { statement: string; values: never[] }[]) => {
          db.exec('BEGIN');
          try {
            for (const item of statements) db.prepare(item.statement).run(...item.values);
            db.exec('COMMIT');
          } catch (error) { db.exec('ROLLBACK'); throw error; }
        },
      };
    }
  },
}));

import { SQLiteWorkspaceRepository,SQLiteMediaOutboxRepository } from '@archforms/data-local';
import { buildExpediente, buildVisita, workspaceOperation } from '@archforms/application';

describe('workspace on real SQLite SQL engine (not Android plugin)', () => {
  it('preserves newer media payloads and does not evict uploaded originals by age',async()=>{
    const repository=new SQLiteMediaOutboxRepository();
    const row={id:'media-group',entity_type:'grupo_captura' as const,payload:'old',depends_on:[],created_at:'2020-01-01T00:00:00.000Z'};
    await repository.enqueueEntity(row);
    await repository.markEntitySyncing(row.id);
    await repository.enqueueEntity({...row,payload:'new'});
    await repository.markEntitySynced(row.id,'old');
    expect(await repository.entityStatus(row.id)).toMatchObject({payload:'new',status:'pending'});
    expect(await repository.collectGarbage(new Date().toISOString())).toEqual([]);
  });
  it('migrates legacy state and commits entity and outbox atomically', async () => {
    const owner = crypto.randomUUID();
    const form = new FormData();
    form.set('nro_expediente', 'SQL-1');
    form.set('ubicacion', 'Lima');
    const record = buildExpediente(owner, form, { version: 1, sections: [{id:'base',title:'Base',fields:[]}] });
    const op = workspaceOperation('expediente', record);
    const db = new DatabaseSync(':memory:');
    db.exec('CREATE TABLE workspace_state(owner TEXT PRIMARY KEY, payload TEXT NOT NULL)');
    db.prepare('INSERT INTO workspace_state VALUES(?,?)').run(owner, JSON.stringify({
      expedientes: [record], visitas: [], plantillas: [], pending: [op], last_sync: null,
    }));
    databases.set('archforms_workspace', db);
    const local = new SQLiteWorkspaceRepository();
    expect((await local.read(owner)).pending).toEqual([op]);
    const visit = buildVisita(record, 1, '2026-09-17');
    const next = workspaceOperation('visita', visit);
    await local.save(owner, next);
    expect((await local.read(owner)).pending.map(item => item.id)).toEqual([op.id, next.id]);
    await local.acknowledge(owner, op.id);
    expect((await new SQLiteWorkspaceRepository().read(owner)).pending).toEqual([{...next,workspace_mutation:{type:'create',payload:next.record}}]);
    await local.saveAnswers(owner,visit.id,{note:'offline'});
    expect((await new SQLiteWorkspaceRepository().read(owner)).visitas[0].checklist_respuestas_json).toEqual({note:'offline'});
    const beforeFailure=(await local.read(owner)).pending;

    db.exec("CREATE TRIGGER reject_pending BEFORE INSERT ON workspace_pending BEGIN SELECT RAISE(ABORT,'disk failure'); END");
    const rejected = { ...visit, id: crypto.randomUUID() };
    await expect(local.save(owner, workspaceOperation('visita', rejected))).rejects.toThrow('disk failure');
    expect((await local.read(owner)).visitas.map(item => item.id)).not.toContain(rejected.id);
     expect((await local.read(owner)).pending).toEqual(beforeFailure);
     db.exec('DROP TRIGGER reject_pending');
     const deletion={...workspaceOperation('expediente',record),workspace_mutation:{type:'delete' as const,payload:{}}};
     await local.save(owner,deletion);
     expect(await new SQLiteWorkspaceRepository().read(owner)).toMatchObject({expedientes:[],visitas:[],pending:[deletion]});
  });
});
