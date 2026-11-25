import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cropRect, croppedGeometry, initialCrop, isCropNoop, pixelRect } from '../src/utils/crop.ts';
import { fitWithin, MAX_WORK_SIDE } from '../src/utils/limits.ts';

const close = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test('recorte libre usa los márgenes y se intercambian al voltear', () => {
  const r = cropRect({ ...initialCrop, left: 10, right: 20, top: 5, bottom: 15 }, 1000, 800);
  close(r.x, .1); close(r.w, .7); close(r.y, .05); close(r.h, .8);
  const flipped = cropRect({ ...initialCrop, left: 10, right: 20 }, 1000, 800, true);
  close(flipped.x, .2);
});

test('una proporción fija cabe dentro de la imagen', () => {
  const r = cropRect({ ...initialCrop, ratio: 'Cuadrado' }, 1000, 500);
  close(r.w * 1000, r.h * 500); // cuadrado en píxeles
  assert.ok(r.w <= 1 && r.h <= 1);
  close(r.x, .25); // centrado
});

test('sin cambios es un no-op y pixelRect no se sale de la imagen', () => {
  assert.ok(isCropNoop(initialCrop, cropRect(initialCrop, 100, 100)));
  const { px } = pixelRect({ x: .95, y: .95, w: .2, h: .2 }, 100, 100);
  assert.ok(px.x + px.w <= 100 && px.y + px.h <= 100);
});

test('el contenido recortado se queda donde estaba', () => {
  const layer = { x: 0, y: 0, width: 100, height: 100, rotation: 0, flipX: false, maskStrokes: [{ id: 'm', points: [{ x: 60, y: 60 }], radius: 1, opacity: 1, spread: 0, restore: false }] };
  const g = croppedGeometry(layer, { x: .5, y: .5, w: .5, h: .5 }, 0);
  close(g.x, 50); close(g.y, 50); close(g.width, 50);
  close(g.maskStrokes![0].points[0].x, 10, 1e-9);
});

test('fitWithin respeta el límite y la proporción', () => {
  const big = fitWithin(8000, 6000);
  assert.equal(big.width, MAX_WORK_SIDE); assert.equal(big.height, 3072); assert.ok(big.scaled);
  const small = fitWithin(1200, 900);
  assert.deepEqual(small, { width: 1200, height: 900, scaled: false });
});
