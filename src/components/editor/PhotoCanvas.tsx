import React, { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { Canvas, Group, Image as SkiaImage, Rect, Path, Circle, ColorMatrix, Paint, useImage, Mask, Skia, BlurMask, drawAsImage, Shader, ImageShader } from '@shopify/react-native-skia';
import type { SkImage } from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import type { EditorDocument, EditorLayer, ImageLayer, PaintLayer, BrushStroke, StrokePoint, MaskStroke } from '../../types/editor';
import { useEditorStore } from '../../store/useEditorStore';
import { getMemMask, isMemMask, loadMaskImage } from '../../services/maskStore';

export type PhotoCanvasHandle = { snapshotBase64: () => Promise<string | null>; sampleColors: () => Promise<string[]>; reset: () => void };
export type InteractionMode = 'layer' | 'view' | 'brush' | 'mask' | 'eyedropper' | 'wand';
export type BrushOptions = { color: string; size: number; eraser: boolean; opacity?: number; hardness?: number; spread?: number; restore?: boolean };
type Viewport = { zoom: number; x: number; y: number; rotation: number };
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));

function adjustmentMatrix(brightness: number, contrast: number, saturation: number) {
  const c = Math.max(0, 1 + contrast), sat = Math.max(0, 1 + saturation);
  const lr = .2126 * (1 - sat), lg = .7152 * (1 - sat), lb = .0722 * (1 - sat);
  // Skia's ColorMatrix offset column is normalized 0..1 (NOT 0..255). Contrast pivots around mid-gray (0.5).
  const b = brightness + .5 * (1 - c);
  return [c*(lr+sat),c*lg,c*lb,0,b, c*lr,c*(lg+sat),c*lb,0,b, c*lr,c*lg,c*(lb+sat),0,b, 0,0,0,1,0];
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
   else {
     float line = floor(xy.y / max(1.0, 5.0 - amount * 4.0));
     uv.x += (mod(line, 2.0) * 2.0 - 1.0) * strength * 30.0;
   }
   return sampleAt(uv);
 }
`);
// Reemplazo cromático suave, calculado en GPU. Conserva luminancia y alfa.
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
function MaskPath({ stroke }: { stroke: MaskStroke }) {
  return <BrushPath points={stroke.points} width={stroke.radius * 2} color={stroke.restore ? '#ffffff' : '#000000'} opacity={stroke.opacity} softness={softnessOf(stroke.spread, stroke.hardness)} />;
}
function ImageContent({ layer, preview, preloaded, preloadedMask, gpuWand }: { layer: ImageLayer; preview?: MaskStroke | null; preloaded?: SkImage; preloadedMask?: SkImage; gpuWand?: {layerId:string; x:number; y:number; tolerance:number; feather:number} | null }) {
  // Las máscaras en memoria (mem-mask:) no pasan por disco ni por useImage: no hay parpadeo al cambiar de máscara.
  const memMask = isMemMask(layer.magicMaskUri) ? getMemMask(layer.magicMaskUri) : null;
  const wandMaskLoaded = useImage(isMemMask(layer.magicMaskUri) ? null : layer.magicMaskUri ?? null);
  const wandMask = preloadedMask ?? memMask ?? wandMaskLoaded;
  const loaded = useImage(preloaded ? null : layer.uri);
  const image = preloaded ?? loaded;
  if (!image) return null;
  // Attach the color filter to the image's own paint rather than an offscreen
  // Group layer. An offscreen layer with a nested Paint was rendering black on iOS.
  const adj = layer.adjustments;
  const hasAdjustments = !!adj && (Math.abs(adj.brightness ?? 0) > 0.0001 || Math.abs(adj.contrast ?? 0) > 0.0001 || Math.abs(adj.saturation ?? 0) > 0.0001);
  const glitch = layer.glitchSettings ?? (layer.glitch ? { mode: 3, intensity: layer.glitch, density: 0.65, seed: 1337 } : null);
  const content = glitch && glitch.mode > 0 && glitchEffect ? (
    <Rect x={0} y={0} width={layer.width} height={layer.height}>
      <Shader source={glitchEffect} uniforms={{dimensions:[layer.width,layer.height],mode:glitch.mode,intensity:glitch.intensity,density:glitch.density,seed:glitch.seed}}>
        <ImageShader image={image} x={0} y={0} width={layer.width} height={layer.height} fit="fill" />
      </Shader>
    </Rect>
  ) : (
    <SkiaImage image={image} x={0} y={0} width={layer.width} height={layer.height} fit="fill">
      {hasAdjustments && <ColorMatrix matrix={adjustmentMatrix(adj!.brightness ?? 0, adj!.contrast ?? 0, adj!.saturation ?? 0)} />}
    </SkiaImage>
  );
  const recolor=layer.colorReplace;
  const recolored = recolor && replaceColorEffect ? <Rect x={0} y={0} width={layer.width} height={layer.height}>
    <Shader source={replaceColorEffect} uniforms={{sourceColor:rgb(recolor.source),targetColor:rgb(recolor.target),tolerance:recolor.tolerance,softness:recolor.softness,strength:recolor.strength}}>
      <ImageShader image={image} x={0} y={0} width={layer.width} height={layer.height} fit="fill" />
    </Shader>
  </Rect> : content;
  const strokes = [...(layer.maskStrokes ?? []), ...(preview ? [preview] : [])];
  const gpu = gpuWand?.layerId === layer.id && wandEffect ? gpuWand : null;
  const gpuMask = gpu ? <Rect x={0} y={0} width={layer.width} height={layer.height}>
    <Shader source={wandEffect!} uniforms={{dimensions:[layer.width,layer.height],seed:[gpu.x,gpu.y],tolerance:gpu.tolerance/100,feather:gpu.feather/100}}>
      <ImageShader image={image} x={0} y={0} width={layer.width} height={layer.height} fit="fill" />
    </Shader>
  </Rect> : null;
  if (!strokes.length && !layer.magicMaskUri && !gpu) return recolored;
  return <Mask mode="alpha" mask={<Group>{gpuMask ?? (wandMask ? <SkiaImage image={wandMask} x={0} y={0} width={layer.width} height={layer.height} fit="fill" /> : <Rect x={0} y={0} width={layer.width} height={layer.height} color="white" />)}{strokes.map(st => <MaskPath key={st.id} stroke={st} />)}</Group>}>{recolored}</Mask>;
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
function LayerContent({ layer, selected, previewMask, previewStroke, images, cropPreview, gpuWand }: { layer: EditorLayer; selected: boolean; previewMask?: MaskStroke | null; previewStroke?: BrushStroke | null; images?: Record<string, SkImage>; cropPreview?: CropPreview | null; gpuWand?: {layerId:string;x:number;y:number;tolerance:number;feather:number}|null }) {
  if (!layer.visible) return null;
  const flipX = layer.type === 'image' && !!layer.flipX;
  const transform = [
    { translateX: layer.x + layer.width / 2 }, { translateY: layer.y + layer.height / 2 },
    { rotate: layer.rotation }, { translateX: -layer.width / 2 }, { translateY: -layer.height / 2 },
  ];
  return <Group transform={transform}>
    <Group opacity={layer.opacity}>
      {/* flipX mirrors only the content (image + mask + crop overlay); selection handles below stay upright. */}
      <Group transform={flipX ? [{ translateX: layer.width / 2 }, { scaleX: -1 }, { translateX: -layer.width / 2 }] : undefined}>
        {layer.type === 'image' ? (() => {
          const crop = cropPreview && cropPreview.layerId === layer.id ? cropPreview : null;
          let body = <ImageContent layer={layer} preview={previewMask} preloaded={images?.[layer.id]} preloadedMask={images?.[`${layer.id}:mask`]} gpuWand={gpuWand} />;
          // Straighten preview: the image turns under the fixed crop rectangle.
          if (crop && crop.angle) body = <Group transform={[{ translateX: layer.width / 2 }, { translateY: layer.height / 2 }, { rotate: crop.angle }, { translateX: -layer.width / 2 }, { translateY: -layer.height / 2 }]}>{body}</Group>;
          const projected = (layer.perspectiveX || layer.perspectiveY) ? <Group matrix={perspectiveMatrix(layer.width,layer.height,layer.perspectiveX??0,layer.perspectiveY??0)}>{body}{crop && <CropOverlay width={layer.width} height={layer.height} rect={crop.rect} />}</Group> : <>{body}{crop && <CropOverlay width={layer.width} height={layer.height} rect={crop.rect} />}</>;
          return projected;
        })() : layer.type === 'paint' ? <PaintContent layer={layer} preview={previewStroke} /> : <Rect x={0} y={0} width={layer.width} height={layer.height} color={layer.color} />}
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
}
// Offscreen scene for export: document coordinates only (no viewport, no selection handles), clipped to the document.
const MAX_EXPORT_SIDE = 4096;
function ExportScene({ doc, images, scale, transparent = false }: { doc: EditorDocument; images: Record<string, SkImage>; scale: number; transparent?: boolean }) {
  return <Group transform={[{ scale }]}>
    <Group clip={{ x: 0, y: 0, width: doc.width, height: doc.height }}>
      {!transparent && <Rect x={0} y={0} width={doc.width} height={doc.height} color="#ffffff" />}
      {doc.layers.map(layer => <LayerContent key={layer.id} layer={layer} selected={false} images={images} />)}
    </Group>
  </Group>;
}
async function renderDocumentBase64(doc: EditorDocument): Promise<string> {
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
/** Exports a single masked image as an actual transparent PNG for the sticker library. */
export async function renderStickerBase64(layer: ImageLayer): Promise<{ base64: string; width: number; height: number }> {
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

export const PhotoCanvas = forwardRef<PhotoCanvasHandle, { document: EditorDocument; mode: InteractionMode; brush?: BrushOptions; onPickColor?: (color:string)=>void; onWandPick?: (x:number,y:number)=>void; cropPreview?: CropPreview | null; gpuWand?: {layerId:string;x:number;y:number;tolerance:number;feather:number}|null }>(function PhotoCanvas({ document, mode, gpuWand, brush = { color: '#ff508e', size: 20, eraser: false }, onPickColor, onWandPick, cropPreview }, ref) {
  const canvas = useRef<React.ElementRef<typeof Canvas>>(null);
  const [pickerHud,setPickerHud]=useState<{x:number;y:number;color:string}|null>(null);
  const pickerCache=useRef<{pixels:Uint8Array|Uint8ClampedArray;width:number;height:number}|null>(null);
  const pickerToken=useRef(0);
  const pickerColorRef=useRef<string|null>(null);
  const lastPickerSample=useRef(0);

  const [size, setSize] = useState({ width: 1, height: 1 });
  const [viewport, setViewport] = useState<Viewport>({ zoom: 1, x: 0, y: 0, rotation: 0 });
  const vpRef = useRef(viewport);
  const sizeRef = useRef(size);
  const modeRef = useRef(mode);
  vpRef.current = viewport;
  sizeRef.current = size;
  modeRef.current = mode;
  const onWandRef = useRef(onWandPick); onWandRef.current = onWandPick;
  const onPickRef = useRef(onPickColor);
  onPickRef.current = onPickColor;
  const brushRef = useRef(brush);
  brushRef.current = brush;
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
  const fit = Math.min(size.width / document.width, size.height / document.height);
  const offsetX = (size.width - document.width * fit) / 2;
  const offsetY = (size.height - document.height * fit) / 2;

  const toDoc = (px: number, py: number) => {
    const vp = vpRef.current, sz = sizeRef.current;
    const dx = px - sz.width / 2 - vp.x, dy = py - sz.height / 2 - vp.y;
    const c = Math.cos(vp.rotation), s = Math.sin(vp.rotation);
    const ux = (dx * c + dy * s) / vp.zoom + sz.width / 2;
    const uy = (-dx * s + dy * c) / vp.zoom + sz.height / 2;
    const f = Math.min(sz.width / document.width, sz.height / document.height);
    return { x: (ux - (sz.width - document.width * f) / 2) / f, y: (uy - (sz.height - document.height * f) / 2) / f };
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
  const begin = (x: number, y: number) => {
    if (active.current) return;
    const d = toDoc(x, y);
    if (modeRef.current === 'wand') return;
    if (modeRef.current === 'mask') {
      const current = useEditorStore.getState().document;
      const image = current?.layers.find(l => l.id === current.selectedId && l.type === 'image');
      if (!image || image.type !== 'image') return;
      const local = toLocal(d, image);
      pendingMask.current = { id: image.id, points: [local] };
      beginEdit();
      setPreviewMask(makeMask('preview', [local]));
      return;
    }
    if (modeRef.current === 'brush') {
      const current = useEditorStore.getState().document;
      const paint = current?.layers.find(l => l.id === current.selectedId && l.type === 'paint');
      if (!paint || paint.type !== 'paint') return;
      const local = toLocal(d, paint);
      pendingStroke.current = { id: paint.id, points: [local] };
      beginEdit();
      setPreviewStroke(makeStroke('preview', [local]));
      return;
    }
    const current = useEditorStore.getState().document;
    const selected = current?.layers.find(l => l.id === current.selectedId);
    let handle: string | undefined;
    if (selected && modeRef.current === 'layer') {
      const cx=selected.x+selected.width/2,cy=selected.y+selected.height/2;
      const dx=d.x-cx,dy=d.y-cy,c=Math.cos(selected.rotation),sn=Math.sin(selected.rotation);
      const lx=dx*c+dy*sn+selected.width/2,ly=-dx*sn+dy*c+selected.height/2;
      const radius=22/Math.max(.15, vpRef.current.zoom * Math.min(sizeRef.current.width/document.width,sizeRef.current.height/document.height));
      const handles:[string,number,number][]=[
        ['delete',0,0],['rotate',selected.width,0],['uniform',selected.width,selected.height],
        ['n',selected.width/2,0],['e',selected.width,selected.height/2],
        ['s',selected.width/2,selected.height],['w',0,selected.height/2]
      ];
      handle=handles.find(([,hx,hy])=>Math.hypot(lx-hx,ly-hy)<radius)?.[0];
    }
    if (handle === 'delete' && selected) { remove(selected.id); return; }
    const hit = handle ? selected : modeRef.current === 'layer' && current ? hitTest(current.layers, d.x, d.y) : undefined;
    if (modeRef.current === 'layer') select(hit?.id ?? null);
    if (hit) beginEdit();
    active.current = { id: hit?.id ?? null, layer: hit ? { ...hit } : null, vp: { ...vpRef.current }, lastX: d.x, lastY: d.y, zoom: 1, rotation: 0, changed: false, handle, startPoint:d };
  };
  const drawAt = (x: number, y: number) => {
    const mask = pendingMask.current;
    if (mask) {
      const layer = useEditorStore.getState().document?.layers.find(l => l.id === mask.id);
      if (!layer) return;
      const p = toLocal(toDoc(x, y), layer);
      const last = mask.points[mask.points.length - 1];
      if (Math.hypot(p.x-last.x, p.y-last.y) < .75) return;
      mask.points.push(p);
      setPreviewMask(makeMask('preview', [...mask.points]));
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
    setPreviewStroke(makeStroke('preview', [...pending.points]));
  };
  const drag = (dx: number, dy: number) => {
    const a = active.current;
    if (!a) return;
    if (modeRef.current === 'layer' && a.layer && a.id) {
      const vp = a.vp, f = Math.min(sizeRef.current.width / document.width, sizeRef.current.height / document.height);
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
    if (pendingMask.current) {
      const m = pendingMask.current;
      appendMaskStroke(m.id, makeMask(uid(), m.points));
      pendingMask.current = null;
      setPreviewMask(null);
      finishEdit();
    }

    const pending = pendingStroke.current;
    if (pending) {
      appendStroke(pending.id, makeStroke(uid(), pending.points));
      pendingStroke.current = null;
      setPreviewStroke(null);
      finishEdit();
    }
    if (active.current?.layer) finishEdit();
    active.current = null;
  };
  const reset = () => { const next = { zoom: 1, x: 0, y: 0, rotation: 0 }; vpRef.current = next; setViewport(next); };
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
  const camera = useRef<{ vp: Viewport; panX: number; panY: number; scale: number } | null>(null);
  const cameraStart = () => {
    if (!camera.current) camera.current = { vp: { ...vpRef.current }, panX: 0, panY: 0, scale: 1 };
    // A second finger must not commit a partial brush stroke as a camera operation.
    if (active.current) end();
  };
  const cameraUpdate = (patch: { panX?: number; panY?: number; scale?: number }) => {
    const c = camera.current;
    if (!c) return;
    Object.assign(c, patch);
    const next = { ...c.vp, x: c.vp.x + c.panX, y: c.vp.y + c.panY, zoom: clamp(c.vp.zoom * c.scale, .2, 12) };
    vpRef.current = next;
    setViewport(next);
  };
  const gesture = useMemo(() => {
    const pickerGesture = Gesture.Pan().runOnJS(true).minPointers(1).maxPointers(1).minDistance(0)
      .onStart(e=>{void preparePicker().then(()=>samplePicker(e.x,e.y,true));})
      .onUpdate(e=>samplePicker(e.x,e.y))
      .onEnd(e=>finishPicker(e.x,e.y))
      .onFinalize(()=>{setPickerHud(null);});
    const oneFinger = Gesture.Pan().runOnJS(true).minPointers(1).maxPointers(1).minDistance(mode === 'brush' || mode === 'mask' ? 0 : 2)
      .onStart(e => { if(mode !== 'eyedropper')begin(e.x - e.translationX, e.y - e.translationY); })
      .onUpdate(e => { if(mode !== 'eyedropper') mode === 'brush' || mode === 'mask' ? drawAt(e.x, e.y) : drag(e.translationX, e.translationY); })
      .onFinalize(end);
    const twoFinger = Gesture.Pan().runOnJS(true).minPointers(2).averageTouches(true)
      .onStart(() => cameraStart())
      .onUpdate(e => cameraUpdate({ panX: e.translationX, panY: e.translationY }))
      .onFinalize(() => { camera.current = null; });
    const pinchGesture = Gesture.Pinch().runOnJS(true)
      .onStart(() => cameraStart())
      .onUpdate(e => cameraUpdate({ scale: e.scale }))
      .onFinalize(() => { camera.current = null; });
    const tap = Gesture.Tap().runOnJS(true).onEnd(e => { if (mode === 'wand') { const d=toDoc(e.x,e.y); const current=useEditorStore.getState().document; const l=current?.layers.find(v=>v.id===current.selectedId); if(l?.type==='image'){const pt=toLocal(d,l);onWandRef.current?.(pt.x/l.width,pt.y/l.height);} } else if (mode === 'eyedropper') { void readColors({x:e.x,y:e.y}).then(cs=>{if(cs[0])onPickRef.current?.(cs[0]);}); } else if (mode !== 'brush') { begin(e.x, e.y); end(); } });
    return mode==='wand' ? Gesture.Race(Gesture.Simultaneous(twoFinger,pinchGesture),tap) : mode==='eyedropper' ? Gesture.Race(Gesture.Simultaneous(twoFinger,pinchGesture),pickerGesture) : Gesture.Race(Gesture.Simultaneous(twoFinger, pinchGesture), oneFinger, tap);
  }, [mode, document.width, document.height]);

  return <GestureDetector gesture={gesture}>
    <View style={styles.root} onLayout={e => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}>
      <Canvas ref={canvas} style={StyleSheet.absoluteFill}>
        <Group origin={{ x: size.width / 2, y: size.height / 2 }} transform={[{ translateX: viewport.x }, { translateY: viewport.y }, { scale: viewport.zoom }, { rotate: viewport.rotation }]}>
          <Group transform={[{ translateX: offsetX }, { translateY: offsetY }, { scale: fit }]}>
            <Rect x={0} y={0} width={document.width} height={document.height} color="#ffffff" />
            {document.layers.map(layer => <LayerContent key={layer.id} layer={layer} selected={mode === 'layer' && layer.id === document.selectedId} previewMask={mode === 'mask' && layer.id === document.selectedId ? previewMask : null} previewStroke={mode === 'brush' && layer.id === document.selectedId ? previewStroke : null} cropPreview={cropPreview} gpuWand={gpuWand} />)}
          </Group>
        </Group>
      </Canvas>
      {mode==='eyedropper' && pickerHud && <View pointerEvents="none" style={[styles.pickerHud,{left:Math.max(8,Math.min(size.width-164,pickerHud.x-72)),top:Math.max(8,pickerHud.y-125)}]}>
        <View style={[styles.pickerLens,{backgroundColor:pickerHud.color}]}><View style={styles.pickerCross}/></View>
        <View style={styles.pickerReadout}><View style={[styles.pickerSwatch,{backgroundColor:pickerHud.color}]}/><Text style={styles.pickerHex}>{pickerHud.color.toUpperCase()}</Text></View>
      </View>}
    </View>
  </GestureDetector>;
});
const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: '#17191f', overflow: 'hidden' },pickerHud:{position:'absolute',width:156,alignItems:'center',gap:7},pickerLens:{width:76,height:76,borderRadius:38,borderWidth:5,borderColor:'#fff',alignItems:'center',justifyContent:'center',shadowColor:'#000',shadowOpacity:.55,shadowRadius:8},pickerCross:{width:12,height:12,borderWidth:1.5,borderColor:'#fff',borderRadius:6},pickerReadout:{backgroundColor:'#101010',borderRadius:18,paddingVertical:7,paddingHorizontal:12,flexDirection:'row',alignItems:'center',gap:8},pickerSwatch:{width:20,height:20,borderRadius:10,borderWidth:1,borderColor:'#fff'},pickerHex:{color:'#fff',fontWeight:'700',fontSize:12} });
