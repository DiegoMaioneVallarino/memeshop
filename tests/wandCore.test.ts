import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLab, computeAlpha, featherRadius, thresholdOf } from '../src/services/wandCore.ts';

/** Imagen sintética: fondo de un color y un cuadrado central de otro. */
function image(w: number, h: number, bg: number[], fg: number[], box = { x0: 3, y0: 3, x1: 7, y1: 7 }, alphaAt?: (x: number, y: number) => number) {
  const px = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const inside = x >= box.x0 && x < box.x1 && y >= box.y0 && y < box.y1;
    const c = inside ? fg : bg, i = (y * w + x) * 4;
    px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = alphaAt ? alphaAt(x, y) : 255;
  }
  return buildLab(px, w, h);
}
const at = (a: Uint8Array, w: number, x: number, y: number) => a[y * w + x];
const hard = { tolerance: 20, feather: 0, contiguous: true };

test('el modo borde quita el fondo y conserva el sujeto', () => {
  const buf = image(10, 10, [255, 255, 255], [200, 20, 20]);
  const a = computeAlpha(buf, { kind: 'border' }, hard);
  assert.equal(at(a, 10, 0, 0), 0, 'esquina = fondo');
  assert.equal(at(a, 10, 9, 5), 0, 'borde derecho = fondo');
  assert.equal(at(a, 10, 5, 5), 255, 'centro = sujeto');
});

test('un toque contiguo solo selecciona la región conectada', () => {
  // Dos cuadrados rojos separados por blanco; tocar uno no debe quitar el otro.
  // (La varita promedia un parche de 5×5 alrededor del toque, así que los cuadrados miden 7 px.)
  const w = 20, h = 10, px = new Uint8Array(w * h * 4).fill(255);
  for (let y = 1; y < 9; y++) for (let x = 0; x < w; x++) if ((x >= 1 && x < 8) || (x >= 12 && x < 19)) { const i = (y * w + x) * 4; px[i] = 220; px[i + 1] = 10; px[i + 2] = 10; }
  const buf = buildLab(px, w, h);
  const tap = { kind: 'seed' as const, x: 4.5 / w, y: 4.5 / h };
  const contiguous = computeAlpha(buf, tap, hard);
  assert.equal(at(contiguous, w, 4, 4), 0);
  assert.equal(at(contiguous, w, 15, 4), 255, 'el otro cuadrado sigue');
  assert.equal(at(contiguous, w, 10, 4), 255, 'el blanco entre ambos sigue');
  const global = computeAlpha(buf, tap, { ...hard, contiguous: false });
  assert.equal(at(global, w, 15, 4), 0, 'en modo global se quitan los dos');
});

test('los píxeles ya transparentes cuentan como fondo', () => {
  const buf = image(10, 10, [0, 0, 255], [0, 0, 255], { x0: 0, y0: 0, x1: 0, y1: 0 }, x => (x < 5 ? 0 : 255));
  const a = computeAlpha(buf, { kind: 'seed', x: .9, y: .5 }, { ...hard, tolerance: 0, contiguous: false });
  assert.equal(at(a, 10, 1, 5), 0);
});

test('el suavizado produce bordes intermedios y la tolerancia crece con el valor', () => {
  const buf = image(20, 20, [255, 255, 255], [0, 0, 0], { x0: 6, y0: 6, x1: 14, y1: 14 });
  const a = computeAlpha(buf, { kind: 'border' }, { tolerance: 20, feather: 60, contiguous: true });
  const edge = at(a, 20, 6, 10);
  assert.ok(edge > 0 && edge < 255, `borde suavizado, recibido ${edge}`);
  assert.ok(thresholdOf(80) > thresholdOf(10));
  assert.equal(featherRadius(0), 0);
  assert.ok(featherRadius(100) <= 16);
});
