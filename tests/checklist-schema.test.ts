import { describe, expect, it } from 'vitest';
import {
 assertChecklist, withAvanceObra, parseChecklistSchema, checklistStats, sectionStats,
 AVANCE_OBRA_FIELD_ID, type ChecklistSchema,
} from '@archforms/domain';

const v1: ChecklistSchema = { version: 1, sections: [
 { id: 's1', title: 'Seguridad', fields: [{ id: 'epp', label: 'EPP', type: 'boolean' }] },
] };

describe('assertChecklist (catálogo dinámico, esquema v2)', () => {
 it('acepta esquemas v1 y v2', () => {
  expect(assertChecklist(v1)).toBeTruthy();
  expect(assertChecklist({ ...v1, version: 2 })).toBeTruthy();
 });
 it('rechaza una versión desconocida', () => {
  expect(() => assertChecklist({ ...v1, version: 3 as unknown as 1 })).toThrow(/Versión/);
 });
 it('select exige opciones no vacías', () => {
  expect(() => assertChecklist({ ...v1, sections: [{ id: 's', title: 'S', fields: [
   { id: 'a', label: 'Estado', type: 'select' },
  ] }] })).toThrow(/opción/);
  expect(() => assertChecklist({ ...v1, sections: [{ id: 's', title: 'S', fields: [
   { id: 'a', label: 'Estado', type: 'select', options: ['Bueno', ''] },
  ] }] })).toThrow(/opciones/);
 });
 it('porcentaje debe vivir entre 0 y 100 y min<=max', () => {
  expect(() => assertChecklist({ ...v1, sections: [{ id: 's', title: 'S', fields: [
   { id: 'a', label: 'P', type: 'percent', min: 150 },
  ] }] })).toThrow(/entre 0 y 100/);
  expect(() => assertChecklist({ ...v1, sections: [{ id: 's', title: 'S', fields: [
   { id: 'a', label: 'P', type: 'percent', min: 0, max: 100 },
  ] }] })).toBeTruthy();
  expect(() => assertChecklist({ ...v1, sections: [{ id: 's', title: 'S', fields: [
   { id: 'a', label: 'N', type: 'number', min: 10, max: 5 },
  ] }] })).toThrow(/inválido/);
 });
});

describe('withAvanceObra (campo de sistema «Avance de obra»)', () => {
 it('inyecta un percent obligatorio al final del esquema', () => {
  const schema = withAvanceObra(structuredClone(v1));
  const last = schema.sections.at(-1)!;
  const avance = last.fields.find(f => f.id === AVANCE_OBRA_FIELD_ID);
  expect(avance).toMatchObject({ type: 'percent', required: true });
  assertChecklist(schema);
 });
 it('no duplica si ya existe y no muta el original', () => {
  const original = structuredClone(v1);
  const once = withAvanceObra(v1);
  const twice = withAvanceObra(once);
  expect(twice.sections.at(-1)!.fields.filter(f => f.id === AVANCE_OBRA_FIELD_ID)).toHaveLength(1);
  expect(v1).toEqual(original);
 });
 it('crea una sección en un esquema sin secciones', () => {
  const schema = withAvanceObra({ version: 2, sections: [] });
  expect(schema.sections).toHaveLength(1);
  expect(() => assertChecklist(schema)).not.toThrow();
 });
});

describe('parseChecklistSchema', () => {
 it('normaliza v1 y v2 sin rechazar datos históricos', () => {
  expect(parseChecklistSchema({ version: 1, sections: v1.sections })).toEqual(v1);
  expect(parseChecklistSchema({ version: 2, sections: v1.sections })?.version).toBe(2);
  expect(parseChecklistSchema(null)).toBeNull();
  expect(parseChecklistSchema({ version: 3, sections: [] })).toBeNull();
 });
});

describe('checklistStats (9.4: progreso global y por sección)', () => {
 const schema: ChecklistSchema = { version: 2, sections: [
  { id: 's1', title: 'S1', fields: [
   { id: 'a', label: 'A', type: 'boolean', required: true },
   { id: 'b', label: 'B', type: 'percent' },
  ] },
  { id: 's2', title: 'S2', fields: [{ id: 'c', label: 'C', type: 'text', required: true }] },
 ] };

 it('un 0 numérico o porcentual SÍ cuenta como respondido', () => {
  const stats = checklistStats(schema, { a: 'si', b: 0, c: 'texto' });
  expect(stats).toMatchObject({ answered: 3, total: 3, progress: 100, missingRequired: 0 });
 });
 it('cuenta faltantes obligatorios y porcentaje parcial', () => {
  const stats = checklistStats(schema, { a: 'si', b: null });
  expect(stats).toMatchObject({ answered: 1, total: 3, missingRequired: 1 });
  expect(sectionStats(schema.sections[1], {})).toEqual({ answered: 0, total: 1 });
 });
 it('una respuesta anulada no cuenta como respondida', () => {
  const stats = checklistStats(schema, { a: 'si', b: 50, c: null });
  expect(stats.answered).toBe(2);
  expect(stats.missingRequired).toBe(1);
 });
});
