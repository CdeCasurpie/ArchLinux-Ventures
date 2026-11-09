import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@archforms/contracts';
import { parseAnswerChange, type AnswerPatch, type AnswerSyncRemote } from '@archforms/application';

/** Opt-in protocol adapter. Legacy clients remain unchanged until local reconciliation is ready. */
export class SupabaseAnswerSyncRemote implements AnswerSyncRemote {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async push(operation: AnswerPatch) {
    const { data, error } = await this.client.rpc('sync_patch_answers_v1', {
      operation_id: operation.operationId,
      visita_id: operation.visitaId,
      patch: operation.patch,
    });
    if (error) throw error;
    return parseAnswerChange(data);
  }

  async pull(afterRevision: number, pageSize = 100) {
    const { data, error } = await this.client.rpc('sync_pull_answers_v1', {
      after_revision: afterRevision,
      page_size: pageSize,
    });
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error('Invalid answer change page');
    const changes = data.map(parseAnswerChange);
    let previous = afterRevision;
    for (const change of changes) {
      if (change.revision <= previous) throw new Error('Unordered answer change page');
      previous = change.revision;
    }
    return changes;
  }
}
