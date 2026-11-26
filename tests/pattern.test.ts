import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_COMPOSITION, DEFAULT_PATTERN, MAX_PATTERN_ITEMS, generateComposition, generatePattern, rng } from '../src/utils/pattern.ts';

const W = 1080, H = 1920;
/** Distancia del punto (px,py) al centro de sticker más cercano, en píxeles. */
function gap(items: ReturnType<typeof generatePattern>, px: number, py: number) {
  return Math.min(...items.map(i => Math.hypot(i.x * W - px, i.y * H - py)));
}

test('misma semilla, mismo resultado; otra semilla, otro', () => {
  assert.deepEqual(generatePattern(DEFAULT_PATTERN, W, H, 3), generatePattern(DEFAULT_PATTERN, W, H, 3));
  assert.notDeepEqual(generatePattern(DEFAULT_PATTERN, W, H), generatePattern({ ...DEFAULT_PATTERN, seed: 2 }, W, H));
  const r = rng(5); for (let i = 0; i < 100; i++) { const v = r(); assert.ok(v >= 0 && v < 1); }
});

for (const layout of ['grid', 'scatter'] as const) {
  test(`el patrón ${layout} cubre todo el lienzo sin huecos grandes`, () => {
    const p = { ...DEFAULT_PATTERN, layout };
    const items = generatePattern(p, W, H, 2);
    const cell = p.size * W * (1 + p.spacing * 1.2);
    for (let y = 0; y <= H; y += 120) for (let x = 0; x <= W; x += 120) assert.ok(gap(items, x, y) < cell * 1.1, `hueco en ${x},${y}`);
    assert.ok(items.every(i => i.src === 0 || i.src === 1));
  });
}

test('nunca pasa del máximo de copias, aunque el sticker sea diminuto', () => {
  assert.ok(generatePattern({ ...DEFAULT_PATTERN, size: .01, spacing: 0 }, W, H).length <= MAX_PATTERN_ITEMS);
  assert.ok(generatePattern({ ...DEFAULT_PATTERN, layout: 'grid', size: .01, spacing: 0 }, W, H).length <= MAX_PATTERN_ITEMS);
});

test('la composición queda dentro del lienzo y usa cada sticker al menos una vez', () => {
  const items = generateComposition({ ...DEFAULT_COMPOSITION, count: 6 }, W, H, 3);
  assert.equal(items.length, 6);
  assert.deepEqual([...new Set(items.slice(0, 3).map(i => i.src))].sort(), [0, 1, 2]);
  for (const i of items) {
    const half = (i.size * W) / 2;
    assert.ok(i.x * W >= half - 1 && i.x * W <= W - half + 1 && i.y * H >= half - 1 && i.y * H <= H - half + 1);
  }
});
