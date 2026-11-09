import { describe, expect, it } from 'vitest';
import { parseAnswerChange } from '@archforms/application';

describe('RPC answer validation', () => {
  it('accepts the current answer wire format', () => {
    expect(parseAnswerChange({ revision: 1, visita_id: 'visit', answers: { a: 'no', b: 0, c: null } }))
      .toEqual({ revision: 1, visitaId: 'visit', answers: { a: 'no', b: 0, c: null } });
  });
  it.each([null, {}, { revision: 0, visita_id: 'v', answers: {} },
    { revision: Number.MAX_SAFE_INTEGER + 1, visita_id: 'v', answers: {} },
    { revision: 1, visita_id: 'v', answers: [] },
    { revision: 1, visita_id: 'v', answers: { a: {} } }])('rejects malformed responses: %j', value => {
    expect(() => parseAnswerChange(value)).toThrow();
  });
});
