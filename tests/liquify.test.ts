import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyBrush, createField, cropField, fieldFrom, fieldToRGBA, isFieldEmpty, sampleField, serializeField, LIQUIFY_RANGE } from '../src/utils/liquify.ts';

const W = 1000, H = 800;

test('la malla respeta la proporción de la capa', () => {
  const f = createField(W, H);
  assert.equal(f.cols, 96); assert.equal(f.rows, 77);
  assert.ok(isFieldEmpty(f));
});

test('empujar hacia la derecha hace leer desde la izquierda en el centro y nada fuera del pincel', () => {
  const f = createField(W, H);
  assert.ok(applyBrush(f, W, H, { mode: 'push', x: 500, y: 400, radius: 100, strength: 1, dx: 40, dy: 0 }));
  const [cx] = sampleField(f, .5, .5);
  assert.ok(cx < 0, `en el centro se lee desde la izquierda (${cx})`);
  assert.ok(Math.abs(cx * W + 40) < 4, `≈ 40 px (${cx * W})`);
  const [fx, fy] = sampleField(f, .1, .1);
  assert.equal(fx, 0); assert.equal(fy, 0);
});

test('dos empujes seguidos se encadenan (no se pierden)', () => {
  const f = createField(W, H);
  applyBrush(f, W, H, { mode: 'push', x: 500, y: 400, radius: 150, strength: 1, dx: 20, dy: 0 });
  applyBrush(f, W, H, { mode: 'push', x: 520, y: 400, radius: 150, strength: 1, dx: 20, dy: 0 });
  const [cx] = sampleField(f, .52, .5);
  assert.ok(cx * W < -30, `acumula ≈ 40 px (${cx * W})`);
});

test('girar en un sentido y en el otro son opuestos; ampliar y reducir también', () => {
  const a = createField(W, H), b = createField(W, H);
  applyBrush(a, W, H, { mode: 'twirlCW', x: 500, y: 400, radius: 200, strength: 1 });
  applyBrush(b, W, H, { mode: 'twirlCCW', x: 500, y: 400, radius: 200, strength: 1 });
  const [ay] = sampleField(a, .6, .5).slice(1), [by] = sampleField(b, .6, .5).slice(1);
  assert.ok(ay * by < 0, 'sentidos opuestos');
  const big = createField(W, H), small = createField(W, H);
  applyBrush(big, W, H, { mode: 'bloat', x: 500, y: 400, radius: 200, strength: 1 });
  applyBrush(small, W, H, { mode: 'pinch', x: 500, y: 400, radius: 200, strength: 1 });
  const [bx] = sampleField(big, .58, .5), [sx] = sampleField(small, .58, .5);
  assert.ok(bx < 0 && sx > 0, 'ampliar lee hacia el centro; reducir, hacia fuera');
});

test('restaurar devuelve el campo hacia cero', () => {
  const f = createField(W, H);
  applyBrush(f, W, H, { mode: 'push', x: 500, y: 400, radius: 150, strength: 1, dx: 60, dy: 30 });
  const before = Math.abs(sampleField(f, .5, .5)[0]);
  for (let i = 0; i < 30; i++) applyBrush(f, W, H, { mode: 'restore', x: 500, y: 400, radius: 300, strength: 1 });
  assert.ok(Math.abs(sampleField(f, .5, .5)[0]) < before * .01);
});

test('guardar, cargar y codificar en textura', () => {
  const f = createField(W, H);
  assert.equal(serializeField(f), undefined, 'un campo vacío no se guarda');
  applyBrush(f, W, H, { mode: 'push', x: 500, y: 400, radius: 150, strength: 1, dx: 50, dy: 0 });
  const saved = serializeField(f)!;
  const back = fieldFrom(saved, W, H);
  assert.ok(Math.abs(sampleField(back, .5, .5)[0] - sampleField(f, .5, .5)[0]) < 1e-3);
  assert.equal(fieldFrom({ cols: 3, rows: 3, data: [1] }, W, H).cols, 96, 'datos dañados → campo nuevo');
  const rgba = fieldToRGBA({ cols: 2, rows: 1, data: [0, 0, LIQUIFY_RANGE, -LIQUIFY_RANGE] });
  assert.deepEqual([...rgba], [128, 128, 128, 255, 255, 1, 128, 255]);
});

test('recortar la capa conserva la deformación en su sitio', () => {
  const f = createField(W, H);
  applyBrush(f, W, H, { mode: 'push', x: 750, y: 600, radius: 120, strength: 1, dx: 40, dy: 0 });
  const saved = serializeField(f)!;
  const frac = { x: .5, y: .5, w: .5, h: .5 };
  const cropped = cropField(saved, frac, W, H)!;
  const before = sampleField(fieldFrom(saved, W, H), .75, .75)[0] * W;          // px de la capa original
  const after = sampleField(fieldFrom(cropped, W * .5, H * .5), .5, .5)[0] * W * .5; // px de la capa recortada
  assert.ok(Math.abs(before - after) < 1, `${before} ≈ ${after}`);
});
