import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALL_GLITCH_NAMES, FILTER_CATEGORIES, FILTER_DESCRIPTIONS, LOOKS, filterPatch } from '../src/tools/effects/presets.ts';

test('cada filtro y estilo tiene descripción y los estilos usan glitches que existen', () => {
  for (const name of FILTER_CATEGORIES.TODOS) assert.ok(FILTER_DESCRIPTIONS[name], `sin descripción: ${name}`);
  for (const l of LOOKS) if (l.glitch) assert.ok(ALL_GLITCH_NAMES.includes(l.glitch.name), l.name);
});

test('un estilo reemplaza ajustes y glitch; un filtro de color conserva los demás ajustes', () => {
  const layer = { adjustments: { brightness: 0, contrast: 0, saturation: 0, vignette: .5 }, glitchSettings: { mode: 1, intensity: 1, density: 1, seed: 7 } };
  const vapor = filterPatch('Vaporwave', layer) as { adjustments: { vignette?: number; tint?: number }; glitchSettings: { mode: number; seed: number } };
  assert.equal(vapor.adjustments.vignette, undefined);
  assert.ok((vapor.adjustments.tint ?? 0) > 0);
  assert.equal(vapor.glitchSettings.mode, ALL_GLITCH_NAMES.indexOf('RGB Split') + 1);
  assert.equal(vapor.glitchSettings.seed, 7, 'conserva la semilla');
  const noir = filterPatch('Cine negro', layer) as { glitchSettings?: unknown };
  assert.equal(noir.glitchSettings, undefined, 'un estilo sin glitch lo quita');
  const warm = filterPatch('Cálido', layer) as { adjustments: { vignette?: number } };
  assert.equal(warm.adjustments.vignette, .5);
  const none = filterPatch('Ninguno', layer) as { adjustments?: unknown; glitchSettings?: unknown };
  assert.equal(none.adjustments, undefined); assert.equal(none.glitchSettings, undefined);
});
