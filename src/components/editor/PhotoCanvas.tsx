import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, Text, Keyboard } from 'react-native';
import { AlphaType, ColorType, Canvas, Group, Image as SkiaImage, Rect, RoundedRect, Oval, Path, DashPathEffect, Circle, Paint, useImage, Mask, Skia, BlurMask, drawAsImage, Shader, ImageShader, Paragraph, TextAlign, PaintStyle, StrokeJoin, ImageFormat } from '@shopify/react-native-skia';
import { useSharedValue, useDerivedValue, runOnJS, withTiming, Easing } from 'react-native-reanimated';
import { ensureFonts, fontFamiliesFor, getFontProvider, getFontVersion, subscribeFonts } from '../../services/fonts';
import type { SkImage, SkPaint, SkTextStyle } from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { applyBrush, fieldFrom, fieldToRGBA, serializeField, LIQUIFY_RANGE, type LiquifyMode } from '../../utils/liquify';
import type { EditorDocument, EditorLayer, ImageLayer, PaintLayer, PhotoAdjustments, ShapeLayer, BrushStroke, StrokePoint, MaskStroke, TextLayer, EffectStage } from '../../types/editor';
import { useEditorStore } from '../../store/useEditorStore';
import { getMemMask, isMemMask, loadMaskImage } from '../../services/maskStore';

export type PhotoCanvasHandle = { snapshotBase64: () => Promise<string | null>; sampleColors: () => Promise<string[]>; reset: () => void };
export type InteractionMode = 'layer' | 'view' | 'brush' | 'mask' | 'eyedropper' | 'wand' | 'warp' | 'liquify';
export type LiquifyOptions = { mode: LiquifyMode; size: number; strength: number };
/** Zona reservada arriba y abajo: el documento se encaja SIEMPRE en el mismo rectángulo (la cámara nunca salta). */
export type CanvasFrame = { top: number; bottom: number };
export type BrushOptions = { color: string; size: number; eraser: boolean; opacity?: number; hardness?: number; spread?: number; restore?: boolean };
type Viewport = { zoom: number; x: number; y: number; rotation: number };
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));

// This stage is composable: it samples the previous shader instead of the original image.
// Trabaja sin premultiplicar (las imágenes con transparencia no se oscurecen en los bordes).
const adjustmentEffect = Skia.RuntimeEffect.Make(`
 uniform shader source;
 uniform float2 dimensions;
 uniform float brightness; uniform float contrast; uniform float saturation;
 uniform float exposure; uniform float highlights; uniform float shadows;
 uniform float vibrance; uniform float temperature; uniform float tint;
 uniform float clarity; uniform float sharpness; uniform float vignette; uniform float grain; uniform float fade;
 float3 straight(half4 c) { return c.a > 0.0 ? float3(c.rgb) / float(c.a) : float3(0.0); }
 float luma(float3 c) { return dot(c, float3(0.2126, 0.7152, 0.0722)); }
 half4 main(float2 p) {
   half4 c0 = source.eval(p);
   float a = float(c0.a);
   float3 rgb = straight(c0);
   float side = max(dimensions.x, dimensions.y);
   if (sharpness != 0.0) {
     float r = side * 0.0015;
     float3 b = (straight(source.eval(p + float2(r, 0.0))) + straight(source.eval(p - float2(r, 0.0)))
               + straight(source.eval(p + float2(0.0, r))) + straight(source.eval(p - float2(0.0, r)))) * 0.25;
     rgb += (rgb - b) * sharpness * 1.6;
   }
   if (clarity != 0.0) {
     float r = side * 0.012;
     float3 b = float3(0.0);
     for (int i = 0; i < 8; i++) {
       float t = float(i) * 0.785398;
       b += straight(source.eval(p + float2(cos(t), sin(t)) * r));
     }
     b *= 0.125;
     float l = luma(rgb);
     float mid = 1.0 - abs(l - 0.5) * 2.0;           // actúa sobre todo en los tonos medios
     rgb += (rgb - b) * clarity * 0.9 * (0.35 + 0.65 * mid);
   }
   rgb *= exp2(exposure * 1.5);
   rgb.r += temperature * 0.09; rgb.b -= temperature * 0.09;
   rgb.g -= tint * 0.07; rgb.r += tint * 0.03; rgb.b += tint * 0.03;
   float l = luma(rgb);
   rgb += highlights * 0.35 * smoothstep(0.45, 1.0, l);
   rgb += shadows * 0.35 * (1.0 - smoothstep(0.0, 0.55, l));
   rgb = (rgb - 0.5) * (1.0 + contrast) + 0.5 + brightness;
   float g = luma(rgb);
   rgb = mix(float3(g), rgb, 1.0 + saturation);
   float sat = max(rgb.r, max(rgb.g, rgb.b)) - min(rgb.r, min(rgb.g, rgb.b));
   rgb = mix(float3(luma(rgb)), rgb, 1.0 + vibrance * (1.0 - clamp(sat, 0.0, 1.0)));
   rgb = rgb * (1.0 - fade * 0.22) + fade * 0.11;
   float d = distance(p / dimensions, float2(0.5)) * 1.41421;
   rgb *= 1.0 - vignette * 0.75 * smoothstep(0.25, 1.0, d);
   float n = fract(sin(dot(floor(p), float2(12.9898, 78.233))) * 43758.5453) - 0.5;
   rgb += n * grain * 0.18;
   rgb = clamp(rgb, 0.0, 1.0);
   return half4(half3(rgb * a), half(a));
 }
`);
const ADJUSTMENT_KEYS = ['brightness', 'contrast', 'saturation', 'exposure', 'highlights', 'shadows', 'vibrance', 'temperature', 'tint', 'clarity', 'sharpness', 'vignette', 'grain', 'fade'] as const;
const adjustmentUniforms = (adj: PhotoAdjustments, w: number, h: number) => {
  const u: Record<string, number | number[]> = { dimensions: [w, h] };
  for (const k of ADJUSTMENT_KEYS) u[k] = adj[k] ?? 0;
  return u;
};
const hasAnyAdjustment = (adj?: PhotoAdjustments) => !!adj && ADJUSTMENT_KEYS.some(k => Math.abs(adj[k] ?? 0) > .0001);

// Licuar: lee cada píxel desde p + desplazamiento, con el campo guardado en una textura pequeña (ver utils/liquify.ts).
const liquifyEffect = Skia.RuntimeEffect.Make(`
 uniform shader image;
 uniform shader disp;
 uniform float2 dimensions;
 uniform float2 grid;
 uniform float range;
 half4 main(float2 p) {
   float2 uv = p / dimensions;
   half4 d = disp.eval(uv * (grid - 1.0) + 0.5);
   float2 off = (float2(float(d.r), float(d.g)) * 255.0 - 128.0) / 127.0 * range;
   return image.eval((uv + off) * dimensions);
 }
`);
/** Textura del campo: se crea una vez por campo guardado (el documento es inmutable, la referencia sirve de clave). */
const liquifyTextures = new WeakMap<object, SkImage>();
export function liquifyTexture(field: { cols: number; rows: number; data: ArrayLike<number> }, cache = true): SkImage | null {
  const cached = cache ? liquifyTextures.get(field as object) : undefined;
  if (cached) return cached;
  const img = Skia.Image.MakeImage({ width: field.cols, height: field.rows, alphaType: AlphaType.Premul, colorType: ColorType.RGBA_8888 },
    Skia.Data.fromBytes(fieldToRGBA(field)), field.cols * 4);
  if (img && cache) liquifyTextures.set(field as object, img);
  return img;
}
type LiquifyPreview = { layerId: string; texture: SkImage; cols: number; rows: number };
/** Envuelve un shader con el desplazamiento de licuar. */
function withLiquify(child: React.ReactNode, texture: SkImage, cols: number, rows: number, w: number, h: number) {
  return <Shader source={liquifyEffect!} uniforms={{ dimensions: [w, h], grid: [cols, rows], range: LIQUIFY_RANGE }}>
    {child}
    <ImageShader image={texture} x={0} y={0} width={cols} height={rows} fit="fill" tx="clamp" ty="clamp" fm="linear" />
  </Shader>;
}

// GPU effects: SkSL samples the source texture directly. No offscreen Paint/ColorMatrix stack.
const glitchEffect = Skia.RuntimeEffect.Make(`
 uniform shader source;
 uniform float2 dimensions;
 uniform float mode;
 uniform float intensity;
 uniform float density;
 uniform float seed;
 float hash(float n) { return fract(sin(n * 127.1 + seed * 17.17) * 43758.5453); }
 float2 bounded(float2 p) { return clamp(p, float2(0.5), dimensions - float2(0.5)); }
 half4 sampleAt(float2 p) { return source.eval(bounded(p)); }
 float luminance(half4 c) { return dot(float3(c.rgb), float3(0.2126, 0.7152, 0.0722)); }
 half4 main(float2 xy) {
   float strength = intensity;
   float amount = max(0.01, density);
   float2 uv = xy;
   float band = floor(xy.y / max(2.0, 28.0 - amount * 22.0));
   float rnd = hash(band);
   half4 original = sampleAt(xy);
   if (mode < 0.5) return original;
   // 1: slice repeat: duplicate source rows and displace torn strips.
   if (mode < 1.5) {
     float period = max(4.0, 48.0 - amount * 37.0);
     float stripe = floor(xy.y / period);
     float active = step(1.0 - amount * 0.8, hash(stripe));
     uv.y = mix(xy.y, stripe * period + mod(xy.y, max(2.0, period * 0.28)), active);
     uv.x += active * (hash(stripe + 23.0) - 0.5) * 110.0 * strength;
   }
   // 2: displacement by stable rectangular sectors.
   else if (mode < 2.5) {
     float2 cell = floor(xy / max(8.0, 90.0 - amount * 74.0));
     float n = hash(cell.x * 37.0 + cell.y * 113.0);
     if (n < amount) uv += (float2(hash(n * 39.0), hash(n * 97.0)) - 0.5) * 100.0 * strength;
   }
   // 3: independent channel displacement (regional RGB split).
   else if (mode < 3.5) {
     float region = step(1.0 - amount, rnd);
     float offset = (2.0 + strength * 24.0) * region;
     half4 red = sampleAt(xy + float2(offset, -offset * 0.2));
     half4 blue = sampleAt(xy - float2(offset, -offset * 0.2));
     return half4(red.r, original.g, blue.b, original.a);
   }
   // 4: bounded GPU neighborhood brightness sort approximation (7 samples).
   else if (mode < 4.5) {
     float lengthPx = 2.0 + strength * 28.0;
     half4 candidate = original;
     float best = luminance(original);
     for (int i = 1; i < 8; i++) {
       half4 c = sampleAt(xy + float2(float(i) * lengthPx / 7.0, 0.0));
       float l = luminance(c);
       if (l > best) { best = l; candidate = c; }
     }
     return mix(original, candidate, half(amount));
   }
   // 5: analog VHS tracking, wave jitter, dropout scanlines.
   else if (mode < 5.5) {
     float wave = sin(xy.y * 0.11 + seed) * 3.0 + sin(xy.y * 0.033 + seed * 0.7) * 7.0;
     uv.x += wave * strength + step(1.0 - amount * 0.35, rnd) * (rnd - 0.5) * 75.0 * strength;
     half4 c = sampleAt(uv);
     float scan = 1.0 - 0.17 * strength * step(0.65, fract(xy.y * 0.5));
     float grain = (hash(floor(xy.x * 0.8) + floor(xy.y) * 31.0) - 0.5) * 0.13 * strength;
     return half4(clamp(float3(c.rgb) * scan + grain, float3(0), float3(1)), c.a);
   }
   // 6: simulated compression blocks and blocky color quantization.
   else if (mode < 6.5) {
     float blockSize = 3.0 + amount * 28.0;
     float2 block = floor(xy / blockSize);
     float2 offset = (float2(hash(block.x + block.y * 31.0), hash(block.x * 19.0 + block.y)) - 0.5) * strength * 14.0;
     half4 c = sampleAt((block + 0.5) * blockSize + offset);
     float levels = max(2.0, 32.0 - strength * 26.0);
     return half4(floor(float3(c.rgb) * levels + 0.5) / levels, c.a);
   }
   // 7: static datamosh-like directional smear, not real video motion vectors.
   else if (mode < 7.5) {
     float blockSize = max(6.0, 48.0 - amount * 35.0);
     float2 cell = floor(xy / blockSize);
     float n = hash(cell.y * 41.0 + cell.x * 17.0);
     float2 offset = float2((n - 0.5) * 150.0 * strength, (hash(n * 37.0) - 0.5) * 35.0 * strength);
     half4 c = sampleAt(xy - offset);
     return mix(original, c, half(step(1.0 - amount, n) * 0.85));
   }
   // 8: dropout lines and replacement blocks.
   else if (mode < 8.5) {
     float cell = floor(xy.y / max(2.0, 20.0 - amount * 17.0));
     float n = hash(cell);
     if (n < amount * strength * 0.7) {
       if (hash(cell + 41.0) > 0.5) return half4(0.0, 0.0, 0.0, original.a);
       uv.y = max(0.0, xy.y - 20.0 - hash(cell + 9.0) * 90.0);
     }
   }
   // 9: bit depth reduction with stable ordered-like noise.
   else if (mode < 9.5) {
     float levels = max(2.0, 64.0 - strength * 60.0);
     float dither = (hash(floor(xy.x) + floor(xy.y) * 8192.0) - 0.5) * amount / levels;
     return half4(clamp(floor((float3(original.rgb) + dither) * levels + 0.5) / levels, float3(0), float3(1)), original.a);
   }
   // 10: interlaced field offset.
   else if (mode < 10.5) {
     float line = floor(xy.y / max(1.0, 5.0 - amount * 4.0));
     uv.x += (mod(line, 2.0) * 2.0 - 1.0) * strength * 30.0;
   }
   // 11: recursive tear; repeating and decaying nested source strips.
   else if (mode < 11.5) {
     float size = max(3.0, 44.0 - 34.0 * amount);
     float bandId = floor(xy.y / size);
     float active = step(1.0 - amount, hash(bandId));
     float repeatY = floor(mod(xy.y, size) / max(1.0, size / (2.0 + strength * 5.0)));
     uv.y = mix(xy.y, bandId * size + mod(repeatY * 2.0, size), active);
     uv.x += active * (hash(bandId + repeatY * 13.0) - 0.5) * strength * 85.0 / (1.0 + repeatY * 0.2);
   }
   // 12: tile scramble, deterministic source tile exchange.
   else if (mode < 12.5) {
     float tileSize = max(7.0, 96.0 - amount * 79.0);
     float2 tile = floor(xy / tileSize);
     float2 local = mod(xy, tileSize);
     float n = hash(tile.x * 17.0 + tile.y * 79.0);
     if (n < amount) {
       float2 offset = floor((float2(hash(n * 31.0), hash(n * 83.0)) - 0.5) * (2.0 + strength * 8.0));
       float2 swapped = tile + offset;
       uv = mod(swapped * tileSize + local + dimensions, dimensions);
     }
   }
   // 13: pixel melt, threshold-triggered vertical streaks.
   else if (mode < 13.5) {
     float col = floor(xy.x / max(1.0, 12.0 - amount * 10.0));
     float n = hash(col);
     if (n < amount && luminance(original) > 0.18) {
       float distance = 10.0 + strength * 180.0 * hash(col + 4.0);
       uv.y = xy.y - mod(xy.y + hash(col + 6.0) * distance, max(2.0, distance));
     }
   }
   // 14: echo trails; fixed-number layered source samples.
   else if (mode < 14.5) {
     half4 accum = original;
     float total = 1.0;
     for (int i = 1; i < 5; i++) {
       float t = float(i);
       float weight = amount * 0.55 / t;
       accum += sampleAt(xy - float2(t * strength * 14.0, t * strength * 5.0)) * half(weight);
       total += weight;
     }
     return accum / half(total);
   }
   // 15: memory corruption, repeated fragments from unrelated offsets.
   else if (mode < 15.5) {
     float cellH = max(2.0, 25.0 - amount * 21.0);
     float2 cell = floor(xy / float2(35.0 + strength * 35.0, cellH));
     float n = hash(cell.x * 91.0 + cell.y * 29.0);
     if (n < amount) uv = mod(xy + float2((hash(n * 71.0) - 0.5) * dimensions.x * strength, (hash(n * 43.0) - 0.5) * 90.0 * strength) + dimensions, dimensions);
   }
   // 16: bit flip, quantized 8-bit channel XOR approximation.
   else if (mode < 16.5) {
     float2 cell = floor(xy / max(2.0, 42.0 - 37.0 * amount));
     float n = hash(cell.x * 37.0 + cell.y * 101.0);
     if (n < amount) {
       float3 c = floor(float3(original.rgb) * 255.0 + 0.5);
       float bitValue = exp2(floor(clamp(strength, 0.0, 1.99) * 3.5));
       float3 bitOn = mod(floor(c / bitValue), 2.0);
       c += (1.0 - 2.0 * bitOn) * bitValue;
       return half4(half3(clamp(c / 255.0, 0.0, 1.0)), original.a);
     }
   }
   // 17: wrong stride, row memory pitch mismatch.
   else if (mode < 17.5) {
     float row = floor(xy.y / max(1.0, 6.0 - 5.0 * amount));
     uv.x = mod(xy.x + row * strength * 6.0 + dimensions.x * 8.0, dimensions.x);
   }
   // 18: channel corruption, independent channel permutation and inversion.
   else if (mode < 18.5) {
     float2 cell = floor(xy / max(8.0, 75.0 - 65.0 * amount));
     float n = hash(cell.x * 53.0 + cell.y * 19.0);
     float3 rgb = float3(original.rgb);
     float3 swapped = n < 0.33 ? rgb.gbr : (n < 0.66 ? rgb.brg : 1.0 - rgb.bgr);
     return half4(half3(mix(rgb, swapped, clamp(strength * amount, 0.0, 1.0))), original.a);
   }
   // 19: sync loss, displaced and rolling scan bands.
   else if (mode < 19.5) {
     float bandSize = max(4.0, 70.0 - 62.0 * amount);
     float row = floor(xy.y / bandSize);
     float n = hash(row);
     uv.x = mod(xy.x + (n - 0.5) * 190.0 * strength * step(1.0 - amount, n) + dimensions.x * 4.0, dimensions.x);
     uv.y = mod(xy.y + strength * 16.0 * sin(xy.y * 0.025 + seed) + dimensions.y * 4.0, dimensions.y);
   }
   // 20: chroma bleed, smearing chrominance while retaining luminance.
   else if (mode < 20.5) {
     float3 chroma = float3(0.0);
     for (int i = 0; i < 5; i++) {
       float t = float(i) / 4.0;
       chroma += float3(sampleAt(xy - float2(t * strength * 35.0, 0.0)).rgb) * 0.2;
     }
     float luma = luminance(original);
     float chromaLuma = dot(chroma, float3(0.2126,0.7152,0.0722));
     return half4(half3(clamp(mix(float3(original.rgb), chroma + (luma - chromaLuma), amount), 0.0, 1.0)), original.a);
   }
   // 21: LCD damage, stuck subpixel columns and dead rows.
   else if (mode < 21.5) {
     float col = floor(xy.x / max(1.0, 6.0 - 5.0 * amount));
     float n = hash(col);
     if (n < amount * 0.5) {
       float3 mask = float3(step(0.5, hash(col + 1.0)), step(0.5, hash(col + 2.0)), step(0.5, hash(col + 3.0)));
       return half4(half3(mix(float3(original.rgb), mask, clamp(strength, 0.0, 1.0))), original.a);
     }
   }
   // 22: moire interference, crossed periodic grids.
   else if (mode < 22.5) {
     float freq = 0.14 + amount * 1.3;
     float gridA = sin(xy.x * freq + xy.y * 0.13);
     float gridB = sin(xy.y * freq * 1.06 - xy.x * 0.08);
     float interference = gridA * gridB * strength * 0.28;
     return half4(half3(clamp(float3(original.rgb) + interference, 0.0, 1.0)), original.a);
   }
   // 23: Voronoi shatter, nearest jittered site and per-cell translation.
   else if (mode < 23.5) {
     float scale = max(12.0, 120.0 - 105.0 * amount);
     float2 base = floor(xy / scale);
     float best = 1000.0;
     float2 winning = base;
     for (int yy = -1; yy <= 1; yy++) {
       for (int xx = -1; xx <= 1; xx++) {
         float2 cell = base + float2(float(xx),float(yy));
         float n = hash(cell.x * 47.0 + cell.y * 71.0);
         float2 site = cell + float2(hash(n * 17.0), hash(n * 39.0));
         float d = length(xy / scale - site);
         if (d < best) { best = d; winning = cell; }
       }
     }
     float n = hash(winning.x * 47.0 + winning.y * 71.0);
     uv += (float2(hash(n * 11.0), hash(n * 23.0)) - 0.5) * strength * scale * 1.4;
   }
   // 24: recursive feedback, bounded nested scale-and-rotate echoes.
   else if (mode < 24.5) {
     half4 accum = original;
     float total = 1.0;
     float2 center = dimensions * 0.5;
     for (int i = 1; i <= 4; i++) {
       float t = float(i);
       float angle = t * strength * 0.09;
       float2 offset = xy - center;
       float2 rotated = float2(offset.x * cos(angle) - offset.y * sin(angle), offset.x * sin(angle) + offset.y * cos(angle));
       float2 point = center + rotated / (1.0 + t * strength * 0.13);
       float weight = amount * 0.7 / t;
       accum += sampleAt(point) * half(weight);
       total += weight;
     }
     return accum / half(total);
   }
   // 25: noise-field warp, smooth deterministic vector noise.
   else if (mode < 25.5) {
     float scale = 0.008 + amount * 0.06;
     float2 cell = floor(xy * scale);
     float2 f = fract(xy * scale);
     f = f * f * (3.0 - 2.0 * f);
     float a = hash(cell.x * 31.0 + cell.y * 79.0);
     float b = hash((cell.x + 1.0) * 31.0 + cell.y * 79.0);
     float c = hash(cell.x * 31.0 + (cell.y + 1.0) * 79.0);
     float d = hash((cell.x + 1.0) * 31.0 + (cell.y + 1.0) * 79.0);
     float n = mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
     float n2 = hash(floor(xy.y * scale) * 43.0 + floor(xy.x * scale) * 7.0);
     uv += (float2(n,n2) - 0.5) * strength * 100.0;
   }
   return sampleAt(uv);
 }
`);
// Reemplazo cromático suave, calculado en GPU. Conserva luminancia y alfa.
// GPU inverse texture mapping: document geometry and layer handles never change.
const warpEffect = Skia.RuntimeEffect.Make(`
  uniform shader image;
  uniform float2 dimensions;
  uniform float2 center;
  uniform float radius;
  uniform float strength;
  uniform float frequency;
  uniform float mode;
  uniform float4 touches[16];
  uniform float touchCount;
  uniform float4 frozen[8];
  uniform float freezeCount;
  half4 main(float2 xy) {
    float2 uv = xy / max(dimensions, float2(1.0));
    float2 delta = uv - center;
    float aspect = dimensions.x / max(dimensions.y, 1.0);
    float2 metric = float2(delta.x * aspect, delta.y);
    float dist = length(metric);
    float r = max(radius, 0.001);
    float falloff = pow(max(0.0, 1.0 - dist / r), 2.0);
    float2 sampleUV = uv;
    float frozenMask = 0.0;
    for (int k=0; k<8; k++) {
      if (float(k) >= freezeCount) break;
      float4 f = frozen[k];
      float2 diff = (uv-f.xy)*float2(aspect,1.0);
      frozenMask = max(frozenMask, 1.0-smoothstep(f.z*0.85, f.z, length(diff)));
    }
    if (mode < 0.5) { // Liquify: directional radial push
      if (touchCount > 0.5) {
        // Each touch is a brush segment: xy and displacement in normalized image space.
        for (int i=0; i<16; i++) {
          if (float(i) >= touchCount) break;
          float4 touch = touches[i];
          float2 dd = (uv-touch.xy)*float2(aspect,1.0);
          float weight = pow(max(0.0,1.0-length(dd)/r),2.0);
          sampleUV -= touch.zw * weight * abs(strength) * (1.0-frozenMask);
        }
      } else {
        sampleUV -= float2(strength * 0.24 * falloff / max(aspect, 0.01), 0.0);
      }
    } else if (mode < 1.5) { // Twirl
      float angle = -strength * 5.0 * falloff;
      float sn = sin(angle), cs = cos(angle);
      float2 turned = float2(metric.x * cs - metric.y * sn, metric.x * sn + metric.y * cs);
      sampleUV = center + float2(turned.x / max(aspect, 0.01), turned.y);
    } else if (mode < 2.5) { // Bulge / pinch
      float factor = 1.0 - strength * 0.85 * falloff;
      sampleUV = center + delta * max(factor, 0.08);
    } else if (mode < 3.5) { // Ripple waves
      float wave = sin(dist * frequency * 55.0) * strength * 0.045 * falloff;
      sampleUV += normalize(delta + float2(0.000001)) * wave;
    } else { // Parametric mesh: continuous deformation in both axes
      float wx = sin(uv.y * frequency * 12.56637) * sin(uv.x * 3.14159);
      float wy = sin(uv.x * frequency * 12.56637) * sin(uv.y * 3.14159);
      sampleUV += float2(wx, wy) * strength * 0.12 * falloff;
    }
    // Transparent outside source instead of repeating edge pixels.
    if (sampleUV.x < 0.0 || sampleUV.y < 0.0 || sampleUV.x > 1.0 || sampleUV.y > 1.0) return half4(0.0);
    return image.eval(sampleUV * dimensions);
  }
`);
const replaceColorEffect = Skia.RuntimeEffect.Make(`
 uniform shader source;
 uniform float3 sourceColor;
 uniform float3 targetColor;
 uniform float tolerance;
 uniform float softness;
 uniform float strength;
 half4 main(float2 xy) {
   half4 c = source.eval(xy);
   float distance = length(float3(c.rgb) - sourceColor) / 1.7320508;
   float edge = max(0.001, softness * 0.3);
   float match = 1.0 - smoothstep(max(0.0,tolerance-edge), tolerance+edge, distance);
   float lum = dot(float3(c.rgb),float3(0.2126,0.7152,0.0722));
   float targetLum = max(0.04,dot(targetColor,float3(0.2126,0.7152,0.0722)));
   float3 replacement = clamp(targetColor * (lum / targetLum),float3(0.0),float3(1.0));
   return half4(mix(float3(c.rgb),replacement,match*strength),c.a);
 }
`);
function rgb(hex:string):number[] {
 const clean=hex.replace('#','');
 return [0,2,4].map(i=>parseInt(clean.slice(i,i+2),16)/255);
}
// Global color-key preview runs in the GPU fragment shader. Contiguous flood-fill
// still requires CPU graph traversal; it cannot be emulated by a per-pixel shader.
const wandEffect = Skia.RuntimeEffect.Make(`
 uniform shader source;
 uniform float2 dimensions;
 uniform float2 seed;
 uniform float tolerance;
 uniform float feather;
 half4 main(float2 xy) {
   half4 color = source.eval(xy);
   half4 sampleColor = source.eval(seed * dimensions);
   float3 delta = float3(color.rgb - sampleColor.rgb);
   float distance = length(delta);
   float threshold = 0.025 + tolerance * 0.65;
   float edge = max(0.002, feather * 0.22);
   float keep = smoothstep(threshold - edge, threshold + edge, distance);
   return half4(keep, keep, keep, keep);
 }
`);
// Edge softness 0..0.98. `spread` feathers the edge; `hardness` (0..1, 1 = hard) also softens it when lowered.
const softnessOf = (spread = 0, hardness = 1) => Math.max(0, Math.min(.98, Math.max(spread / 100, 1 - hardness)));
// A whole stroke becomes ONE smoothed path (quadratic curves through midpoints) instead of thousands of circles.
function strokePath(points: StrokePoint[]): string {
  if (!points.length) return '';
  const p0 = points[0];
  if (points.length === 1) return `M ${p0.x} ${p0.y} L ${p0.x + .01} ${p0.y}`; // round cap draws a dot
  let d = `M ${p0.x} ${p0.y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    d += ` Q ${a.x} ${a.y} ${(a.x + b.x) / 2} ${(a.y + b.y) / 2}`;
  }
  const last = points[points.length - 1];
  return d + ` L ${last.x} ${last.y}`;
}
// Opacity is applied once to the whole path, so overlapping segments never darken (no "beads").
function BrushPath({ points, width, color, opacity, softness }: { points: StrokePoint[]; width: number; color: string; opacity: number; softness: number }) {
  const d = useMemo(() => strokePath(points), [points]);
  if (!d) return null;
  return <Path path={d} color={color} style="stroke" strokeWidth={width} strokeCap="round" strokeJoin="round" opacity={opacity}>
    {softness > .015 && <BlurMask blur={Math.max(.1, width / 2 * softness * .5)} style="normal" />}
  </Path>;
}
function StrokeShape({ stroke }: { stroke: BrushStroke }) {
  if (!stroke.points.length) return null;
  const path = <BrushPath points={stroke.points} width={stroke.size} color={stroke.eraser ? '#000000' : stroke.color} opacity={stroke.opacity ?? 1} softness={softnessOf(stroke.spread, stroke.hardness)} />;
  return stroke.eraser ? <Group layer={<Paint blendMode="dstOut" />}>{path}</Group> : path;
}
// The in-progress stroke is rendered INSIDE the paint layer's isolated group, so an eraser preview
// only erases that layer's strokes (it used to punch through the photo until the finger was lifted).
function PaintContent({ layer, preview }: { layer: PaintLayer; preview?: BrushStroke | null }) {
  return <Group layer>{layer.strokes.map(stroke => <StrokeShape key={stroke.id} stroke={stroke} />)}{preview && <StrokeShape stroke={preview} />}</Group>;
}
/**
 * Trazo de goma. En máscaras de LUMINANCIA (texto, formas, pintura) negro oculta y blanco restaura.
 * En máscaras ALFA (imágenes) el negro opaco tiene alfa 1, así que «Borrar» no borraba nada: ahí el borrado
 * resta alfa con dstOut y restaurar lo suma. La máscara se dibuja en su propia capa, así que dstOut solo la afecta a ella.
 */
function MaskPath({ stroke, alpha }: { stroke: MaskStroke; alpha?: boolean }) {
  const path = <BrushPath points={stroke.points} width={stroke.radius * 2} color={stroke.restore ? '#ffffff' : '#000000'} opacity={stroke.opacity} softness={softnessOf(stroke.spread, stroke.hardness)} />;
  return alpha && !stroke.restore ? <Group layer={<Paint blendMode="dstOut" />}>{path}</Group> : path;
}
// ---- Aparición píxel a píxel ------------------------------------------------------------------------------------
// Al cargar una foto, los bloques aparecen al azar mientras se hacen cada vez más finos hasta llegar a la imagen nítida.
const revealEffect = Skia.RuntimeEffect.Make(`
 uniform shader image;
 uniform float2 dimensions;
 uniform float progress;
 float hash(float2 q) { return fract(sin(dot(q, float2(127.1, 311.7))) * 43758.5453); }
 half4 main(float2 p) {
   float t = clamp(progress, 0.0, 1.0);
   if (t >= 0.999) return image.eval(p);
   float e = 1.0 - pow(1.0 - t, 3.0);
   float cell = mix(max(dimensions.x, dimensions.y) / 22.0, 1.0, e);
   float2 b = floor(p / cell);
   half4 col = image.eval((b + 0.5) * cell);
   float r = hash(b + floor(cell));
   float vis = smoothstep(r - 0.12, r, t * 1.3);
   return col * half(vis);
 }
`);
const REVEAL_MS = 1100;
/** Fotos que ya aparecieron en esta sesión: no se vuelve a animar al recortar, deshacer o volver a abrir. */
const revealedUris = new Set<string>();
export const markRevealed = (uri: string) => { revealedUris.add(uri); };
function useReveal(uri: string | null, loaded: boolean, w: number, h: number) {
  const progress = useSharedValue(1);
  const [active, setActive] = useState(false);
  useEffect(() => {
    if (!uri || !loaded || revealedUris.has(uri)) return;
    revealedUris.add(uri);
    progress.value = 0;
    setActive(true);
    progress.value = withTiming(1, { duration: REVEAL_MS, easing: Easing.out(Easing.quad) }, done => { if (done) runOnJS(setActive)(false); });
  }, [uri, loaded]);
  const uniforms = useDerivedValue(() => ({ dimensions: [w, h], progress: progress.value }), [w, h]);
  return { active, uniforms };
}

function ImageContent({ layer, preview, preloaded, preloadedMask, gpuWand, liquifyPreview }: { layer: ImageLayer; preview?: MaskStroke | null; liquifyPreview?: LiquifyPreview | null; preloaded?: SkImage; preloadedMask?: SkImage; gpuWand?: {layerId:string; x:number; y:number; tolerance:number; feather:number} | null }) {
  // Las máscaras en memoria (mem-mask:) no pasan por disco ni por useImage: no hay parpadeo al cambiar de máscara.
  const memMask = isMemMask(layer.magicMaskUri) ? getMemMask(layer.magicMaskUri) : null;
  const wandMaskLoaded = useImage(isMemMask(layer.magicMaskUri) ? null : layer.magicMaskUri ?? null);
  const wandMask = preloadedMask ?? memMask ?? wandMaskLoaded;
  const loaded = useImage(preloaded ? null : layer.uri);
  const image = preloaded ?? loaded;
  const reveal = useReveal(preloaded ? null : layer.uri, !!image, layer.width, layer.height);
  if (!image) return null;
  // Attach the color filter to the image's own paint rather than an offscreen
  // Group layer. An offscreen layer with a nested Paint was rendering black on iOS.
  const warp = layer.warp;
  const touches = warp?.strokes ?? [];
  const frozen = warp?.frozen ?? [];
  const stages = warp?.mode === 'push' && touches.length ?
    Array.from({length:Math.ceil(touches.length/16)},(_,i)=>touches.slice(i*16,(i+1)*16)) : [[]];
  const glitch = layer.glitchSettings ?? (layer.glitch ? {mode:3,intensity:layer.glitch,density:0.65,seed:1337} : null);
  const recolor = layer.colorReplace;
  const adj = layer.adjustments;
  const hasAdjustments = hasAnyAdjustment(adj);
  // Licuar: la vista previa del trazo en curso manda sobre el campo guardado.
  const liq = !liquifyEffect ? null : liquifyPreview && liquifyPreview.layerId === layer.id ? liquifyPreview
    : layer.liquify && liquifyEffect ? (() => { const t = liquifyTexture(layer.liquify!); return t ? { texture: t, cols: layer.liquify!.cols, rows: layer.liquify!.rows } : null; })() : null;
  const enabled: Record<EffectStage,boolean> = {
    warp:!!warp && !!warpEffect,
    glitch:!!glitch && glitch.mode>0 && !!glitchEffect,
    recolor:!!recolor && !!replaceColorEffect,
    adjustments:hasAdjustments && !!adjustmentEffect,
  };
  const defaultOrder:EffectStage[]=['warp','glitch','recolor','adjustments'];
  const ordered=[...(layer.effectOrder??defaultOrder),...defaultOrder].filter((stage,i,all)=>all.indexOf(stage)===i && enabled[stage] && !(layer.effectDisabled??[]).includes(stage));
  // Each stage consumes the previous stage as a shader child. The order is therefore
  // preserved in the canvas and in snapshots/exports that use this same renderer.
  // Con licuar, el borde se extiende (clamp) en lugar de volverse transparente al estirar hacia dentro.
  let pipeline:React.ReactNode=<ImageShader image={image} x={0} y={0} width={layer.width} height={layer.height} fit="fill" {...(liq ? { tx: 'clamp' as const, ty: 'clamp' as const } : {})} />;
  if (liq) pipeline = withLiquify(pipeline, liq.texture, liq.cols, liq.rows, layer.width, layer.height);
  for(const stage of ordered){
    if(stage==='warp' && warp && warpEffect){
      for(const group of stages){
        pipeline=<Shader source={warpEffect} uniforms={{
          dimensions:[layer.width,layer.height],center:[warp.centerX,warp.centerY],
          radius:warp.radius,strength:warp.strength,frequency:warp.frequency,
          mode:['push','twirl','bulge','wave','mesh'].indexOf(warp.mode),
          touchCount:group.length,
          touches:Array.from({length:16},(_,i)=>{const pt=group[i];return pt?[pt.x,pt.y,pt.dx,pt.dy]:[0,0,0,0];}).flat(),
          freezeCount:Math.min(8,frozen.length),
          frozen:Array.from({length:8},(_,i)=>{const f=frozen[i];return f?[f.x,f.y,f.radius,0]:[0,0,0,0];}).flat(),
        }}>{pipeline}</Shader>;
      }
    }else if(stage==='glitch' && glitch && glitchEffect){
      pipeline=<Shader source={glitchEffect} uniforms={{dimensions:[layer.width,layer.height],mode:glitch.mode,intensity:glitch.intensity,density:glitch.density,seed:glitch.seed}}>{pipeline}</Shader>;
    }else if(stage==='recolor' && recolor && replaceColorEffect){
      pipeline=<Shader source={replaceColorEffect} uniforms={{sourceColor:rgb(recolor.source),targetColor:rgb(recolor.target),tolerance:recolor.tolerance,softness:recolor.softness,strength:recolor.strength}}>{pipeline}</Shader>;
    }else if(stage==='adjustments' && adj && adjustmentEffect){
      pipeline=<Shader source={adjustmentEffect} uniforms={adjustmentUniforms(adj,layer.width,layer.height)}>{pipeline}</Shader>;
    }
  }
  // Aparición píxel a píxel la primera vez que se carga la foto (ver useReveal).
  const recolored = reveal.active && revealEffect
    ? <Rect x={0} y={0} width={layer.width} height={layer.height}><Shader source={revealEffect} uniforms={reveal.uniforms}>{pipeline}</Shader></Rect>
    : <Rect x={0} y={0} width={layer.width} height={layer.height}>{pipeline}</Rect>;
  const revealed = recolored;
  const strokes = [...(layer.maskStrokes ?? []), ...(preview ? [preview] : [])];
  const gpu = gpuWand?.layerId === layer.id && wandEffect ? gpuWand : null;
  const gpuMask = gpu ? <Rect x={0} y={0} width={layer.width} height={layer.height}>
    <Shader source={wandEffect!} uniforms={{dimensions:[layer.width,layer.height],seed:[gpu.x,gpu.y],tolerance:gpu.tolerance/100,feather:gpu.feather/100}}>
      <ImageShader image={image} x={0} y={0} width={layer.width} height={layer.height} fit="fill" />
    </Shader>
  </Rect> : null;
  if (!strokes.length && !layer.magicMaskUri && !gpu) return revealed;
  return <Mask mode="alpha" mask={<Group layer>{gpuMask ?? (wandMask ? (liq
    ? <Rect x={0} y={0} width={layer.width} height={layer.height}>{withLiquify(<ImageShader image={wandMask} x={0} y={0} width={layer.width} height={layer.height} fit="fill" tx="clamp" ty="clamp" />, liq.texture, liq.cols, liq.rows, layer.width, layer.height)}</Rect>
    : <SkiaImage image={wandMask} x={0} y={0} width={layer.width} height={layer.height} fit="fill" />) : <Rect x={0} y={0} width={layer.width} height={layer.height} color="white" />)}{strokes.map(st => <MaskPath key={st.id} stroke={st} alpha />)}</Group>}>{revealed}</Mask>;
}
// True projective homography from a rectangle to four target corners.
// Unlike skew, parallel edges can converge to vanishing points.
function perspectiveMatrix(w:number,h:number,px:number,py:number){
  const dx=px*w*.42,dy=py*h*.42;
  const target=[[dx,dy],[w-dx,-dy],[w+dx,h+dy],[-dx,h-dy]];
  const source=[[0,0],[w,0],[w,h],[0,h]];
  const a:number[][]=[];
  for(let i=0;i<4;i++){
    const [x,y]=source[i],[u,v]=target[i];
    a.push([x,y,1,0,0,0,-u*x,-u*y,u]);
    a.push([0,0,0,x,y,1,-v*x,-v*y,v]);
  }
  for(let col=0;col<8;col++){
    let pivot=col;
    for(let row=col+1;row<8;row++)if(Math.abs(a[row][col])>Math.abs(a[pivot][col]))pivot=row;
    if(Math.abs(a[pivot][col])<1e-9)return Skia.Matrix();
    [a[col],a[pivot]]=[a[pivot],a[col]];
    const scale=a[col][col];for(let k=col;k<=8;k++)a[col][k]/=scale;
    for(let row=0;row<8;row++)if(row!==col){const factor=a[row][col];for(let k=col;k<=8;k++)a[row][k]-=factor*a[col][k];}
  }
  const q=a.map(row=>row[8]);
  const matrix=Skia.Matrix();
  matrix.concat([q[0],q[1],q[2],q[3],q[4],q[5],q[6],q[7],1]);
  return matrix;
}
export type CropPreview = { layerId: string; rect: { x: number; y: number; w: number; h: number }; angle: number };
// Dims everything outside the crop rectangle (image-local coordinates) and draws a rule-of-thirds grid.
function CropOverlay({ width, height, rect }: { width: number; height: number; rect: CropPreview['rect'] }) {
  const x = rect.x * width, y = rect.y * height, w = rect.w * width, h = rect.h * height;
  const sw = Math.max(1, Math.min(width, height) / 220);
  const grid = `M ${x + w / 3} ${y} V ${y + h} M ${x + 2 * w / 3} ${y} V ${y + h} M ${x} ${y + h / 3} H ${x + w} M ${x} ${y + 2 * h / 3} H ${x + w}`;
  return <Group>
    <Path path={`M 0 0 H ${width} V ${height} H 0 Z M ${x} ${y} H ${x + w} V ${y + h} H ${x} Z`} fillType="evenOdd" color="rgba(0,0,0,0.6)" />
    <Path path={grid} color="rgba(255,255,255,0.55)" style="stroke" strokeWidth={sw * .6} />
    <Rect x={x} y={y} width={w} height={h} color="#ffffff" style="stroke" strokeWidth={sw * 1.4} />
  </Group>;
}
// Render text with the same Skia scene used by the interactive canvas and PNG export.
// Font size is expressed in document pixels; resizing the layer scales glyphs proportionally.
//
// Skia Paragraph (antes: un <Text> de Skia por letra, hasta 3 veces por letra):
//  - Fuentes incluidas en la app (services/fonts.ts): el meme se ve igual en Android y en iOS.
//  - Kerning, ligaduras, emojis y alfabetos no latinos (fallback automático a las fuentes del sistema).
//  - Tres párrafos como máximo por capa (sombra/resaltado, contorno, relleno), memorizados: no se reconstruyen
//    al mover la capa ni al dibujar en otra.
function useFontsVersion() {
  const [v, setV] = useState(getFontVersion);
  useEffect(() => subscribeFonts(() => setV(getFontVersion())), []);
  return v;
}
const ALIGN = { left: TextAlign.Left, center: TextAlign.Center, right: TextAlign.Right } as const;
function withAlpha(hex: string, alpha: number) {
  const c = Skia.Color(hex);
  return Skia.Color(`rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${clamp(alpha, 0, 1)})`);
}
function TextContent({ layer }: { layer: TextLayer }) {
  const fontsVersion = useFontsVersion();
  const built = useMemo(() => {
    const provider = getFontProvider() ?? undefined;
    const families = fontFamiliesFor(layer.fontFamily);
    const text = layer.text.length ? layer.text : ' ';
    const outline = Math.max(0, layer.strokeWidth ?? 0);
    const shadow = Math.max(0, layer.shadowBlur ?? 0);
    const base: SkTextStyle = {
      fontFamilies: families,
      fontSize: Math.max(1, layer.fontSize),
      letterSpacing: layer.letterSpacing ?? 0,
      heightMultiplier: layer.lineHeight,
      halfLeading: true,
    };
    const make = (style: SkTextStyle, fg?: SkPaint, bg?: SkPaint) => {
      const b = Skia.ParagraphBuilder.Make({ textAlign: ALIGN[layer.align] ?? TextAlign.Center }, provider);
      b.pushStyle({ ...base, ...style }, fg, bg);
      b.addText(text);
      b.pop();
      return b.build();
    };
    const fill = make({ color: Skia.Color(layer.color) });
    // Ancho natural sin cortes de línea. Si no cabe, se comprime horizontalmente (igual que antes).
    fill.layout(1e6);
    const natural = Math.ceil(fill.getMaxIntrinsicWidth()) + 2;
    const contentWidth = Math.max(layer.width, natural);
    fill.layout(contentWidth);
    let under: ReturnType<typeof make> | null = null;
    if (shadow > 0 || layer.highlightColor) {
      let bg: SkPaint | undefined;
      if (layer.highlightColor) { bg = Skia.Paint(); bg.setColor(withAlpha(layer.highlightColor, layer.highlightOpacity ?? .5)); }
      const shadows = shadow > 0 ? [{
        color: Skia.Color(layer.shadowColor ?? '#000000'),
        offset: { x: layer.shadowOffsetX ?? shadow * .65, y: layer.shadowOffsetY ?? shadow * .65 },
        blurRadius: shadow * .35,
      }] : undefined;
      under = make({ color: Skia.Color(layer.color), shadows }, undefined, bg);
      under.layout(contentWidth);
    }
    let stroke: ReturnType<typeof make> | null = null;
    if (outline > 0) {
      const paint = Skia.Paint();
      paint.setAntiAlias(true);
      paint.setStyle(PaintStyle.Stroke);
      paint.setStrokeJoin(StrokeJoin.Round);
      paint.setStrokeWidth(outline * 2);
      paint.setColor(Skia.Color(layer.strokeColor ?? '#000000'));
      stroke = make({}, paint);
      stroke.layout(contentWidth);
    }
    return { fill, under, stroke, contentWidth, height: Math.max(1, fill.getHeight()) };
  }, [fontsVersion, layer.text, layer.fontFamily, layer.fontSize, layer.letterSpacing, layer.lineHeight, layer.align, layer.color,
      layer.strokeWidth, layer.strokeColor, layer.shadowBlur, layer.shadowColor, layer.shadowOffsetX, layer.shadowOffsetY,
      layer.highlightColor, layer.highlightOpacity, layer.width]);
  const scaleX = layer.width / built.contentWidth;
  const scaleY = layer.height / built.height;
  return <Group transform={[{ scaleX }, { scaleY }]}>
    {built.under && <Paragraph paragraph={built.under} x={0} y={0} width={built.contentWidth} />}
    {built.stroke && <Paragraph paragraph={built.stroke} x={0} y={0} width={built.contentWidth} />}
    <Paragraph paragraph={built.fill} x={0} y={0} width={built.contentWidth} />
  </Group>;
}
// React.memo: el documento es inmutable, así que una capa que no cambió conserva la misma referencia y no se
// vuelve a renderizar cuando se mueve otra capa, se dibuja un trazo o cambia la cámara.
/** Tamaño natural del texto (sin cortes de línea) con su fuente, en píxeles del documento. */
export function measureTextLayer(layer: Pick<TextLayer, 'text' | 'fontFamily' | 'fontSize' | 'letterSpacing' | 'lineHeight' | 'align' | 'strokeWidth' | 'color'>) {
  const b = Skia.ParagraphBuilder.Make({ textAlign: ALIGN[layer.align] ?? TextAlign.Center }, getFontProvider() ?? undefined);
  b.pushStyle({ fontFamilies: fontFamiliesFor(layer.fontFamily), fontSize: Math.max(1, layer.fontSize), letterSpacing: layer.letterSpacing ?? 0,
    heightMultiplier: layer.lineHeight, halfLeading: true, color: Skia.Color(layer.color) });
  b.addText(layer.text.length ? layer.text : ' ');
  b.pop();
  const p = b.build();
  p.layout(1e6);
  return { width: Math.ceil(p.getMaxIntrinsicWidth()) + 2 + Math.max(0, layer.strokeWidth ?? 0) * 2, height: Math.max(1, p.getHeight()) };
}
/** Hueco de foto de una plantilla: marco discontinuo + icono de imagen. Se sustituye con «Poner foto». */
function PlaceholderContent({ layer }: { layer: ShapeLayer }) {
  const w = layer.width, h = layer.height, m = Math.min(w, h);
  const sw = Math.max(2, m / 90), icon = m * .22, cx = w / 2, cy = h / 2;
  const x0 = cx - icon, y0 = cy - icon * .72, x1 = cx + icon, y1 = cy + icon * .72;
  const mountains = `M ${x0} ${y1} L ${x0 + icon * .7} ${cy - icon * .05} L ${x0 + icon * 1.15} ${cy + icon * .35} L ${x0 + icon * 1.45} ${cy + icon * .1} L ${x1} ${y1} Z`;
  return <Group>
    <Rect x={0} y={0} width={w} height={h} color={layer.color} />
    <Rect x={sw / 2} y={sw / 2} width={w - sw} height={h - sw} color="rgba(0,0,0,0.28)" style="stroke" strokeWidth={sw}><DashPathEffect intervals={[sw * 5, sw * 3]} /></Rect>
    <RoundedRect x={x0} y={y0} width={x1 - x0} height={y1 - y0} r={icon * .12} color="rgba(0,0,0,0.35)" style="stroke" strokeWidth={sw * 1.4} />
    <Path path={mountains} color="rgba(0,0,0,0.35)" />
    <Circle cx={x1 - icon * .45} cy={y0 + icon * .42} r={icon * .16} color="rgba(0,0,0,0.35)" />
  </Group>;
}
/** Fondo del documento. 'transparent' se muestra como cuadrícula en el editor (no en la exportación). */
function DocumentBackground({ doc, forExport }: { doc: EditorDocument; forExport?: boolean }) {
  const bg = doc.background ?? '#ffffff';
  const checker = useMemo(() => {
    if (bg !== 'transparent' || forExport) return null;
    const cell = Math.max(8, Math.round(Math.max(doc.width, doc.height) / 48));
    let d = '';
    for (let y = 0; y < doc.height; y += cell) for (let x = ((y / cell) % 2) * cell; x < doc.width; x += cell * 2) d += `M${x} ${y}h${cell}v${cell}h${-cell}Z`;
    return d;
  }, [bg, forExport, doc.width, doc.height]);
  if (bg === 'transparent') return forExport ? null : <Group><Rect x={0} y={0} width={doc.width} height={doc.height} color="#ffffff" />{checker ? <Path path={checker} color="#e3e3e3" /> : null}</Group>;
  return <Rect x={0} y={0} width={doc.width} height={doc.height} color={bg} />;
}
function ShapeContent({ layer }: { layer: ShapeLayer }) {
  if (layer.placeholder) return <PlaceholderContent layer={layer} />;
  const kind = layer.shape ?? 'rect';
  if (kind === 'ellipse') return <Oval x={0} y={0} width={layer.width} height={layer.height} color={layer.color} />;
  if (kind === 'rounded') return <RoundedRect x={0} y={0} width={layer.width} height={layer.height} r={Math.min(layer.width, layer.height) * .18} color={layer.color} />;
  return <Rect x={0} y={0} width={layer.width} height={layer.height} color={layer.color} />;
}
const LayerContent = React.memo(function LayerContent({ layer, selected, previewMask, previewStroke, images, cropPreview, gpuWand, liquifyPreview }: { layer: EditorLayer; selected: boolean; liquifyPreview?: LiquifyPreview | null; previewMask?: MaskStroke | null; previewStroke?: BrushStroke | null; images?: Record<string, SkImage>; cropPreview?: CropPreview | null; gpuWand?: {layerId:string;x:number;y:number;tolerance:number;feather:number}|null }) {
  if (!layer.visible) return null;
  const flipX = layer.type === 'image' && !!layer.flipX;
  const transform = [
    { translateX: layer.x + layer.width / 2 }, { translateY: layer.y + layer.height / 2 },
    { rotate: layer.rotation }, { translateX: -layer.width / 2 }, { translateY: -layer.height / 2 },
  ];
  return <Group transform={transform}>
    <Group opacity={layer.opacity} layer={<Paint blendMode={layer.blendMode ?? 'srcOver'} />}>
      {/* flipX mirrors only the content (image + mask + crop overlay); selection handles below stay upright. */}
      <Group transform={flipX ? [{ translateX: layer.width / 2 }, { scaleX: -1 }, { translateX: -layer.width / 2 }] : undefined}>
        {layer.type === 'image' ? (() => {
          const crop = cropPreview && cropPreview.layerId === layer.id ? cropPreview : null;
          let body = <ImageContent layer={layer} preview={previewMask} preloaded={images?.[layer.id]} preloadedMask={images?.[`${layer.id}:mask`]} gpuWand={gpuWand} liquifyPreview={liquifyPreview} />;
          // Straighten preview: the image turns under the fixed crop rectangle.
          if (crop && crop.angle) body = <Group transform={[{ translateX: layer.width / 2 }, { translateY: layer.height / 2 }, { rotate: crop.angle }, { translateX: -layer.width / 2 }, { translateY: -layer.height / 2 }]}>{body}</Group>;
          const projected = (layer.perspectiveX || layer.perspectiveY) ? <Group matrix={perspectiveMatrix(layer.width,layer.height,layer.perspectiveX??0,layer.perspectiveY??0)}>{body}{crop && <CropOverlay width={layer.width} height={layer.height} rect={crop.rect} />}</Group> : <>{body}{crop && <CropOverlay width={layer.width} height={layer.height} rect={crop.rect} />}</>;
          return projected;
        })() : (() => {
          const content = layer.type === 'paint' ? <PaintContent layer={layer} preview={previewStroke} /> : layer.type === 'text' ? <TextContent layer={layer} /> : <ShapeContent layer={layer} />;
          const strokes = [...(layer.maskStrokes ?? []), ...(previewMask ? [previewMask] : [])];
          if (!strokes.length) return content;
          // Luminance masking is intentional: black strokes remove, white strokes restore.
          // The white rectangle defines an opaque default mask for every layer type.
          return <Mask mode="luminance" mask={<Group><Rect x={0} y={0} width={layer.width} height={layer.height} color="white" />{strokes.map(st => <MaskPath key={st.id} stroke={st} />)}</Group>}>{content}</Mask>;
        })()}
      </Group>
    </Group>
    {selected && <Group>
      <Rect x={0} y={0} width={layer.width} height={layer.height} color="#e9e9e9" style="stroke" strokeWidth={Math.max(1, Math.min(layer.width, layer.height) / 180)} />
      {/* Side handles: stretch only one axis. */}
      {[[layer.width/2,0],[layer.width,layer.height/2],[layer.width/2,layer.height],[0,layer.height/2]].map(([x,y],i) =>
        <Circle key={`edge-${i}`} cx={x} cy={y} r={Math.max(5, Math.min(layer.width,layer.height)/45)} color="#ffffff" />)}
      {/* Corners: delete, rotate, proportional resize. */}
      {[[0,0],[layer.width,0],[layer.width,layer.height]].map(([x,y],i) =>
        <Group key={`corner-${i}`}>
          <Circle cx={x} cy={y} r={Math.max(10,Math.min(layer.width,layer.height)/24)} color="#ffffff" />
          {i===0 ? <Path path={`M ${x-4} ${y-4} L ${x+4} ${y+4} M ${x+4} ${y-4} L ${x-4} ${y+4}`} color="#191919" style="stroke" strokeWidth={2} strokeCap="round" /> :
           i===1 ? <Path path={`M ${x-5} ${y+2} C ${x-9} ${y-8}, ${x+7} ${y-9}, ${x+7} ${y+1} M ${x+3} ${y-2} L ${x+7} ${y+2} L ${x+10} ${y-3}`} color="#191919" style="stroke" strokeWidth={2} strokeCap="round" /> :
           <Path path={`M ${x-5} ${y-5} L ${x+5} ${y+5} M ${x+1} ${y+5} L ${x+5} ${y+5} L ${x+5} ${y+1}`} color="#191919" style="stroke" strokeWidth={2} strokeCap="round" />}
        </Group>)}
    </Group>}
  </Group>;
});
// Offscreen scene for export: document coordinates only (no viewport, no selection handles), clipped to the document.
const MAX_EXPORT_SIDE = 4096;
function ExportScene({ doc, images, scale, transparent = false }: { doc: EditorDocument; images: Record<string, SkImage>; scale: number; transparent?: boolean }) {
  return <Group transform={[{ scale }]}>
    <Group clip={{ x: 0, y: 0, width: doc.width, height: doc.height }}>
      {!transparent && <DocumentBackground doc={doc} forExport />}
      {doc.layers.map(layer => <LayerContent key={layer.id} layer={layer} selected={false} images={images} />)}
    </Group>
  </Group>;
}
async function renderDocumentBase64(doc: EditorDocument): Promise<string> {
  await ensureFonts(); // la exportación nunca debe salir con la fuente de respaldo
  const images: Record<string, SkImage> = {};
  for (const l of doc.layers) {
    if (l.type !== 'image' || !l.visible) continue;
    const data = await Skia.Data.fromURI(l.uri);
    const img = Skia.Image.MakeImageFromEncoded(data);
    if (!img) throw new Error(`No se pudo decodificar la imagen de la capa "${l.name}".`);
    images[l.id] = img;
    if(l.magicMaskUri){const mask=await loadMaskImage(l.magicMaskUri);if(mask)images[`${l.id}:mask`]=mask;}
  }
  const scale = Math.min(1, MAX_EXPORT_SIDE / Math.max(doc.width, doc.height));
  const out = await drawAsImage(<ExportScene doc={doc} images={images} scale={scale} />, { width: Math.max(1, Math.round(doc.width * scale)), height: Math.max(1, Math.round(doc.height * scale)) });
  return out.encodeToBase64();
}
/**
 * Miniatura para la pantalla de inicio: el mismo render que la exportación, a 480 px de lado largo, en JPEG.
 * Las imágenes se decodifican ya reducidas por Skia al dibujar; el costo real es leerlas de disco una vez.
 */
export async function renderThumbnailBase64(doc: EditorDocument, maxSide = 480): Promise<string> {
  await ensureFonts();
  const images: Record<string, SkImage> = {};
  for (const l of doc.layers) {
    if (l.type !== 'image' || !l.visible) continue;
    try {
      const img = Skia.Image.MakeImageFromEncoded(await Skia.Data.fromURI(l.uri));
      if (img) images[l.id] = img;
      if (l.magicMaskUri) { const mask = await loadMaskImage(l.magicMaskUri); if (mask) images[`${l.id}:mask`] = mask; }
    } catch (e) { console.warn('Miniatura: capa omitida', l.name, e); }
  }
  const scale = Math.min(1, maxSide / Math.max(doc.width, doc.height));
  const W = Math.max(1, Math.round(doc.width * scale)), H = Math.max(1, Math.round(doc.height * scale));
  // JPEG no tiene alfa: un lienzo transparente se muestra sobre blanco en la miniatura.
  const out = await drawAsImage(<Group><Rect x={0} y={0} width={W} height={H} color="#ffffff" /><ExportScene doc={doc} images={images} scale={scale} /></Group>, { width: W, height: H });
  return out.encodeToBase64(ImageFormat.JPEG, 82);
}
/** Exports a single masked image as an actual transparent PNG for the sticker library. */
export async function renderStickerBase64(layer: ImageLayer): Promise<{ base64: string; width: number; height: number }> {
  await ensureFonts();
  const width = Math.max(1, Math.round(layer.sourceWidth || layer.width));
  const height = Math.max(1, Math.round(layer.sourceHeight || layer.height));
  const clean: ImageLayer = { ...layer, x: 0, y: 0, width, height, rotation: 0, perspectiveX: 0, perspectiveY: 0, opacity: 1, visible: true };
  const data = await Skia.Data.fromURI(layer.uri);
  const image = Skia.Image.MakeImageFromEncoded(data);
  if (!image) throw new Error('No se pudo cargar la imagen del sticker');
  const doc: EditorDocument = { width, height, layers: [clean], selectedId: null };
  const images: Record<string, SkImage> = { [layer.id]: image };
  if(layer.magicMaskUri){
    const mask=await loadMaskImage(layer.magicMaskUri);
    if(!mask)throw new Error("No se pudo cargar la máscara del sticker");
    images[`${layer.id}:mask`]=mask;
  }
  const scale = Math.min(1, MAX_EXPORT_SIDE / Math.max(width, height));
  const result = await drawAsImage(<ExportScene doc={doc} images={images} scale={scale} transparent />, {
    width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale))
  });
  return { base64: result.encodeToBase64(), width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
function hitTest(layers: EditorLayer[], x: number, y: number): EditorLayer | undefined {
  for (let i = layers.length - 1; i >= 0; i--) {
    const l = layers[i];
    if (!l.visible || l.opacity === 0 || l.type === 'paint') continue;
    const cx = l.x + l.width / 2, cy = l.y + l.height / 2;
    const dx = x - cx, dy = y - cy, c = Math.cos(l.rotation), s = Math.sin(l.rotation);
    const lx = dx * c + dy * s, ly = -dx * s + dy * c;
    if (Math.abs(lx) <= l.width / 2 && Math.abs(ly) <= l.height / 2) return l;
  }
}

export const PhotoCanvas = forwardRef<PhotoCanvasHandle, { document: EditorDocument; mode: InteractionMode; brush?: BrushOptions; onPickColor?: (color:string)=>void; onWandPick?: (x:number,y:number)=>void; cropPreview?: CropPreview | null; gpuWand?: {layerId:string;x:number;y:number;tolerance:number;feather:number}|null; onLayerRemoved?: (name: string, before: EditorDocument) => void; liquify?: LiquifyOptions; frame?: CanvasFrame; onEditText?: (layerId: string) => void }>(function PhotoCanvas({ document, mode, gpuWand, brush = { color: '#ff508e', size: 20, eraser: false }, onPickColor, onWandPick, cropPreview, onLayerRemoved, liquify, frame, onEditText }, ref) {
  const canvas = useRef<React.ElementRef<typeof Canvas>>(null);
  const [pickerHud,setPickerHud]=useState<{x:number;y:number;color:string}|null>(null);
  const pickerCache=useRef<{pixels:Uint8Array|Uint8ClampedArray;width:number;height:number}|null>(null);
  const pickerToken=useRef(0);
  const pickerColorRef=useRef<string|null>(null);
  const lastPickerSample=useRef(0);

  const [size, setSize] = useState({ width: 1, height: 1 });
  // Cámara en valores compartidos de Reanimated: pellizcar y desplazar con dos dedos corre en el hilo de UI
  // y Skia lee los valores directamente. Antes cada cuadro hacía setState y React volvía a recorrer todo el lienzo.
  const camZoom = useSharedValue(1), camX = useSharedValue(0), camY = useSharedValue(0);
  const panStart = useSharedValue({ x: 0, y: 0 }), zoomStart = useSharedValue(1);
  const cameraTransform = useDerivedValue(() => [{ translateX: camX.value }, { translateY: camY.value }, { scale: camZoom.value }]);
  /** Lectura puntual de la cámara desde JS (al empezar un gesto o convertir un toque). */
  const readVp = (): Viewport => ({ zoom: camZoom.value, x: camX.value, y: camY.value, rotation: 0 });
  const sizeRef = useRef(size);
  const modeRef = useRef(mode);
  sizeRef.current = size;
  modeRef.current = mode;
  const onWandRef = useRef(onWandPick); onWandRef.current = onWandPick;
  const onRemovedRef = useRef(onLayerRemoved); onRemovedRef.current = onLayerRemoved;
  const onEditTextRef = useRef(onEditText); onEditTextRef.current = onEditText;
  const liquifyRef = useRef(liquify); liquifyRef.current = liquify;
  const frameRef = useRef(frame); frameRef.current = frame;
  const onPickRef = useRef(onPickColor);
  onPickRef.current = onPickColor;
  const brushRef = useRef(brush);
  brushRef.current = brush;
  const warpPointer = useRef<{id:string;last:{x:number;y:number};layer:ImageLayer;strokeId:number}|null>(null);
  const [warpCursor,setWarpCursor] = useState<{x:number;y:number;radius:number}|null>(null);
  const pendingStroke = useRef<{ id: string; points: StrokePoint[] } | null>(null);
  const [previewStroke, setPreviewStroke] = useState<BrushStroke | null>(null);
  const [previewMask, setPreviewMask] = useState<MaskStroke | null>(null);
  const pendingMask = useRef<{ id: string; points: StrokePoint[] } | null>(null);
  const appendMaskStroke = useEditorStore(s => s.appendMaskStroke);
  const appendStroke = useEditorStore(s => s.appendStroke);
  const active = useRef<{ id: string | null; layer: EditorLayer | null; vp: Viewport; lastX: number; lastY: number; zoom: number; rotation: number; changed: boolean; handle?: string; startPoint?: StrokePoint } | null>(null);
  const select = useEditorStore(s => s.select);
  const update = useEditorStore(s => s.update);
  const remove = useEditorStore(s => s.remove);
  const beginEdit = useEditorStore(s => s.beginEdit);
  const finishEdit = useEditorStore(s => s.finishEdit);
  /**
   * Encaje del documento en la vista. Depende SOLO del tamaño de la vista (constante: los paneles se superponen)
   * y del marco reservado; abrir o cerrar un panel ya no mueve ni escala la imagen.
   */
  const layoutFor = (sz: { width: number; height: number }) => {
    const top = frameRef.current?.top ?? 0, bottom = frameRef.current?.bottom ?? 0;
    const availH = Math.max(1, sz.height - top - bottom);
    const f = Math.min(sz.width / document.width, availH / document.height);
    return { f, ox: (sz.width - document.width * f) / 2, oy: top + (availH - document.height * f) / 2 };
  };
  const { f: fit, ox: offsetX, oy: offsetY } = layoutFor(size);
  /** El lienzo abre la sesión de edición solo si no hay una abierta (si la hay, el trazo forma parte de ella). */
  const ownsSession = useRef(false);
  const openSession = () => { if (useEditorStore.getState().editBaseline) { ownsSession.current = false; return; } beginEdit(); ownsSession.current = true; };
  const closeSession = () => { if (ownsSession.current) finishEdit(); ownsSession.current = false; };

  const toDoc = (px: number, py: number) => {
    const vp = readVp(), sz = sizeRef.current;
    const dx = px - sz.width / 2 - vp.x, dy = py - sz.height / 2 - vp.y;
    const c = Math.cos(vp.rotation), s = Math.sin(vp.rotation);
    const ux = (dx * c + dy * s) / vp.zoom + sz.width / 2;
    const uy = (-dx * s + dy * c) / vp.zoom + sz.height / 2;
    const { f, ox, oy } = layoutFor(sz);
    return { x: (ux - ox) / f, y: (uy - oy) / f };
  };
  const toLocal = (d: StrokePoint, layer: EditorLayer): StrokePoint => {
    const cx = layer.x + layer.width / 2, cy = layer.y + layer.height / 2;
    const dx = d.x - cx, dy = d.y - cy, c = Math.cos(layer.rotation), s = Math.sin(layer.rotation);
    const lx = dx * c + dy * s + layer.width / 2;
    // Mask strokes live in image space; on a mirrored image the finger's x must be mirrored back.
    return { x: layer.type === 'image' && layer.flipX ? layer.width - lx : lx, y: -dx * s + dy * c + layer.height / 2 };
  };
  // Slider values are relative to a ~1000px-wide photo; scale so the brush is usable on 4000px photos too.
  const sizeUnit = () => Math.max(1, Math.max(document.width, document.height) / 1000);
  const uid = () => `${Date.now()}-${Math.random()}`;
  const makeStroke = (id: string, points: StrokePoint[]): BrushStroke => {
    const b = brushRef.current;
    return { id, points, color: b.color, size: b.size * sizeUnit(), eraser: b.eraser, opacity: b.opacity ?? 1, hardness: b.hardness ?? 1, spread: b.spread ?? 0 };
  };
  const makeMask = (id: string, points: StrokePoint[]): MaskStroke => {
    const b = brushRef.current;
    return { id, points, radius: b.size * sizeUnit(), opacity: b.opacity ?? 1, spread: b.spread ?? 20, hardness: b.hardness ?? 1, restore: !!b.restore };
  };
  // ---- Licuar ---------------------------------------------------------------------------------------------
  // El campo se edita en un Float32Array mientras el dedo está abajo; al soltar se guarda en la capa (un paso).
  const liquifyWork = useRef<{ layerId: string; w: number; h: number; field: ReturnType<typeof fieldFrom>; last: StrokePoint; layer: EditorLayer } | null>(null);
  const [liquifyPreview, setLiquifyPreview] = useState<LiquifyPreview | null>(null);
  const liquifyFrame = useRef<number | null>(null);
  const liquifyDirty = useRef(false);
  /** Radio del pincel en píxeles de la capa: el tamaño del slider es en pantalla, igual a cualquier zoom. */
  const liquifyRadius = () => (liquifyRef.current?.size ?? 60) / Math.max(.0001, layoutFor(sizeRef.current).f * readVp().zoom);
  const stampLiquify = (dx = 0, dy = 0, hold = false) => {
    const w = liquifyWork.current, opt = liquifyRef.current;
    if (!w || !opt) return;
    const strength = (opt.strength / 100) * (hold ? .3 : 1);
    if (applyBrush(w.field, w.w, w.h, { mode: opt.mode, x: w.last.x, y: w.last.y, radius: liquifyRadius(), strength, dx, dy })) liquifyDirty.current = true;
  };
  const liquifyTick = () => {
    liquifyFrame.current = null;
    const w = liquifyWork.current;
    if (!w) return;
    if (liquifyRef.current && liquifyRef.current.mode !== 'push') stampLiquify(0, 0, true); // girar/reducir/ampliar/restaurar actúan mientras se mantiene
    if (liquifyDirty.current) {
      liquifyDirty.current = false;
      const texture = liquifyTexture(w.field, false);
      if (texture) setLiquifyPreview({ layerId: w.layerId, texture, cols: w.field.cols, rows: w.field.rows });
    }
    liquifyFrame.current = requestAnimationFrame(liquifyTick);
  };
  const liquifyMove = (x: number, y: number) => {
    const w = liquifyWork.current;
    if (!w) return;
    const p = toLocal(toDoc(x, y), w.layer);
    const dx = p.x - w.last.x, dy = p.y - w.last.y;
    w.last = p;
    if (liquifyRef.current?.mode === 'push' && Math.hypot(dx, dy) > .01) stampLiquify(dx, dy);
    setWarpCursor({ x, y, radius: liquifyRef.current?.size ?? 60 });
  };
  const liquifyEnd = () => {
    const w = liquifyWork.current;
    if (!w) return;
    if (liquifyFrame.current !== null) cancelAnimationFrame(liquifyFrame.current);
    liquifyFrame.current = null;
    liquifyWork.current = null;
    update(w.layerId, { liquify: serializeField(w.field) });
    setLiquifyPreview(null);
    setWarpCursor(null);
    closeSession();
  };
  useEffect(() => () => { if (liquifyFrame.current !== null) cancelAnimationFrame(liquifyFrame.current); }, []);

  const begin = (x: number, y: number) => {
    if (active.current || liquifyWork.current) return;
    const d = toDoc(x, y);
    if (modeRef.current === 'wand') return;
    if (modeRef.current === 'liquify') {
      const current = useEditorStore.getState().document;
      const layer = current?.layers.find(l => l.id === current.selectedId);
      if (layer?.type !== 'image' || layer.locked) return;
      openSession();
      liquifyWork.current = { layerId: layer.id, w: layer.width, h: layer.height, field: fieldFrom(layer.liquify, layer.width, layer.height), last: toLocal(d, layer), layer };
      liquifyDirty.current = true;
      setWarpCursor({ x, y, radius: liquifyRef.current?.size ?? 60 });
      liquifyTick();
      return;
    }
    if (modeRef.current === 'warp') {
      const current=useEditorStore.getState().document;
      const layer=current?.layers.find(l=>l.id===current.selectedId);
      if(layer?.type!=='image'||layer.locked||layer.warp?.mode!=='push') return;
      const pt=toLocal(d,layer);
      if(pt.x<0||pt.y<0||pt.x>layer.width||pt.y>layer.height)return;
      const pos={x:pt.x/layer.width,y:pt.y/layer.height};
      if(layer.warp.brushMode==='freeze'){
        openSession();
        const old=layer.warp.frozen??[];
        update(layer.id,{warp:{...layer.warp,frozen:[...old,{...pos,radius:layer.warp.radius}].slice(-8)}});
        closeSession();return;
      }
      warpPointer.current={id:layer.id,last:pos,layer,strokeId:Date.now()};
      openSession();return;
    }
    if (modeRef.current === 'mask') {
      const current = useEditorStore.getState().document;
      const target = current?.layers.find(l => l.id === current.selectedId);
      if (!target || target.locked) return;
      const local = toLocal(d, target);
      pendingMask.current = { id: target.id, points: [local] };
      openSession();
      setPreviewMask(makeMask('preview', [local]));
      return;
    }
    if (modeRef.current === 'brush') {
      const current = useEditorStore.getState().document;
      const paint = current?.layers.find(l => l.id === current.selectedId && l.type === 'paint');
      if (!paint || paint.type !== 'paint' || paint.locked) return;
      const local = toLocal(d, paint);
      pendingStroke.current = { id: paint.id, points: [local] };
      openSession();
      setPreviewStroke(makeStroke('preview', [local]));
      return;
    }
    const current = useEditorStore.getState().document;
    const selected = current?.layers.find(l => l.id === current.selectedId);
    let handle: string | undefined;
    if (selected && !selected.locked && modeRef.current === 'layer') {
      const cx=selected.x+selected.width/2,cy=selected.y+selected.height/2;
      const dx=d.x-cx,dy=d.y-cy,c=Math.cos(selected.rotation),sn=Math.sin(selected.rotation);
      const lx=dx*c+dy*sn+selected.width/2,ly=-dx*sn+dy*c+selected.height/2;
      const radius=22/Math.max(.15, readVp().zoom * layoutFor(sizeRef.current).f);
      const handles:[string,number,number][]=[
        ['delete',0,0],['rotate',selected.width,0],['uniform',selected.width,selected.height],
        ['n',selected.width/2,0],['e',selected.width,selected.height/2],
        ['s',selected.width/2,selected.height],['w',0,selected.height/2]
      ];
      handle=handles.find(([,hx,hy])=>Math.hypot(lx-hx,ly-hy)<radius)?.[0];
    }
    // La ✕ ya no borra al tocar: se arma aquí y se borra al soltar sin haber arrastrado (ver end()).
    if (handle === 'delete' && selected && !selected.locked) {
      active.current = { id: selected.id, layer: null, vp: readVp(), lastX: d.x, lastY: d.y, zoom: 1, rotation: 0, changed: false, handle, startPoint: d };
      return;
    }
    const hit = handle ? selected : modeRef.current === 'layer' && current ? hitTest(current.layers, d.x, d.y) : undefined;
    if (modeRef.current === 'layer') select(hit?.id ?? null);
    if (hit && !hit.locked) openSession();
    active.current = { id: hit?.locked ? null : hit?.id ?? null, layer: hit && !hit.locked ? { ...hit } : null, vp: readVp(), lastX: d.x, lastY: d.y, zoom: 1, rotation: 0, changed: false, handle, startPoint:d };
  };
  // El dedo genera 120+ eventos por segundo; la vista previa se actualiza como mucho una vez por cuadro.
  const previewFrame = useRef<number | null>(null);
  const schedulePreview = () => {
    if (previewFrame.current !== null) return;
    previewFrame.current = requestAnimationFrame(() => {
      previewFrame.current = null;
      if (pendingMask.current) setPreviewMask(makeMask('preview', pendingMask.current.points.slice()));
      if (pendingStroke.current) setPreviewStroke(makeStroke('preview', pendingStroke.current.points.slice()));
    });
  };
  const cancelPreviewFrame = () => { if (previewFrame.current !== null) { cancelAnimationFrame(previewFrame.current); previewFrame.current = null; } };
  useEffect(() => cancelPreviewFrame, []);
  const drawAt = (x: number, y: number) => {
    const mask = pendingMask.current;
    if (mask) {
      const layer = useEditorStore.getState().document?.layers.find(l => l.id === mask.id);
      if (!layer) return;
      const p = toLocal(toDoc(x, y), layer);
      const last = mask.points[mask.points.length - 1];
      if (Math.hypot(p.x-last.x, p.y-last.y) < .75) return;
      mask.points.push(p);
      schedulePreview();
      return;
    }

    const pending = pendingStroke.current;
    if (!pending) return;
    const layer = useEditorStore.getState().document?.layers.find(l => l.id === pending.id);
    if (!layer) return;
    const p = toLocal(toDoc(x, y), layer);
    const last = pending.points[pending.points.length - 1];
    if (Math.hypot(p.x-last.x, p.y-last.y) < .75) return;
    pending.points.push(p);
    schedulePreview();
  };
  const warpDrag=(x:number,y:number)=>{
    const currentLayer=useEditorStore.getState().document?.layers.find(l=>l.id===useEditorStore.getState().document?.selectedId);
    if(currentLayer?.type==='image'&&currentLayer.warp){const scale=layoutFor(sizeRef.current).f*readVp().zoom;setWarpCursor({x,y,radius:currentLayer.warp.radius*Math.min(currentLayer.width,currentLayer.height)*scale});}
    const pointer=warpPointer.current;
    if(!pointer)return;
    const layer=useEditorStore.getState().document?.layers.find(l=>l.id===pointer.id);
    if(layer?.type!=='image'||layer.warp?.mode!=='push')return;
    const pt=toLocal(toDoc(x,y),layer);
    const next={x:pt.x/layer.width,y:pt.y/layer.height};
    const dx=next.x-pointer.last.x,dy=next.y-pointer.last.y;
    if(Math.hypot(dx,dy)<0.001)return;
    const point={x:(pointer.last.x+next.x)/2,y:(pointer.last.y+next.y)/2,dx,dy,strokeId:pointer.strokeId};
    // Keep up to 128 segments (8 nested GPU stages), preserving entire gestures
    // until the bounded capacity is reached. Undo removes the complete last stroke.
    update(pointer.id,{warp:{...layer.warp,strokes:[...(layer.warp.strokes??[]),point].slice(-128)}});
    pointer.last=next;
  };
  const drag = (dx: number, dy: number) => {
    const a = active.current;
    if (!a) return;
    if (a.handle === 'delete') { if (Math.hypot(dx, dy) > 12) a.changed = true; return; } // arrastrar fuera cancela el borrado
    if (modeRef.current === 'layer' && a.layer && a.id) {
      const vp = a.vp, f = layoutFor(sizeRef.current).f;
      const c = Math.cos(vp.rotation), s = Math.sin(vp.rotation);
      const x = (dx * c + dy * s) / (f * vp.zoom), y = (-dx * s + dy * c) / (f * vp.zoom);
      if(a.handle){
        const l=a.layer;
        const c=Math.cos(l.rotation),sn=Math.sin(l.rotation);
        const localX=x*c+y*sn, localY=-x*sn+y*c;
        if(a.handle==='rotate'){
          const start=a.startPoint!;
          const cx=l.x+l.width/2,cy=l.y+l.height/2;
          const angle=Math.atan2(start.y-cy,start.x-cx);
          update(a.id,{rotation:l.rotation+Math.atan2(start.y+y-cy,start.x+x-cx)-angle});
        } else if(a.handle==='uniform') {
          // Uniform scale anchored at the opposite corner, even for rotated layers.
          const projection=(localX*l.width+localY*l.height)/(l.width*l.width+l.height*l.height);
          const factor=clamp(1+projection,.05,30);
          const width=l.width*factor,height=l.height*factor;
          const anchorX=l.x+l.width/2-(c*l.width/2-sn*l.height/2);
          const anchorY=l.y+l.height/2-(sn*l.width/2+c*l.height/2);
          update(a.id,{width,height,
            x:anchorX+(c*width/2-sn*height/2)-width/2,
            y:anchorY+(sn*width/2+c*height/2)-height/2});
        } else {
          // Edge handles stretch along their local perpendicular axis.
          const left=a.handle==='w',right=a.handle==='e',top=a.handle==='n',bottom=a.handle==='s';
          const dw=left?-localX:right?localX:0,dh=top?-localY:bottom?localY:0;
          const w=Math.max(12,l.width+dw),h=Math.max(12,l.height+dh);
          const shiftLocalX=left?(l.width-w)/2:right?(w-l.width)/2:0;
          const shiftLocalY=top?(l.height-h)/2:bottom?(h-l.height)/2:0;
          update(a.id,{width:w,height:h,
            x:l.x+(l.width-w)/2+c*shiftLocalX-sn*shiftLocalY,
            y:l.y+(l.height-h)/2+sn*shiftLocalX+c*shiftLocalY});
        }
      }else update(a.id, { x: a.layer.x + x, y: a.layer.y + y });
      a.changed = true;
    }
  };
  const end = () => {
    cancelPreviewFrame();
    liquifyEnd();
    if(warpPointer.current){warpPointer.current=null;closeSession();}
    setWarpCursor(null);
    if (pendingMask.current) {
      const m = pendingMask.current;
      appendMaskStroke(m.id, makeMask(uid(), m.points));
      pendingMask.current = null;
      setPreviewMask(null);
      closeSession();
    }

    const pending = pendingStroke.current;
    if (pending) {
      appendStroke(pending.id, makeStroke(uid(), pending.points));
      pendingStroke.current = null;
      setPreviewStroke(null);
      closeSession();
    }
    const a = active.current;
    if (a?.handle === 'delete' && a.id && !a.changed) {
      const before = useEditorStore.getState().document;
      const victim = before?.layers.find(l => l.id === a.id);
      remove(a.id);
      if (before && victim && useEditorStore.getState().document !== before) onRemovedRef.current?.(victim.name, before);
    }
    if (a?.layer) closeSession();
    active.current = null;
  };
  const reset = () => { camZoom.value = 1; camX.value = 0; camY.value = 0; };
  const readColors = async (point?:{x:number;y:number}):Promise<string[]> => {
    const image = await canvas.current?.makeImageSnapshotAsync();
    if (!image) return [];
    const pixels = image.readPixels(0,0);
    if (!pixels) return [];
    const w=image.width(), h=image.height();
    const colorAt=(x:number,y:number)=>{
      const idx=(Math.min(h-1,Math.max(0,y))*w+Math.min(w-1,Math.max(0,x)))*4;
      const r=pixels[idx],g=pixels[idx+1],b=pixels[idx+2];
      return `#${[r,g,b].map(v=>Math.round(v).toString(16).padStart(2,'0')).join('')}`;
    };
    if(point) return [colorAt(Math.floor(point.x*w/sizeRef.current.width),Math.floor(point.y*h/sizeRef.current.height))];
    const buckets=new Map<string,{n:number;r:number;g:number;b:number}>();
    for(let y=Math.floor(h*.08);y<h*.92;y+=Math.max(1,Math.floor(h/45)))for(let x=Math.floor(w*.08);x<w*.92;x+=Math.max(1,Math.floor(w/45))){
      const idx=(y*w+x)*4;const r=pixels[idx],g=pixels[idx+1],b=pixels[idx+2];
      if(pixels[idx+3]<120)continue;
      const key=`${r>>5}-${g>>5}-${b>>5}`;
      const a=buckets.get(key)??{n:0,r:0,g:0,b:0};a.n++;a.r+=r;a.g+=g;a.b+=b;buckets.set(key,a);
    }
    return [...buckets.values()].sort((a,b)=>b.n-a.n).slice(0,12).map(a=>`#${[a.r/a.n,a.g/a.n,a.b/a.n].map(v=>Math.round(v).toString(16).padStart(2,'0')).join('')}`);
  };
  const preparePicker = async () => {
    pickerCache.current=null;pickerColorRef.current=null;
    const token=++pickerToken.current;
    const shot=await canvas.current?.makeImageSnapshotAsync();
    const pixels=shot?.readPixels(0,0);
    if(token===pickerToken.current && shot && pixels)pickerCache.current={pixels,width:shot.width(),height:shot.height()};
  };
  const samplePicker = (x:number,y:number,force=false) => {
    if(!force && Date.now()-lastPickerSample.current<45)return;
    lastPickerSample.current=Date.now();
    const cache=pickerCache.current;
    if(!cache)return;
    const px=Math.min(cache.width-1,Math.max(0,Math.floor(x*cache.width/sizeRef.current.width)));
    const py=Math.min(cache.height-1,Math.max(0,Math.floor(y*cache.height/sizeRef.current.height)));
    const i=(py*cache.width+px)*4;
    const color='#'+[cache.pixels[i],cache.pixels[i+1],cache.pixels[i+2]].map(v=>Math.round(v).toString(16).padStart(2,'0')).join('');
    pickerColorRef.current=color;setPickerHud({x,y,color});
  };
  const finishPicker = (x:number,y:number) => {
    const color=pickerColorRef.current;
    pickerColorRef.current=null;
    setPickerHud(null);pickerCache.current=null;pickerToken.current++;
    if(color)onPickRef.current?.(color);
    else void readColors({x,y}).then(cs=>{if(cs[0])onPickRef.current?.(cs[0]);});
  };
  useImperativeHandle(ref, () => ({ snapshotBase64: async () => { const doc = useEditorStore.getState().document; return doc ? renderDocumentBase64(doc) : null; }, sampleColors:()=>readColors(), reset }));

  // One finger edits the selected object (or paints). Two fingers always navigate
  // the camera: midpoint translation + pinch zoom, independent of selected layer.
  // A second finger must not commit a partial brush stroke as a camera operation.
  const endIfActive = () => { if (active.current || pendingStroke.current || pendingMask.current || warpPointer.current || liquifyWork.current) end(); };
  const gesture = useMemo(() => {
    const pickerGesture = Gesture.Pan().runOnJS(true).minPointers(1).maxPointers(1).minDistance(0)
      .onStart(e=>{void preparePicker().then(()=>samplePicker(e.x,e.y,true));})
      .onUpdate(e=>samplePicker(e.x,e.y))
      .onEnd(e=>finishPicker(e.x,e.y))
      .onFinalize(()=>{setPickerHud(null);});
    const oneFinger = Gesture.Pan().runOnJS(true).minPointers(1).maxPointers(1).minDistance(mode === 'brush' || mode === 'mask' || mode === 'warp' || mode === 'liquify' ? 0 : 2)
      .onStart(e => { if(mode !== 'eyedropper')begin(e.x - e.translationX, e.y - e.translationY); })
      .onUpdate(e => { if(mode !== 'eyedropper') mode === 'liquify' ? liquifyMove(e.x,e.y) : mode === 'warp' ? warpDrag(e.x,e.y) : mode === 'brush' || mode === 'mask' ? drawAt(e.x, e.y) : drag(e.translationX, e.translationY); })
      .onFinalize(end);
    // Sin runOnJS: estos callbacks son worklets y escriben directamente en los valores compartidos.
    const twoFinger = Gesture.Pan().minPointers(2).averageTouches(true)
      .onStart(() => { panStart.value = { x: camX.value, y: camY.value }; runOnJS(endIfActive)(); })
      .onUpdate(e => { camX.value = panStart.value.x + e.translationX; camY.value = panStart.value.y + e.translationY; });
    const pinchGesture = Gesture.Pinch()
      .onStart(() => { zoomStart.value = camZoom.value; runOnJS(endIfActive)(); })
      .onUpdate(e => { camZoom.value = Math.max(.2, Math.min(12, zoomStart.value * e.scale)); });
    const tap = Gesture.Tap().runOnJS(true).onEnd(e => { if (mode === 'wand') { const d=toDoc(e.x,e.y); const current=useEditorStore.getState().document; const l=current?.layers.find(v=>v.id===current.selectedId); if(l?.type==='image'){const pt=toLocal(d,l);onWandRef.current?.(pt.x/l.width,pt.y/l.height);} } else if (mode === 'eyedropper') { void readColors({x:e.x,y:e.y}).then(cs=>{if(cs[0])onPickRef.current?.(cs[0]);}); } else if (mode === 'layer') {
        // Tocar un texto que ya está seleccionado abre su editor (como un doble toque).
        const d = toDoc(e.x, e.y), current = useEditorStore.getState().document;
        const hit = current ? hitTest(current.layers, d.x, d.y) : undefined;
        if (hit && hit.type === 'text' && !hit.locked && hit.id === current?.selectedId && onEditTextRef.current) { onEditTextRef.current(hit.id); return; }
        begin(e.x, e.y); end();
      } else if (mode !== 'brush' && mode !== 'warp') { begin(e.x, e.y); end(); } });
    return mode==='wand' ? Gesture.Race(Gesture.Simultaneous(twoFinger,pinchGesture),tap) : mode==='eyedropper' ? Gesture.Race(Gesture.Simultaneous(twoFinger,pinchGesture),pickerGesture) : Gesture.Race(Gesture.Simultaneous(twoFinger, pinchGesture), oneFinger, tap);
  }, [mode, document.width, document.height]);

  const keyboardVisible = useRef(false);
  useEffect(() => {
    const onShow = Keyboard.addListener('keyboardWillShow', () => { keyboardVisible.current = true; });
    const onHide = Keyboard.addListener('keyboardDidHide', () => { keyboardVisible.current = false; });
    const onShowAndroid = Keyboard.addListener('keyboardDidShow', () => { keyboardVisible.current = true; });
    return () => { onShow.remove(); onHide.remove(); onShowAndroid.remove(); };
  }, []);
  return <GestureDetector gesture={gesture}>
    <View style={styles.root} onLayout={e => { if (!keyboardVisible.current) setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height }); }}>
      <Canvas ref={canvas} style={StyleSheet.absoluteFill}>
        <Group origin={{ x: size.width / 2, y: size.height / 2 }} transform={cameraTransform}>
          <Group transform={[{ translateX: offsetX }, { translateY: offsetY }, { scale: fit }]}>
            <DocumentBackground doc={document} />
            {document.layers.map(layer => <LayerContent key={layer.id} layer={layer} selected={mode === 'layer' && layer.id === document.selectedId} previewMask={mode === 'mask' && layer.id === document.selectedId ? previewMask : null} previewStroke={mode === 'brush' && layer.id === document.selectedId ? previewStroke : null} cropPreview={cropPreview?.layerId === layer.id ? cropPreview : null} gpuWand={gpuWand?.layerId === layer.id ? gpuWand : null} liquifyPreview={liquifyPreview?.layerId === layer.id ? liquifyPreview : null} />)}
          </Group>
        </Group>
      </Canvas>
      {(mode==='warp' || mode==='liquify') && warpCursor && <View pointerEvents="none" style={{position:'absolute',left:warpCursor.x-warpCursor.radius,top:warpCursor.y-warpCursor.radius,width:warpCursor.radius*2,height:warpCursor.radius*2,borderRadius:warpCursor.radius,borderWidth:1.5,borderColor:'#18e500',backgroundColor:'rgba(24,229,0,0.07)'}}/>}
      {mode==='eyedropper' && pickerHud && <View pointerEvents="none" style={[styles.pickerHud,{left:Math.max(8,Math.min(size.width-164,pickerHud.x-72)),top:Math.max(8,pickerHud.y-125)}]}>
        <View style={[styles.pickerLens,{backgroundColor:pickerHud.color}]}><View style={styles.pickerCross}/></View>
        <View style={styles.pickerReadout}><View style={[styles.pickerSwatch,{backgroundColor:pickerHud.color}]}/><Text style={styles.pickerHex}>{pickerHud.color.toUpperCase()}</Text></View>
      </View>}
    </View>
  </GestureDetector>;
});
const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: '#17191f', overflow: 'hidden' },pickerHud:{position:'absolute',width:156,alignItems:'center',gap:7},pickerLens:{width:76,height:76,borderRadius:38,borderWidth:5,borderColor:'#fff',alignItems:'center',justifyContent:'center',shadowColor:'#000',shadowOpacity:.55,shadowRadius:8},pickerCross:{width:12,height:12,borderWidth:1.5,borderColor:'#fff',borderRadius:6},pickerReadout:{backgroundColor:'#101010',borderRadius:18,paddingVertical:7,paddingHorizontal:12,flexDirection:'row',alignItems:'center',gap:8},pickerSwatch:{width:20,height:20,borderRadius:10,borderWidth:1,borderColor:'#fff'},pickerHex:{color:'#fff',fontWeight:'700',fontSize:12} });
