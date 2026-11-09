export type AnswerValue = string | number | null;
export interface AnswerPatch {
  operationId: string;
  visitaId: string;
  patch: Record<string, AnswerValue>;
}
export interface AnswerChange {
  revision: number;
  visitaId: string;
  answers: Record<string, AnswerValue>;
}
export interface AnswerSyncRemote {
  push(operation: AnswerPatch): Promise<AnswerChange>;
  pull(afterRevision: number, pageSize?: number): Promise<AnswerChange[]>;
}

/** Validate untrusted RPC JSON before advancing any durable local cursor. */
export function parseAnswerChange(value: unknown): AnswerChange {
  if (!value || typeof value !== 'object') throw new Error('Invalid answer change');
  const row = value as Record<string, unknown>;
  if (!Number.isSafeInteger(row.revision) || (row.revision as number) < 1 ||
      typeof row.visita_id !== 'string' || !row.answers ||
      typeof row.answers !== 'object' || Array.isArray(row.answers)) {
    throw new Error('Invalid answer change');
  }
  for (const answer of Object.values(row.answers)) {
    if (answer !== null && typeof answer !== 'string' &&
        !(typeof answer === 'number' && Number.isFinite(answer))) throw new Error('Invalid answer value');
  }
  return { revision: row.revision as number, visitaId: row.visita_id, answers: row.answers as Record<string, AnswerValue> };
}
