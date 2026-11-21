/**
 * Núcleo puro (sin React Native, sin Skia) del selector de fondo por color.
 * Se puede probar en Node. Todo trabaja sobre buffers tipados y se reutiliza memoria entre llamadas:
 *  - buildLab(): se llama UNA vez por imagen (convierte RGBA -> Oklab y lo cachea).
 *  - computeAlpha(): se llama en cada cambio de slider/toque (~10-20 ms a 768x1024 en V8).
 *
 * Convención de salida: alpha 255 = conservar, 0 = quitar (igual que el sistema anterior).
 */
export type WandSettings = { tolerance: number; feather: number; contiguous: boolean };
export type Region = { kind: 'seed'; x: number; y: number } | { kind: 'border' };

export type LabBuffer = {
  w: number;
  h: number;
  /** L,a,b intercalados: 3 floats por píxel. */
  lab: Float32Array;
  /** Alfa de la imagen original (los píxeles ya transparentes cuentan como fondo). */
  alpha: Uint8Array;
  /** Memoria de trabajo reutilizable. */
  sel: Uint8Array;
  queue: Int32Array;
  tmp: Float32Array;
};

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

let LINEAR: Float32Array | null = null;
function linearTable() {
  if (LINEAR) return LINEAR;
  const t = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const v = i / 255;
    t[i] = v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  }
  return (LINEAR = t);
}

/** RGBA (8 bits, straight o premultiplied: da igual para el umbral) -> Oklab. Una sola vez por imagen. */
export function buildLab(rgba: ArrayLike<number>, w: number, h: number): LabBuffer {
  const n = w * h;
  const lin = linearTable();
  const lab = new Float32Array(n * 3);
  const alpha = new Uint8Array(n);
  for (let i = 0, p = 0, q = 0; i < n; i++, p += 4, q += 3) {
    const r = lin[rgba[p] & 255], g = lin[rgba[p + 1] & 255], b = lin[rgba[p + 2] & 255];
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    lab[q] = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
    lab[q + 1] = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
    lab[q + 2] = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
    alpha[i] = rgba[p + 3] & 255;
  }
  return { w, h, lab, alpha, sel: new Uint8Array(n), queue: new Int32Array(n), tmp: new Float32Array(n) };
}

/** Media de un parche (2r+1)^2: la semilla de un solo píxel es muy ruidosa. */
export function labAt(buf: LabBuffer, x: number, y: number, r = 2): [number, number, number] {
  const { w, h, lab } = buf;
  let L = 0, A = 0, B = 0, n = 0;
  for (let yy = Math.max(0, y - r); yy <= Math.min(h - 1, y + r); yy++) {
    for (let xx = Math.max(0, x - r); xx <= Math.min(w - 1, x + r); xx++) {
      const q = (yy * w + xx) * 3;
      L += lab[q]; A += lab[q + 1]; B += lab[q + 2]; n++;
    }
  }
  return [L / n, A / n, B / n];
}

/** Color de fondo típico = mediana por canal de una muestra del borde (robusta si el sujeto toca el borde). */
export function borderRef(buf: LabBuffer): [number, number, number] {
  const { w, h, lab } = buf;
  const xs: number[] = [], ys: number[] = [], zs: number[] = [];
  const add = (x: number, y: number) => { const q = (y * w + x) * 3; xs.push(lab[q]); ys.push(lab[q + 1]); zs.push(lab[q + 2]); };
  const sx = Math.max(1, Math.floor(w / 96)), sy = Math.max(1, Math.floor(h / 96));
  for (let x = 0; x < w; x += sx) { add(x, 0); add(x, h - 1); }
  for (let y = 0; y < h; y += sy) { add(0, y); add(w - 1, y); }
  const med = (a: number[]) => { a.sort((p, q) => p - q); return a[a.length >> 1]; };
  return [med(xs), med(ys), med(zs)];
}

export const thresholdOf = (tolerance: number) => 0.008 + (tolerance / 100) * 0.45;
export const featherRadius = (feather: number) => {
  const r = (feather / 100) * 12;
  return r <= 0 ? 0 : clamp(Math.round(r), 1, 16);
};

/** Desenfoque de caja separable con sumas deslizantes: O(1) por píxel sin importar el radio. */
function boxBlur(src: Uint8Array, dst: Uint8Array, tmp: Float32Array, w: number, h: number, k: number) {
  const d = 2 * k + 1;
  for (let y = 0; y < h; y++) {
    const o = y * w;
    let sum = src[o] * (k + 1);
    for (let x = 1; x <= k; x++) sum += src[o + Math.min(x, w - 1)];
    for (let x = 0; x < w; x++) {
      tmp[o + x] = sum / d;
      sum += src[o + Math.min(x + k + 1, w - 1)] - src[o + Math.max(x - k, 0)];
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = tmp[x] * (k + 1);
    for (let y = 1; y <= k; y++) sum += tmp[Math.min(y, h - 1) * w + x];
    for (let y = 0; y < h; y++) {
      dst[y * w + x] = (sum / d + 0.5) | 0;
      sum += tmp[Math.min(y + k + 1, h - 1) * w + x] - tmp[Math.max(y - k, 0) * w + x];
    }
  }
}

/**
 * Calcula la máscara alfa (w*h bytes, 255 conservar / 0 quitar).
 * - region.seed + contiguous: zona conectada al toque (comparada con la media del parche tocado).
 * - region.seed + !contiguous: todos los píxeles parecidos al toque (modo "global").
 * - region.border: fondo conectado a los bordes; el color de fondo se detecta solo (cero toques).
 * Devuelve un Uint8Array NUEVO, listo para entregarlo a Skia.
 */
export function computeAlpha(buf: LabBuffer, region: Region, s: WandSettings): Uint8Array {
  const { w, h, lab, alpha, sel, queue } = buf;
  const n = w * h;
  const th2 = Math.pow(thresholdOf(s.tolerance), 2);
  sel.fill(0);

  let ref: [number, number, number];
  if (region.kind === 'border') ref = borderRef(buf);
  else {
    const sx = clamp(Math.floor(region.x * w), 0, w - 1), sy = clamp(Math.floor(region.y * h), 0, h - 1);
    ref = labAt(buf, sx, sy, 2);
  }
  const [rL, rA, rB] = ref;
  const similar = (i: number) => {
    if (alpha[i] < 8) return true; // ya transparente = ya es fondo
    const q = i * 3, dl = lab[q] - rL, da = lab[q + 1] - rA, db = lab[q + 2] - rB;
    return dl * dl + da * da + db * db <= th2;
  };

  if (region.kind === 'seed' && !s.contiguous) {
    for (let i = 0; i < n; i++) sel[i] = similar(i) ? 1 : 0;
  } else {
    let head = 0, tail = 0;
    const push = (i: number) => { if (sel[i] === 0 && similar(i)) { sel[i] = 1; queue[tail++] = i; } };
    if (region.kind === 'border') {
      for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
      for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
    } else {
      push(clamp(Math.floor(region.y * h), 0, h - 1) * w + clamp(Math.floor(region.x * w), 0, w - 1));
    }
    while (head < tail) {
      const i = queue[head++], x = i % w;
      if (x > 0) push(i - 1);
      if (x < w - 1) push(i + 1);
      if (i >= w) push(i - w);
      if (i < n - w) push(i + w);
    }
  }

  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = sel[i] ? 0 : 255;
  const k = featherRadius(s.feather);
  if (k === 0) return out;
  const soft = new Uint8Array(n);
  boxBlur(out, soft, buf.tmp, w, h, k);
  return soft;
}
