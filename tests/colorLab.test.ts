import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractPalette, colorLabUniforms, DEFAULT_GRADIENT, DEFAULT_PALETTE } from '../src/tools/colorLab/core.ts';
test('palette ignores transparent pixels and orders by frequency',()=>{assert.deepEqual(extractPalette([255,0,0,255,255,0,0,255,0,255,0,255,0,0,255,0],8),['#ff0000','#00ff00']);});
test('uniform arrays fixed size and disabled stages neutral',()=>{const u=colorLabUniforms({gradient:DEFAULT_GRADIENT,palette:DEFAULT_PALETTE},100,200);assert.equal(u.gradientColors.length,9);assert.equal(u.paletteColors.length,48);assert.equal(u.paletteCount,4);assert.equal(u.ditherStrength,0);});
