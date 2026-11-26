import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesQuery, parseTags } from '../src/utils/search.ts';

test('las etiquetas se normalizan y no se repiten', () => {
  assert.deepEqual(parseTags('Gato, Reacción  #risa, gato,,'), ['gato', 'reaccion', 'risa']);
});

test('la búsqueda ignora acentos y mayúsculas y usa nombre y etiquetas', () => {
  const s = { name: 'León sorprendido', tags: ['reaccion', 'wtf'] };
  assert.ok(matchesQuery(s, 'leon'));
  assert.ok(matchesQuery(s, 'REACCIÓN'));
  assert.ok(matchesQuery(s, 'leon wtf'));
  assert.ok(!matchesQuery(s, 'gato'));
  assert.ok(matchesQuery(s, '   '));
});
