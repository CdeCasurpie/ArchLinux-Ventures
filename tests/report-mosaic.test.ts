import { describe, expect, it } from 'vitest';
import { layoutMosaic } from '../packages/report-pdf/src/mosaic';
import { planPhotoPages, type PlanGroup } from '../packages/report-pdf/src/paginate';

const OPTS = { width: 515, gap: 4, targetH: 150, minH: 95, maxH: 200, maxPerRow: 4 };

describe('layoutMosaic', () => {
  it('parte 6 fotos en 2 filas con los altos y anchos esperados', () => {
    const rows = layoutMosaic([1.5, 0.75, 1.33, 3, 0.56, 1], OPTS);
    expect(rows).toHaveLength(2);
    expect(rows[0].idx).toEqual([0, 1, 2]);
    expect(rows[0].height).toBeCloseTo(141.6, 1);
    expect(rows[0].widths[0]).toBeCloseTo(212.4, 1);
    expect(rows[0].widths[1]).toBeCloseTo(106.2, 1);
    expect(rows[0].widths[2]).toBeCloseTo(188.4, 1);
    expect(rows[0].underfilled).toBe(false);
    expect(rows[1].idx).toEqual([3, 4, 5]);
    expect(rows[1].height).toBeCloseTo(111.2, 1);
    expect(rows[1].widths[0]).toBeCloseTo(333.6, 1);
    expect(rows[1].widths[1]).toBeCloseTo(62.3, 1);
    expect(rows[1].widths[2]).toBeCloseTo(111.2, 1);
    expect(rows[1].underfilled).toBe(false);
  });

  it('foto sola: alto maxH y underfilled', () => {
    const [r1] = layoutMosaic([1.5], OPTS);
    expect(r1.height).toBe(200);
    expect(r1.widths[0]).toBeCloseTo(300, 6);
    expect(r1.underfilled).toBe(true);
    const [r2] = layoutMosaic([0.75], OPTS);
    expect(r2.height).toBe(200);
    expect(r2.widths[0]).toBeCloseTo(150, 6);
    expect(r2.underfilled).toBe(true);
  });

  it('panorámica 3 llena el ancho sin underfilled', () => {
    const [r] = layoutMosaic([3], OPTS);
    expect(r.height).toBeCloseTo(171.7, 1);
    expect(r.widths[0]).toBeCloseTo(515, 0);
    expect(r.underfilled).toBe(false);
  });

  it('entrada vacía', () => {
    expect(layoutMosaic([], OPTS)).toEqual([]);
  });

  it('propiedades con 1000+ entradas aleatorias', () => {
    let seed = 123456789;
    const rnd = () => ((seed = (Math.imul(seed ^ (seed >>> 15), 2246822519) >>> 0) / 4294967296));
    for (let t = 0; t < 1200; t++) {
      const n = 1 + Math.floor(rnd() * 14);
      const aspects = Array.from({ length: n }, () => 0.4 + rnd() * 3.4);
      const rows = layoutMosaic(aspects, OPTS);
      // Índices 0..n-1 en orden y sin repetir.
      expect(rows.flatMap(r => r.idx)).toEqual(Array.from({ length: n }, (_, i) => i));
      for (const r of rows) {
        const used = r.widths.reduce((a, b) => a + b, 0) + (r.idx.length - 1) * OPTS.gap;
        if (r.underfilled) expect(used).toBeLessThanOrEqual(OPTS.width + 1e-9);
        else expect(used).toBeCloseTo(OPTS.width, 2);
        expect(r.height).toBeLessThanOrEqual(OPTS.maxH + 1e-9);
      }
    }
  });
});

function groups(spec: Array<{ n: number; comment?: string; missing?: number; leadH?: number }>): PlanGroup[] {
  return spec.map((s, gi) => ({
    aspects: Array.from({ length: s.n }, (_, k) => 0.6 + ((gi * 7 + k * 13) % 29) / 10),
    comment: s.comment ?? `Comentario ${gi}`,
    missing: s.missing ?? 0,
    leadH: s.leadH ?? 0,
  }));
}

describe('planPhotoPages', () => {
  it('cada foto aparece exactamente una vez y en orden, sin pasar el cap', () => {
    const gs = groups([{ n: 1 }, { n: 3 }, { n: 7 }, { n: 11 }]);
    const pages = planPhotoPages(gs, OPTS, 600);
    const seen: Array<[number, number[]]> = [];
    for (const pg of pages) {
      expect(pg.used).toBeLessThanOrEqual(pg.cap + 1e-9);
      let sum = 0;
      for (const u of pg.units) {
        sum += u.height;
        if (u.row) seen.push([u.g, u.row.idx]);
      }
      expect(sum).toBeCloseTo(pg.used, 6);
      // Primera unidad con first, última con last por hallazgo dentro de la página.
      const byG = new Map<number, typeof pg.units>();
      for (const u of pg.units) byG.set(u.g, [...(byG.get(u.g) ?? []), u]);
      for (const us of byG.values()) {
        const all = pages.flatMap(p => p.units).filter(x => x.g === us[0].g);
        if (us[0] === all[0]) expect(us[0].first).toBe(true);
        if (us[us.length - 1] === all[all.length - 1]) expect(us[us.length - 1].last).toBe(true);
      }
    }
    // Cobertura exacta y ordenada por hallazgo.
    const total = gs.reduce((a, g) => a + g.aspects.length, 0);
    const flat: number[] = [];
    const perG = new Map<number, number[]>();
    for (const [g, idx] of seen) perG.set(g, [...(perG.get(g) ?? []), ...idx]);
    for (let g = 0; g < gs.length; g++) {
      expect(perG.get(g)).toEqual(Array.from({ length: gs[g].aspects.length }, (_, i) => i));
      flat.push(g);
    }
    expect(seen.reduce((a, [, idx]) => a + idx.length, 0)).toBe(total);
    expect(flat).toEqual([0, 1, 2, 3]);
  });

  it('cap1 diminuto deja la primera página vacía', () => {
    const pages = planPhotoPages(groups([{ n: 2 }, { n: 2 }]), OPTS, 50);
    expect(pages.length).toBeGreaterThan(1);
    expect(pages[0].units).toEqual([]);
    for (const pg of pages.slice(1)) expect(pg.units.length).toBeGreaterThan(0);
  });

  it('grupo sin fotos produce unidad título+comentario', () => {
    const pages = planPhotoPages(groups([{ n: 0 }]), OPTS, 600);
    const units = pages.flatMap(p => p.units);
    expect(units).toHaveLength(1);
    expect(units[0].row).toBeNull();
    expect(units[0].first).toBe(true);
    expect(units[0].last).toBe(true);
  });
});
