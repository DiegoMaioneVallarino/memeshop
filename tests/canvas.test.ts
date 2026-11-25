import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CANVAS_PRESETS, fitLayersTo, ratioLabel, resizeDocument } from '../src/utils/canvas.ts';
import { hasEffects, withoutEffects } from '../src/utils/compare.ts';
import type { EditorDocument, EditorLayer } from '../src/types/editor.ts';

const close = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);
const image: EditorLayer = { id: 'i', type: 'image', name: 'Foto', uri: 'a.jpg', sourceWidth: 1000, sourceHeight: 1000, x: 0, y: 0, width: 1000, height: 1000, rotation: 0, opacity: 1, visible: true,
  maskStrokes: [{ id: 'm', points: [{ x: 500, y: 500 }], radius: 40, opacity: 1, spread: 0, restore: false }] };
const textLayer: EditorLayer = { id: 't', type: 'text', name: 'T', text: 'Hola', color: '#fff', fontSize: 100, align: 'center', lineHeight: 1.2, strokeWidth: 6, x: 100, y: 50, width: 800, height: 120, rotation: 0, opacity: 1, visible: true };
const square: EditorDocument = { width: 1000, height: 1000, layers: [image, textLayer], selectedId: null };

test('ajustar a 9:16 mantiene todo visible y centrado', () => {
  const d = resizeDocument(square, 1080, 1920, 'fit');
  const img = d.layers[0];
  close(img.width, 1080); close(img.x, 0); close(img.y + img.height / 2, 960);
  assert.equal(d.width, 1080); assert.equal(d.height, 1920);
});

test('rellenar cubre el lienzo y escala textos, contornos y máscaras', () => {
  const d = resizeDocument(square, 1080, 1920, 'fill');
  const img = d.layers[0], t = d.layers[1];
  close(img.height, 1920); assert.ok(img.x < 0, 'se recorta por los lados');
  assert.equal(t.type, 'text');
  if (t.type === 'text') { close(t.fontSize, 192); close(t.strokeWidth!, 11.52); }
  close(img.maskStrokes![0].radius, 76.8); close(img.maskStrokes![0].points[0].x, 960);
});

test('volver al tamaño original desde la referencia deja el documento igual', () => {
  const back = resizeDocument(square, 1000, 1000, 'fit');
  close(back.layers[1].x, 100); close(back.layers[1].width, 800);
});

test('fitLayersTo coloca una plantilla 1:1 sobre una foto 16:9', () => {
  const [, t] = fitLayersTo(square.layers, square, { width: 1600, height: 900 });
  close(t.width, 800 * .9); close(t.x + t.width / 2, 800);
});

test('los tamaños de redes son válidos y la proporción es legible', () => {
  for (const p of CANVAS_PRESETS) assert.ok(p.width > 0 && p.height > 0 && p.width <= 4096 && p.height <= 4096, p.id);
  assert.equal(new Set(CANVAS_PRESETS.map(p => p.id)).size, CANVAS_PRESETS.length);
  assert.equal(ratioLabel(1080, 1350), '4:5'); assert.equal(ratioLabel(1080, 1920), '9:16');
});

test('comparar quita efectos de imagen pero conserva la composición', () => {
  assert.equal(withoutEffects(square), square, 'sin efectos no se crea un documento nuevo');
  assert.equal(hasEffects(square), false);
  const fx: EditorDocument = { ...square, layers: [{ ...image, adjustments: { brightness: .3, contrast: 0, saturation: 0 }, glitchSettings: { mode: 3, intensity: 1, density: .5, seed: 1 }, perspectiveX: .2 } as EditorLayer, textLayer] };
  assert.equal(hasEffects(fx), true);
  const orig = withoutEffects(fx), l = orig.layers[0];
  assert.ok(l.type === 'image' && !l.adjustments && !l.glitchSettings && !l.perspectiveX);
  assert.equal(l.maskStrokes, image.maskStrokes, 'la máscara se conserva');
  assert.equal(orig.layers[1], textLayer, 'las otras capas son las mismas');
});
