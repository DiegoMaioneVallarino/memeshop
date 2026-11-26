/**
 * Licuar (como el filtro Licuar de Photoshop): un campo de desplazamiento sobre una malla.
 *
 * Cada nodo de la malla guarda un desplazamiento (dx, dy) en unidades normalizadas de la capa (0..1).
 * Al dibujar, el píxel de salida en `p` toma el color de la imagen en `p + desplazamiento(p)`.
 *
 * Los pinceles componen el campo de forma "semi-lagrangiana": para cada nodo se calcula de dónde debe leer
 * (q) y el nuevo desplazamiento es `campo(q) + (q - p)`. Así los trazos sucesivos se encadenan bien (empujar
 * dos veces arrastra lo ya empujado) en lugar de sumarse a ciegas.
 *
 * Módulo puro: sin React ni Skia. Probado en tests/liquify.test.ts.
 */
export type LiquifyMode = 'push' | 'twirlCW' | 'twirlCCW' | 'pinch' | 'bloat' | 'restore';
import type { LiquifyField } from '../types/editor';
export type { LiquifyField };

/** Nodos en el lado largo: 96 da curvas suaves con pinceles pequeños y se guarda en ~60 KB. */
export const LIQUIFY_LONG_SIDE = 96;
/** Rango de desplazamiento que cabe en la textura de 8 bits (±0.5 del tamaño de la capa). */
export const LIQUIFY_RANGE = .5;

export function createField(width: number, height: number, longSide = LIQUIFY_LONG_SIDE): { cols: number; rows: number; data: Float32Array } {
  const k = longSide / Math.max(width, height);
  const cols = Math.max(8, Math.round(width * k)), rows = Math.max(8, Math.round(height * k));
  return { cols, rows, data: new Float32Array(cols * rows * 2) };
}

export function fieldFrom(field: LiquifyField | undefined, width: number, height: number) {
  if (!field || field.data.length !== field.cols * field.rows * 2) return createField(width, height);
  return { cols: field.cols, rows: field.rows, data: Float32Array.from(field.data) };
}

/** Para guardar en el proyecto: 4 decimales bastan (0.0001 de la capa ≈ 0.4 px en una foto de 4096). */
export function serializeField(f: { cols: number; rows: number; data: Float32Array }): LiquifyField | undefined {
  let any = false;
  const data = Array.from(f.data, v => { const r = Math.round(v * 1e4) / 1e4; if (r !== 0) any = true; return r; });
  return any ? { cols: f.cols, rows: f.rows, data } : undefined;
}

/** Interpolación bilineal del campo en coordenadas normalizadas (u, v). */
export function sampleField(f: { cols: number; rows: number; data: ArrayLike<number> }, u: number, v: number): [number, number] {
  const x = Math.min(f.cols - 1, Math.max(0, u * (f.cols - 1))), y = Math.min(f.rows - 1, Math.max(0, v * (f.rows - 1)));
  const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(f.cols - 1, x0 + 1), y1 = Math.min(f.rows - 1, y0 + 1);
  const tx = x - x0, ty = y - y0, d = f.data;
  const i00 = (y0 * f.cols + x0) * 2, i10 = (y0 * f.cols + x1) * 2, i01 = (y1 * f.cols + x0) * 2, i11 = (y1 * f.cols + x1) * 2;
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  return [
    lerp(lerp(d[i00], d[i10], tx), lerp(d[i01], d[i11], tx), ty),
    lerp(lerp(d[i00 + 1], d[i10 + 1], tx), lerp(d[i01 + 1], d[i11 + 1], tx), ty),
  ];
}

export type BrushStamp = {
  mode: LiquifyMode;
  /** Centro y radio en píxeles de la capa. */
  x: number; y: number; radius: number;
  /** 0..1 */
  strength: number;
  /** Solo para push: movimiento del dedo desde el último punto, en píxeles de la capa. */
  dx?: number; dy?: number;
};

/** Caída suave (1 en el centro, 0 en el borde, derivada 0 en ambos): sin escalones visibles. */
const falloff = (d: number, r: number) => { if (d >= r) return 0; const t = 1 - d / r; return t * t * (3 - 2 * t); };

/**
 * Aplica un toque de pincel al campo (lo modifica en sitio). `width`/`height` son las medidas de la capa en
 * píxeles del documento, para que el pincel sea redondo aunque la capa no sea cuadrada.
 * Devuelve true si cambió algo.
 */
export function applyBrush(f: { cols: number; rows: number; data: Float32Array }, width: number, height: number, b: BrushStamp): boolean {
  const { cols, rows, data } = f;
  const r = Math.max(1, b.radius);
  const gx0 = Math.max(0, Math.floor(((b.x - r) / width) * (cols - 1))), gx1 = Math.min(cols - 1, Math.ceil(((b.x + r) / width) * (cols - 1)));
  const gy0 = Math.max(0, Math.floor(((b.y - r) / height) * (rows - 1))), gy1 = Math.min(rows - 1, Math.ceil(((b.y + r) / height) * (rows - 1)));
  if (gx0 > gx1 || gy0 > gy1) return false;
  const old = { cols, rows, data: data.slice() }; // lectura del campo anterior (semi-lagrangiano)
  const s = Math.max(0, Math.min(1, b.strength));
  let changed = false;
  for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) {
    const px = (gx / (cols - 1)) * width, py = (gy / (rows - 1)) * height;
    const w = falloff(Math.hypot(px - b.x, py - b.y), r);
    if (w <= 0) continue;
    const i = (gy * cols + gx) * 2;
    if (b.mode === 'restore') {
      const k = 1 - .35 * s * w;
      data[i] = old.data[i] * k; data[i + 1] = old.data[i + 1] * k;
      changed = true; continue;
    }
    let qx = px, qy = py;
    if (b.mode === 'push') {
      // Leer desde atrás del movimiento arrastra el contenido en la dirección del dedo.
      qx = px - (b.dx ?? 0) * w * (.35 + .65 * s); qy = py - (b.dy ?? 0) * w * (.35 + .65 * s);
    } else if (b.mode === 'twirlCW' || b.mode === 'twirlCCW') {
      const a = (b.mode === 'twirlCW' ? -1 : 1) * .12 * s * w;
      const ux = px - b.x, uy = py - b.y, c = Math.cos(a), sn = Math.sin(a);
      qx = b.x + ux * c - uy * sn; qy = b.y + ux * sn + uy * c;
    } else {
      // Ampliar lee más cerca del centro (aumenta); Reducir lee más lejos (encoge).
      const k = b.mode === 'bloat' ? 1 - .08 * s * w : 1 + .08 * s * w;
      qx = b.x + (px - b.x) * k; qy = b.y + (py - b.y) * k;
    }
    const [ox, oy] = sampleField(old, qx / width, qy / height);
    const nx = ox + (qx - px) / width, ny = oy + (qy - py) / height;
    data[i] = Math.max(-LIQUIFY_RANGE, Math.min(LIQUIFY_RANGE, nx));
    data[i + 1] = Math.max(-LIQUIFY_RANGE, Math.min(LIQUIFY_RANGE, ny));
    changed = true;
  }
  return changed;
}

/** Campo → bytes RGBA para una textura: R,G = dx,dy codificados en 1..255 alrededor de 128; alfa opaca. */
export function fieldToRGBA(f: { cols: number; rows: number; data: ArrayLike<number> }): Uint8Array {
  const n = f.cols * f.rows, out = new Uint8Array(n * 4);
  // Centro EXACTO en 128 (decodificar: (byte - 128) / 127): un desplazamiento cero no mueve ni un píxel.
  const enc = (v: number) => Math.max(1, Math.min(255, Math.round((v / LIQUIFY_RANGE) * 127) + 128));
  for (let i = 0; i < n; i++) { out[i * 4] = enc(f.data[i * 2]); out[i * 4 + 1] = enc(f.data[i * 2 + 1]); out[i * 4 + 2] = 128; out[i * 4 + 3] = 255; }
  return out;
}

export const isFieldEmpty = (f: { data: ArrayLike<number> }) => { for (let i = 0; i < f.data.length; i++) if (f.data[i] !== 0) return false; return true; };

/**
 * Recorte de la capa (sin rotación): el campo se remuestrea a la zona recortada y los desplazamientos se
 * re-expresan en el tamaño nuevo, para que la deformación quede exactamente donde estaba.
 */
export function cropField(field: LiquifyField | undefined, frac: { x: number; y: number; w: number; h: number }, width: number, height: number): LiquifyField | undefined {
  if (!field) return undefined;
  const src = fieldFrom(field, 1, 1);
  const out = createField(width * frac.w, height * frac.h);
  for (let gy = 0; gy < out.rows; gy++) for (let gx = 0; gx < out.cols; gx++) {
    const u = frac.x + (gx / (out.cols - 1)) * frac.w, v = frac.y + (gy / (out.rows - 1)) * frac.h;
    const [dx, dy] = sampleField(src, u, v), i = (gy * out.cols + gx) * 2;
    out.data[i] = Math.max(-LIQUIFY_RANGE, Math.min(LIQUIFY_RANGE, dx / frac.w));
    out.data[i + 1] = Math.max(-LIQUIFY_RANGE, Math.min(LIQUIFY_RANGE, dy / frac.h));
  }
  return serializeField(out);
}
