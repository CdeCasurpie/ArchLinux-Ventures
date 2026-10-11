/**
 * Mosaico de fotos de dimensiones arbitrarias.
 *
 * Filas justificadas ("linear partition"): se conserva el orden de las fotos, cada fila
 * llena el ancho completo (0 espacio horizontal vacío) y el alto de cada fila se deduce
 * de las proporciones, h = (W - gaps) / Σ aspecto. Una DP elige dónde cortar las filas
 * para que todas queden cerca de `targetH`, sin pasar de [minH, maxH].
 * Menor `targetH` => mosaico más denso y compacto; mayor => fotos más grandes.
 */
export interface MosaicOpts {
  width: number;
  gap: number;
  targetH: number;
  minH: number;
  maxH: number;
  maxPerRow?: number;
}

export interface MosaicRow {
  /** índices en el arreglo original, en orden */
  idx: number[];
  /** ancho de cada foto de la fila (pt) */
  widths: number[];
  /** alto de la fila (pt) */
  height: number;
  /** true si la fila no llena el ancho (solo ocurre si hFull > maxH): se centra */
  underfilled: boolean;
}

export function layoutMosaic(aspects: number[], o: MosaicOpts): MosaicRow[] {
  const n = aspects.length;
  if (n === 0) return [];
  const maxK = o.maxPerRow ?? 4;

  const rowOf = (i: number, j: number) => {
    const k = j - i;
    let sumA = 0;
    for (let t = i; t < j; t++) sumA += aspects[t];
    const gaps = (k - 1) * o.gap;
    const hFull = (o.width - gaps) / sumA;
    const h = Math.min(hFull, o.maxH);
    const used = sumA * h + gaps;
    let cost = ((h - o.targetH) / o.targetH) ** 2 + 0.03; // 0.03: costo fijo por fila
    if (hFull < o.minH) cost += 8 * ((o.minH - hFull) / o.minH);
    if (hFull > o.maxH) cost += 6 * (1 - used / o.width); // espacio en blanco
    return { cost, h, hFull, sumA };
  };

  const best = new Array<number>(n + 1).fill(Infinity);
  const prev = new Array<number>(n + 1).fill(0);
  best[0] = 0;
  for (let j = 1; j <= n; j++) {
    for (let i = Math.max(0, j - maxK); i < j; i++) {
      const c = best[i] + rowOf(i, j).cost;
      if (c < best[j]) { best[j] = c; prev[j] = i; }
    }
  }

  const rows: MosaicRow[] = [];
  for (let j = n; j > 0; j = prev[j]) {
    const i = prev[j];
    const r = rowOf(i, j);
    const idx = Array.from({ length: j - i }, (_, t) => i + t);
    rows.unshift({
      idx,
      widths: idx.map(t => aspects[t] * r.h),
      height: r.h,
      underfilled: r.hFull > o.maxH,
    });
  }
  return rows;
}

// ── Dimensiones desde los bytes de la imagen (sin dependencias) ─────────────

function b64ToBytes(b64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(b64, 'base64'));
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Ancho/alto de un dataURL JPEG o PNG, o null si no se reconoce. */
export function imageSizeFromDataUrl(dataUrl: string): { w: number; h: number } | null {
  const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const b = b64ToBytes(b64);
  if (b[0] === 0x89 && b[1] === 0x50) {
    const dv = new DataView(b.buffer, b.byteOffset);
    return { w: dv.getUint32(16), h: dv.getUint32(20) };
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    let p = 2;
    while (p < b.length - 9) {
      if (b[p] !== 0xff) { p++; continue; }
      const m = b[p + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        return { h: (b[p + 5] << 8) | b[p + 6], w: (b[p + 7] << 8) | b[p + 8] };
      }
      p += 2 + ((b[p + 2] << 8) | b[p + 3]);
    }
  }
  return null;
}
