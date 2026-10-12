// Medición de la ruta caliente de captura (Fase 0: línea base, sin cambios de conducta).
export function startLongTaskLog() {
  try {
    new PerformanceObserver(list =>
      list.getEntries().forEach(e => console.warn(`[longtask] ${Math.round(e.duration)}ms`)),
    ).observe({ entryTypes: ['longtask'] });
  } catch { /* longtask no soportado (p. ej. en tests) */ }
}
export const perfLog = (label: string, ms: number): void => {
  console.info(`[perf] ${label} ${Math.round(ms)}ms`);
};
