/**
 * Generadores de colocación de stickers. Módulo puro (probado en tests/pattern.test.ts).
 *
 * Coordenadas de salida normalizadas al lienzo/capa: x, y ∈ (≈0..1) son el CENTRO del sticker; `size` es su ancho
 * relativo al lado corto. Pueden salirse un poco de 0..1 para que el patrón llegue hasta los bordes sin huecos.
 * Todo depende de una semilla: la misma semilla da siempre el mismo resultado («Otra variación» cambia la semilla).
 */
export type PatternLayout = 'grid' | 'scatter';
export type PatternParams = {
  layout: PatternLayout;
  /** Tamaño base, 0.04..0.6 del lado corto. */
  size: number;
  /** 0..1: cuánto varía el tamaño entre copias. */
  sizeVariation: number;
  /** Grados máximos de giro a cada lado (0..180). */
  rotation: number;
  /** 0..1: separación extra entre copias. */
  spacing: number;
  /** 0..1: desorden de la posición en la cuadrícula. */
  jitter: number;
  /** Voltear al azar. */
  flip: boolean;
  seed: number;
};
export type PatternItem = { src: number; x: number; y: number; size: number; rotation: number; flip: boolean };

export const DEFAULT_PATTERN: PatternParams = { layout: 'scatter', size: .16, sizeVariation: .35, rotation: 35, spacing: .15, jitter: .4, flip: true, seed: 1 };
export const MAX_PATTERN_ITEMS = 400;

/** PRNG pequeño y determinista (mulberry32). */
export function rng(seed: number) {
  let a = (Math.floor(seed) >>> 0) || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeItem(r: () => number, p: PatternParams, sources: number, cx: number, cy: number, w: number, h: number): PatternItem {
  const size = p.size * (1 + (r() * 2 - 1) * p.sizeVariation * .6);
  return {
    src: sources > 1 ? Math.floor(r() * sources) % sources : 0,
    x: cx / w, y: cy / h,
    size: Math.max(.01, size),
    rotation: ((r() * 2 - 1) * p.rotation * Math.PI) / 180,
    flip: p.flip && r() < .5,
  };
}

/**
 * Patrón que cubre TODO el lienzo (w×h en píxeles).
 * - grid: filas desplazadas a medias (como ladrillos) con desorden opcional.
 * - scatter: «lanzamiento de dardos» con distancia mínima: reparto natural, sin amontonarse ni dejar huecos grandes.
 */
export function generatePattern(p: PatternParams, w: number, h: number, sources = 1): PatternItem[] {
  const r = rng(p.seed);
  const m = Math.min(w, h);
  const cell = Math.max(m * .03, p.size * m * (1 + p.spacing * 1.2));
  const items: PatternItem[] = [];
  if (p.layout === 'grid') {
    const rowH = cell * .9;
    const cols = Math.ceil(w / cell) + 2, rows = Math.ceil(h / rowH) + 2;
    for (let row = -1; row < rows && items.length < MAX_PATTERN_ITEMS; row++) {
      for (let col = -1; col < cols && items.length < MAX_PATTERN_ITEMS; col++) {
        const jx = (r() * 2 - 1) * p.jitter * cell * .35, jy = (r() * 2 - 1) * p.jitter * rowH * .35;
        const cx = col * cell + (row % 2 ? cell / 2 : 0) + jx, cy = row * rowH + jy;
        items.push(makeItem(r, p, sources, cx, cy, w, h));
      }
    }
    return items;
  }
  // scatter: distancia mínima ≈ 0.8 de una celda; se intenta hasta llenar el área (con margen para los bordes).
  const minD = cell * .8, pad = cell * .5;
  const target = Math.min(MAX_PATTERN_ITEMS, Math.ceil(((w + 2 * pad) * (h + 2 * pad)) / (cell * cell) * 1.15));
  const pts: { x: number; y: number }[] = [];
  const gridSize = minD / Math.SQRT2;
  const gw = Math.ceil((w + 2 * pad) / gridSize) + 1, gh = Math.ceil((h + 2 * pad) / gridSize) + 1;
  const grid = new Int32Array(gw * gh).fill(-1);
  const fits = (x: number, y: number) => {
    const gx = Math.floor((x + pad) / gridSize), gy = Math.floor((y + pad) / gridSize);
    for (let yy = Math.max(0, gy - 2); yy <= Math.min(gh - 1, gy + 2); yy++)
      for (let xx = Math.max(0, gx - 2); xx <= Math.min(gw - 1, gx + 2); xx++) {
        const i = grid[yy * gw + xx];
        if (i >= 0 && Math.hypot(pts[i].x - x, pts[i].y - y) < minD) return false;
      }
    return true;
  };
  for (let tries = 0; tries < target * 40 && pts.length < target; tries++) {
    const x = -pad + r() * (w + 2 * pad), y = -pad + r() * (h + 2 * pad);
    if (!fits(x, y)) continue;
    grid[Math.floor((y + pad) / gridSize) * gw + Math.floor((x + pad) / gridSize)] = pts.length;
    pts.push({ x, y });
  }
  for (const pt of pts) items.push(makeItem(r, p, sources, pt.x, pt.y, w, h));
  return items;
}

export type CompositionParams = { count: number; size: number; sizeVariation: number; rotation: number; flip: boolean; seed: number };
export const DEFAULT_COMPOSITION: CompositionParams = { count: 7, size: .3, sizeVariation: .5, rotation: 25, flip: true, seed: 1 };

/**
 * Composición aleatoria: pocas piezas grandes, repartidas DENTRO del lienzo y separándose entre sí lo posible.
 * Se generan como capas sueltas, así que cada una se puede mover o editar después.
 */
export function generateComposition(p: CompositionParams, w: number, h: number, sources = 1): PatternItem[] {
  const r = rng(p.seed);
  const m = Math.min(w, h);
  const out: PatternItem[] = [];
  const count = Math.max(1, Math.min(40, Math.round(p.count)));
  for (let i = 0; i < count; i++) {
    const size = Math.max(.05, p.size * (1 + (r() * 2 - 1) * p.sizeVariation * .6));
    const half = (size * m) / 2;
    let best = { x: w / 2, y: h / 2 }, bestScore = -1;
    for (let k = 0; k < 24; k++) { // se queda con el punto más alejado de las piezas ya colocadas
      const x = half + r() * Math.max(1, w - 2 * half), y = half + r() * Math.max(1, h - 2 * half);
      let score = Infinity;
      for (const o of out) score = Math.min(score, Math.hypot(o.x * w - x, o.y * h - y) - (o.size * m) / 2 - half);
      if (score > bestScore) { bestScore = score; best = { x, y }; }
    }
    out.push({ src: sources > 1 ? (i < sources ? i : Math.floor(r() * sources)) : 0, x: best.x / w, y: best.y / h, size,
      rotation: ((r() * 2 - 1) * p.rotation * Math.PI) / 180, flip: p.flip && r() < .5 });
  }
  return out;
}
