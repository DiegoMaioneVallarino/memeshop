import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { useEditorStore } from '../src/store/useEditorStore.ts';

const st = () => useEditorStore.getState();
const photo = { uri: 'file:///a.jpg', width: 1000, height: 800, name: 'Foto' };
beforeEach(() => { st().resetDocument(); st().setPhoto(photo); });

test('añadir y deshacer/rehacer', () => {
  st().addText();
  assert.equal(st().document!.layers.length, 2);
  st().undo(); assert.equal(st().document!.layers.length, 1);
  st().redo(); assert.equal(st().document!.layers.length, 2);
});

test('una sesión de edición es UN paso de historial; cancelar la revierte', () => {
  const id = st().document!.layers[0].id, before = st().past.length;
  st().beginEdit();
  st().update(id, { opacity: .5 }); st().update(id, { x: 10 }); st().update(id, { rotation: 1 });
  st().finishEdit();
  assert.equal(st().past.length, before + 1);
  st().beginEdit(); st().update(id, { opacity: .1 }); st().cancelEdit();
  assert.equal(st().document!.layers[0].opacity, .5);
});

test('arrastrar un slider se agrupa en un solo paso', () => {
  const id = st().document!.layers[0].id, before = st().past.length;
  for (let i = 1; i <= 10; i++) st().update(id, { opacity: i / 10 });
  assert.equal(st().past.length, before + 1);
});

test('una capa bloqueada ignora cambios salvo visible/locked', () => {
  const id = st().document!.layers[0].id;
  st().update(id, { locked: true });
  st().update(id, { x: 999 });
  assert.notEqual(st().document!.layers[0].x, 999);
  st().update(id, { visible: false });
  assert.equal(st().document!.layers[0].visible, false);
});

test('la opacidad se limita a 0..1 y duplicar selecciona la copia', () => {
  const id = st().document!.layers[0].id;
  st().update(id, { opacity: 3 });
  assert.equal(st().document!.layers[0].opacity, 1);
  st().update(id, { locked: false });
  st().duplicate(id);
  const doc = st().document!;
  assert.equal(doc.layers.length, 2);
  assert.equal(doc.selectedId, doc.layers[1].id);
});

test('seleccionar no entra al historial', () => {
  st().addShape();
  const before = st().past.length;
  st().select(null); st().select(st().document!.layers[0].id);
  assert.equal(st().past.length, before);
});

test('reemplazar documento, rellenar un hueco y añadir capas son un paso de historial cada uno', () => {
  const before = st().past.length;
  st().replaceDocument({ width: 1080, height: 1920, layers: [
    { id: 's', type: 'shape', name: 'Hueco', color: '#ddd', placeholder: true, x: 0, y: 0, width: 1080, height: 960, rotation: 0, opacity: 1, visible: true },
  ], selectedId: 's', background: '#000000' });
  assert.equal(st().past.length, before + 1);
  st().replaceLayer('s', { id: 'img', type: 'image', name: 'Foto', uri: 'f.jpg', sourceWidth: 10, sourceHeight: 10, x: 0, y: 0, width: 1080, height: 960, rotation: 0, opacity: 1, visible: true });
  assert.equal(st().document!.layers[0].id, 'img'); assert.equal(st().document!.selectedId, 'img');
  st().appendLayers([{ id: 'x', type: 'shape', name: 'X', color: '#fff', x: 0, y: 0, width: 1, height: 1, rotation: 0, opacity: 1, visible: true }]);
  assert.equal(st().past.length, before + 3);
  st().undo(); st().undo();
  assert.equal(st().document!.layers[0].id, 's', 'deshacer devuelve el hueco');
  st().undo();
  assert.equal(st().document!.width, 1000, 'y luego el lienzo anterior');
});
