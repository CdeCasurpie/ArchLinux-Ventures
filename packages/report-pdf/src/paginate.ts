import { layoutMosaic, type MosaicOpts, type MosaicRow } from './mosaic';
import { PAGE_H, PAGE_TOP, PAGE_BOTTOM, CAP_FULL, CONTENT_W } from './layout';

/**
 * Planificación de páginas con conciencia del espacio disponible.
 *
 * react-pdf decide los saltos de página por su cuenta y no nos dice dónde caen, así que
 * aquí estimamos las alturas (todas se derivan de los estilos de informe.tsx) y fijamos
 * nosotros qué filas van en cada hoja. Para cada hoja se prueba un factor de escala `m`
 * sobre el alto objetivo del mosaico (m>1: fotos más grandes, m<1: más densas) y se
 * conserva el que llena mejor la hoja con el menor cambio de tamaño.
 */

export { PAGE_H, PAGE_TOP, PAGE_BOTTOM, CAP_FULL, CONTENT_W };
export const SAFETY = 8; // margen por error de estimación

// ── Estimación de alturas (pt) ──────────────────────────────────────────────

/** Líneas de un texto con corte por palabras; 0.52·fontSize ≈ ancho medio de Helvetica (conservador). */
export function countLines(text: string, width: number, fontSize: number): number {
  const perLine = Math.max(1, Math.floor(width / (fontSize * 0.52)));
  let total = 0;
  for (const para of (text || '').split('\n')) {
    let len = 0, lines = 1;
    for (const w of para.split(/\s+/).filter(Boolean)) {
      if (len === 0) len = w.length;
      else if (len + 1 + w.length <= perLine) len += 1 + w.length;
      else { lines++; len = w.length; }
    }
    total += lines;
  }
  return Math.max(1, total);
}

/**
 * Medido sobre un render real: react-pdf hereda el lineHeight de la página ya resuelto
 * (1.45 × 10pt = 14.5pt) en todo el texto, sin importar su fontSize.
 */
export const LINE = 14.5;

export const H = {
  header: 201.5,               // banda (descontando el margen negativo) + tarjeta de datos
  h2: 16 + LINE + 3 + 1.5 + 7,
  ckHead: 8 + LINE,
  ckSection: 6 + LINE + 0.5,
  groupTitle: 10 + 16 + 5,
  commentFixed: 4 + 6 + 2,
  commentLine: LINE,
  missingNote: LINE,
};

export function estimateChecklistHeight(
  sections: { title: string; fields: { id: string; label: string }[] }[],
  answers: Record<string, unknown>,
): number {
  let h = H.h2 + H.ckHead;
  for (const sec of sections) {
    h += H.ckSection;
    for (const f of sec.fields) {
      const raw = answers[f.id];
      const isAns = raw === 'si' || raw === 'no' || raw === 'na';
      const obs = raw === undefined || raw === null || raw === '' || isAns ? '' : String(raw);
      const desc = countLines(f.label, 263, 9.5) * LINE;
      const o = obs ? countLines(obs, 234, 8.5) * LINE : 11;
      h += 7 + 0.5 + Math.max(desc, o);
    }
  }
  return h;
}

export function estimateTextHeight(text: string): number {
  return countLines(text, CONTENT_W, 10) * LINE + 6;
}

// ── Planificador ────────────────────────────────────────────────────────────

export interface PlanGroup {
  aspects: number[];
  comment: string;
  missing: number;
  /** Altura de un encabezado extra que viaja con la primera fila (p. ej. "Registro fotográfico"). */
  leadH: number;
}
export interface PlanUnit {
  g: number;
  /** null: grupo sin fotos (solo título + comentario) */
  row: MosaicRow | null;
  first: boolean;
  last: boolean;
  height: number;
}
export interface PlanPage { units: PlanUnit[]; m: number; used: number; cap: number }

interface State { gi: number; ri: number; fixed: MosaicRow[] | null }

const GRID = [1, 0.95, 1.05, 0.9, 1.1, 0.85, 1.15, 0.8, 1.2, 0.75, 1.3, 1.4, 1.5];

export function planPhotoPages(
  groups: PlanGroup[],
  base: MosaicOpts,
  cap1: number,
  opts: { capFull?: number; lambda?: number; finishBonus?: number } = {},
): PlanPage[] {
  const capFull = opts.capFull ?? CAP_FULL - SAFETY;
  const lambda = opts.lambda ?? 0.6;
  const finishBonus = opts.finishBonus ?? 0.3;
  const gap = base.gap;

  const cache = new Map<string, MosaicRow[]>();
  const partition = (g: number, m: number) => {
    const key = `${g}:${m}`;
    let r = cache.get(key);
    if (!r) {
      r = layoutMosaic(groups[g].aspects, {
        ...base, targetH: base.targetH * m, maxH: base.maxH * m, minH: base.minH * Math.min(1, m),
      });
      cache.set(key, r);
    }
    return r;
  };
  const commentH = (g: number) =>
    H.commentFixed + countLines(groups[g].comment || 'Sin comentario.', CONTENT_W - 11.5, 9.5) * H.commentLine +
    (groups[g].missing > 0 ? H.missingNote : 0);
  const unitH = (g: number, row: MosaicRow | null, first: boolean, last: boolean) =>
    (row ? row.height + gap : 0) +
    (first ? H.groupTitle + groups[g].leadH : 0) +
    (last ? commentH(g) : 0);

  const pack = (st: State, cap: number, m: number) => {
    const units: PlanUnit[] = [];
    let used = 0, { gi, ri, fixed } = st;
    while (gi < groups.length) {
      const rows = fixed ?? partition(gi, m);
      if (rows.length === 0) {
        const h = unitH(gi, null, true, true);
        if (used + h > cap && units.length > 0) return { units, used, end: { gi, ri: 0, fixed: null } as State };
        units.push({ g: gi, row: null, first: true, last: true, height: h }); used += h;
      } else {
        for (let r = ri; r < rows.length; r++) {
          const h = unitH(gi, rows[r], r === 0, r === rows.length - 1);
          if (used + h > cap && units.length > 0) {
            return { units, used, end: { gi, ri: r, fixed: r > 0 ? rows : null } as State };
          }
          units.push({ g: gi, row: rows[r], first: r === 0, last: r === rows.length - 1, height: h });
          used += h;
        }
      }
      gi++; ri = 0; fixed = null;
    }
    return { units, used, end: { gi, ri: 0, fixed: null } as State };
  };

  const pages: PlanPage[] = [];
  let st: State = { gi: 0, ri: 0, fixed: null };
  let cap = cap1;
  while (st.gi < groups.length) {
    let best: { score: number; m: number; p: ReturnType<typeof pack> } | null = null;
    for (const m of GRID) {
      const p = pack(st, cap, m);
      if (p.units.length === 0 || p.used > cap) continue;
      const finished = p.end.gi >= groups.length;
      const blank = (cap - p.used) / cap;
      const score = Math.abs(Math.log(m)) * lambda + (finished ? -finishBonus : blank);
      if (!best || score < best.score) best = { score, m, p };
    }
    if (!best) {
      // Ni la primera unidad cabe en lo que queda de la hoja: se arranca en hoja nueva.
      if (cap < capFull) { pages.push({ units: [], m: 1, used: 0, cap }); cap = capFull; continue; }
      const u = pack(st, Infinity, 1).units[0]; // salvaguarda: unidad más alta que una hoja
      pages.push({ units: [u], m: 1, used: u.height, cap });
      st = u.last ? { gi: u.g + 1, ri: 0, fixed: null } : { gi: u.g, ri: st.ri + 1, fixed: st.fixed ?? partition(u.g, 1) };
      cap = capFull;
      continue;
    }
    pages.push({ units: best.p.units, m: best.m, used: best.p.used, cap });
    st = best.p.end;
    cap = capFull;
  }
  return pages;
}
