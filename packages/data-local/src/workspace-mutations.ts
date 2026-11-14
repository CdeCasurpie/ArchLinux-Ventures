import { checklistCompleted, type Visita, type WorkspacePending } from '@archforms/domain';

/** Freeze the intended change inside the same transaction that saves its entity. */
export function prepareMutation(operation: WorkspacePending, previous: unknown): WorkspacePending {
  if (!operation.protocol || operation.answer_patch || operation.workspace_mutation) return operation;
  if (!previous) return { ...operation, workspace_mutation: { type: 'create', payload: { ...operation.record } } };

  const ignored = new Set(['id', 'profesional_id', 'created_at', 'updated_at']);
  if (operation.entity === 'visita') {
    for (const key of ['expediente_id', 'nro_visita', 'checklist_respuestas_json', 'checklist_completado', 'pdf_archivo_id']) ignored.add(key);
  }
  const payload = Object.fromEntries(Object.entries(operation.record).filter(([key, value]) =>
    !ignored.has(key) && JSON.stringify(value) !== JSON.stringify((previous as Record<string, unknown>)[key]),
  ));
  return { ...operation, workspace_mutation: { type: 'patch', payload } };
}

export function answerOperation(record: Visita, patch: Record<string, string | number | null>): WorkspacePending {
  const answers = { ...record.checklist_respuestas_json, ...patch };
  const completed = checklistCompleted(record.checklist_esquema_json, answers);
  const stamp = new Date().toISOString();
  return {
    id: crypto.randomUUID(), entity: 'visita', created_at: stamp, answer_patch: patch,
    record: { ...record, checklist_respuestas_json: answers, checklist_completado: completed, updated_at: stamp },
  };
}
