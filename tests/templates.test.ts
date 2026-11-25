import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILTIN_TEMPLATES } from '../src/templates/builtin.ts';
import { coverCrop, instantiateDocument, instantiateLayers, placeholderCount } from '../src/utils/templates.ts';

test('las plantillas incluidas son válidas', () => {
  assert.ok(BUILTIN_TEMPLATES.length >= 6);
  assert.equal(new Set(BUILTIN_TEMPLATES.map(t => t.id)).size, BUILTIN_TEMPLATES.length, 'ids únicos');
  for (const t of BUILTIN_TEMPLATES) {
    const d = t.document;
    assert.ok(d.layers.length > 0, t.name);
    assert.equal(new Set(d.layers.map(l => l.id)).size, d.layers.length, `${t.name}: ids de capa únicos`);
    for (const l of d.layers) {
      assert.ok(l.x >= -1 && l.y >= -1 && l.x + l.width <= d.width + 1 && l.y + l.height <= d.height + 1, `${t.name}: «${l.name}» dentro del lienzo`);
    }
    if (t.kind === 'layout') assert.ok(placeholderCount(d) > 0, `${t.name}: tiene huecos de foto`);
    if (t.kind === 'overlay') assert.ok(d.layers.every(l => l.type === 'text'), `${t.name}: solo textos`);
  }
});

test('usar una plantilla dos veces no repite ids y selecciona el primer hueco', () => {
  const t = BUILTIN_TEMPLATES.find(x => x.kind === 'layout')!;
  const a = instantiateDocument(t.document), b = instantiateDocument(t.document);
  const ids = new Set([...a.layers, ...b.layers].map(l => l.id));
  assert.equal(ids.size, a.layers.length * 2);
  const sel = a.layers.find(l => l.id === a.selectedId);
  assert.ok(sel && sel.type === 'shape' && sel.placeholder);
  assert.notEqual(a.layers[0].id, t.document.layers[0].id, 'la plantilla original no cambia');
});

test('los grupos se renuevan juntos', () => {
  const layers = instantiateLayers([
    { id: 'a', type: 'shape', name: 'a', color: '#000', x: 0, y: 0, width: 1, height: 1, rotation: 0, opacity: 1, visible: true, groupId: 'g1' },
    { id: 'b', type: 'shape', name: 'b', color: '#000', x: 0, y: 0, width: 1, height: 1, rotation: 0, opacity: 1, visible: true, groupId: 'g1' },
  ]);
  assert.equal(layers[0].groupId, layers[1].groupId);
  assert.notEqual(layers[0].groupId, 'g1');
});

test('el recorte para un hueco lo cubre sin deformar', () => {
  const wide = coverCrop(4000, 2000, 500, 500);
  assert.deepEqual(wide, { originX: 1000, originY: 0, width: 2000, height: 2000 });
  const tall = coverCrop(1000, 3000, 1080, 540);
  assert.equal(tall.width, 1000); assert.equal(tall.height, 500); assert.equal(tall.originY, 1250);
});
