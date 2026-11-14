import { describe, expect, it } from 'vitest';
import { checklistCompleted, withAvanceObra, AVANCE_OBRA_FIELD_ID, type ChecklistSchema } from '@archforms/domain';

const schema: ChecklistSchema = { version: 1, sections: [
  { id: 's1', title: 'Obligatorios', fields: [
    { id: 'req1', label: 'Req 1', type: 'boolean', required: true },
    { id: 'opt1', label: 'Opt 1', type: 'text' },
  ] },
  { id: 's2', title: 'Más obligatorios', fields: [
    { id: 'req2', label: 'Req 2', type: 'text', required: true },
  ] },
] };

describe('checklistCompleted (9.3: solo los obligatorios bloquean)', () => {
  it('está completo cuando todos los obligatorios tienen respuesta, aunque falten opcionales', () => {
    expect(checklistCompleted(schema, { req1: 'si', req2: 'texto' })).toBe(true);
  });
  it('está incompleto si falta un obligatorio aunque los demás campos estén respondidos', () => {
    expect(checklistCompleted(schema, { req1: 'si', opt1: 'texto opcional' })).toBe(false);
  });
  it('un valor vacío o nulo no cuenta como respuesta', () => {
    expect(checklistCompleted(schema, { req1: '', req2: 'texto' })).toBe(false);
    expect(checklistCompleted(schema, { req1: null, req2: 'texto' })).toBe(false);
    expect(checklistCompleted(schema, { req2: 'texto' })).toBe(false);
  });
  it('un formulario sin obligatorios nunca queda bloqueado por completitud', () => {
    const optional: ChecklistSchema = { version: 1, sections: [{ id: 's', title: 'S', fields: [{ id: 'a', label: 'A', type: 'text' }] }] };
    expect(checklistCompleted(optional, {})).toBe(true);
  });
  it('un 0 numérico en un obligatorio cuenta como respondido', () => {
    const numeric: ChecklistSchema = { version: 2, sections: [{ id: 's', title: 'S', fields: [
      { id: 'n', label: 'N', type: 'number', required: true },
    ] }] };
    expect(checklistCompleted(numeric, { n: 0 })).toBe(true);
  });
  it('el avance de obra inyectado es obligatorio y bloquea la completitud', () => {
    const complete = withAvanceObra(structuredClone(schema));
    const field = complete.sections.at(-1)!.fields.find(f => f.id === AVANCE_OBRA_FIELD_ID)!;
    expect(field).toMatchObject({ type: 'percent', required: true });
    expect(checklistCompleted(complete, { req1: 'si', req2: 'x' })).toBe(false);
    expect(checklistCompleted(complete, { req1: 'si', req2: 'x', avance_obra: 40 })).toBe(true);
  });
});
