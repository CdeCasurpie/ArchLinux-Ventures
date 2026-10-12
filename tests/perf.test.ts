import { describe, expect, it, vi } from 'vitest';
import { perfLog, startLongTaskLog } from '../apps/client/src/features/perf';

describe('perf (Fase 0)', () => {
  it('startLongTaskLog no revienta donde longtask no existe', () => {
    expect(() => startLongTaskLog()).not.toThrow();
  });

  it('perfLog registra etiqueta y ms redondeados', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    try {
      perfLog('toque→pila', 123.6);
      expect(spy).toHaveBeenCalledWith('[perf] toque→pila 124ms');
    } finally {
      spy.mockRestore();
    }
  });
});
