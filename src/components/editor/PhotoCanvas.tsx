import React, { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Canvas, Group, Image as SkiaImage, Rect, Path, Circle, ColorMatrix, Paint, useImage, Mask } from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import type { EditorDocument, EditorLayer, ImageLayer, PaintLayer, BrushStroke, StrokePoint, MaskStroke } from '../../types/editor';
import { useEditorStore } from '../../store/useEditorStore';

export type PhotoCanvasHandle = { snapshotBase64: () => string | null; reset: () => void };
export type InteractionMode = 'layer' | 'view' | 'brush' | 'mask';
export type BrushOptions = { color: string; size: number; eraser: boolean; opacity?: number; hardness?: number; spread?: number; restore?: boolean };
type Viewport = { zoom: number; x: number; y: number; rotation: number };
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));

function adjustmentMatrix(brightness: number, contrast: number, saturation: number) {
  const c = Math.max(0, 1 + contrast), sat = Math.max(0, 1 + saturation);
  const lr = .2126 * (1 - sat), lg = .7152 * (1 - sat), lb = .0722 * (1 - sat);
  const b = brightness * 255 + 128 * (1 - c);
  return [c*(lr+sat),c*lg,c*lb,0,b, c*lr,c*(lg+sat),c*lb,0,b, c*lr,c*lg,c*(lb+sat),0,b, 0,0,0,1,0];
}
function StrokeShape({ stroke }: { stroke: BrushStroke }) {
  if (!stroke.points.length) return null;
  const p = stroke.points;
  const d = p.length === 1 ? `M ${p[0].x} ${p[0].y} l 0.01 0` : `M ${p[0].x} ${p[0].y} ` + p.slice(1).map(v => `L ${v.x} ${v.y}`).join(' ');
  return <Path path={d} color={stroke.color} style="stroke" strokeWidth={stroke.size} strokeCap="round" strokeJoin="round" opacity={stroke.opacity ?? 1} blendMode={stroke.eraser ? 'dstOut' : 'srcOver'} />;
}
function PaintContent({ layer }: { layer: PaintLayer }) {
  return <Group layer>{layer.strokes.map(stroke => <StrokeShape key={stroke.id} stroke={stroke} />)}</Group>;
}
function MaskPath({ stroke }: { stroke: MaskStroke }) {
  const p = stroke.points;
  if (!p.length) return null;
  const d = p.length === 1 ? `M ${p[0].x} ${p[0].y} l .01 0` : `M ${p[0].x} ${p[0].y} ` + p.slice(1).map(v => `L ${v.x} ${v.y}`).join(' ');
  return <Path path={d} style="stroke" strokeWidth={stroke.radius * 2} strokeCap="round" strokeJoin="round" color={stroke.restore ? '#ffffff' : '#000000'} opacity={stroke.opacity} />;
}
function ImageContent({ layer, preview }: { layer: ImageLayer; preview?: MaskStroke | null }) {
  const image = useImage(layer.uri);
  if (!image) return null;
  const content = <Group layer={layer.adjustments ? <Paint><ColorMatrix matrix={adjustmentMatrix(layer.adjustments.brightness, layer.adjustments.contrast, layer.adjustments.saturation)} /></Paint> : undefined}><SkiaImage image={image} x={0} y={0} width={layer.width} height={layer.height} fit="fill" /></Group>;
  const strokes = [...(layer.maskStrokes ?? []), ...(preview ? [preview] : [])];
  if (!strokes.length) return content;
  return <Mask mode="luminance" mask={<Group><Rect x={0} y={0} width={layer.width} height={layer.height} color="white" />{strokes.map(st => <MaskPath key={st.id} stroke={st} />)}</Group>}>{content}</Mask>;
}
function LayerContent({ layer, selected, previewMask }: { layer: EditorLayer; selected: boolean; previewMask?: MaskStroke | null }) {
  if (!layer.visible) return null;
  const transform = [
    { translateX: layer.x + layer.width / 2 }, { translateY: layer.y + layer.height / 2 },
    { rotate: layer.rotation }, { translateX: -layer.width / 2 }, { translateY: -layer.height / 2 },
  ];
  return <Group transform={transform}>
    <Group opacity={layer.opacity}>
      {layer.type === 'image' ? <ImageContent layer={layer} preview={previewMask} /> : layer.type === 'paint' ? <PaintContent layer={layer} /> : <Rect x={0} y={0} width={layer.width} height={layer.height} color={layer.color} />}
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

export const PhotoCanvas = forwardRef<PhotoCanvasHandle, { document: EditorDocument; mode: InteractionMode; brush?: BrushOptions }>(function PhotoCanvas({ document, mode, brush = { color: '#ff508e', size: 20, eraser: false } }, ref) {
  const canvas = useRef<React.ElementRef<typeof Canvas>>(null);
  const [size, setSize] = useState({ width: 1, height: 1 });
  const [viewport, setViewport] = useState<Viewport>({ zoom: 1, x: 0, y: 0, rotation: 0 });
  const vpRef = useRef(viewport);
  const sizeRef = useRef(size);
  const modeRef = useRef(mode);
  vpRef.current = viewport;
  sizeRef.current = size;
  modeRef.current = mode;
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
    return { x: dx * c + dy * s + layer.width / 2, y: -dx * s + dy * c + layer.height / 2 };
  };
  const begin = (x: number, y: number) => {
    if (active.current) return;
    const d = toDoc(x, y);
    if (modeRef.current === 'mask') {
      const current = useEditorStore.getState().document;
      const image = current?.layers.find(l => l.id === current.selectedId && l.type === 'image');
      if (!image || image.type !== 'image') return;
      const local = toLocal(d, image);
      pendingMask.current = { id: image.id, points: [local] };
      beginEdit();
      setPreviewMask({ id: 'preview', points: [local], radius: brushRef.current.size, opacity: brushRef.current.opacity ?? 1, spread: brushRef.current.spread ?? 20, restore: !!brushRef.current.restore });
      return;
    }
    if (modeRef.current === 'brush') {
      const current = useEditorStore.getState().document;
      const paint = current?.layers.find(l => l.id === current.selectedId && l.type === 'paint');
      if (!paint || paint.type !== 'paint') return;
      const local = toLocal(d, paint);
      pendingStroke.current = { id: paint.id, points: [local] };
      beginEdit();
      setPreviewStroke({ id: 'preview', points: [local], ...brushRef.current });
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
      if (Math.hypot(p.x-last.x, p.y-last.y) < Math.max(1, brushRef.current.size * (brushRef.current.spread ?? 20) / 100)) return;
      mask.points.push(p);
      setPreviewMask({ id: 'preview', points: [...mask.points], radius: brushRef.current.size, opacity: brushRef.current.opacity ?? 1, spread: brushRef.current.spread ?? 20, restore: !!brushRef.current.restore });
      return;
    }

    const pending = pendingStroke.current;
    if (!pending) return;
    const layer = useEditorStore.getState().document?.layers.find(l => l.id === pending.id);
    if (!layer) return;
    const p = toLocal(toDoc(x, y), layer);
    const last = pending.points[pending.points.length - 1];
    if (Math.hypot(p.x-last.x, p.y-last.y) < 1) return;
    pending.points.push(p);
    setPreviewStroke({ id: 'preview', points: [...pending.points], ...brushRef.current });
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
      appendMaskStroke(m.id, { id: `${Date.now()}-${Math.random()}`, points: m.points, radius: brushRef.current.size, opacity: brushRef.current.opacity ?? 1, spread: brushRef.current.spread ?? 20, restore: !!brushRef.current.restore });
      pendingMask.current = null;
      setPreviewMask(null);
      finishEdit();
    }

    const pending = pendingStroke.current;
    if (pending) {
      appendStroke(pending.id, { id: `${Date.now()}-${Math.random()}`, points: pending.points, ...brushRef.current });
      pendingStroke.current = null;
      setPreviewStroke(null);
      finishEdit();
    }
    if (active.current?.layer) finishEdit();
    active.current = null;
  };
  const reset = () => { const next = { zoom: 1, x: 0, y: 0, rotation: 0 }; vpRef.current = next; setViewport(next); };
  useImperativeHandle(ref, () => ({ snapshotBase64: () => canvas.current?.makeImageSnapshot()?.encodeToBase64() ?? null, reset }));

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
    const oneFinger = Gesture.Pan().runOnJS(true).minPointers(1).maxPointers(1).minDistance(mode === 'brush' || mode === 'mask' ? 0 : 2)
      .onStart(e => begin(e.x - e.translationX, e.y - e.translationY))
      .onUpdate(e => mode === 'brush' || mode === 'mask' ? drawAt(e.x, e.y) : drag(e.translationX, e.translationY))
      .onFinalize(end);
    const twoFinger = Gesture.Pan().runOnJS(true).minPointers(2).averageTouches(true)
      .onStart(() => cameraStart())
      .onUpdate(e => cameraUpdate({ panX: e.translationX, panY: e.translationY }))
      .onFinalize(() => { camera.current = null; });
    const pinchGesture = Gesture.Pinch().runOnJS(true)
      .onStart(() => cameraStart())
      .onUpdate(e => cameraUpdate({ scale: e.scale }))
      .onFinalize(() => { camera.current = null; });
    const tap = Gesture.Tap().runOnJS(true).onEnd(e => { if (mode !== 'brush') { begin(e.x, e.y); end(); } });
    return Gesture.Race(Gesture.Simultaneous(twoFinger, pinchGesture), oneFinger, tap);
  }, [mode, document.width, document.height]);

  return <GestureDetector gesture={gesture}>
    <View style={styles.root} onLayout={e => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}>
      <Canvas ref={canvas} style={StyleSheet.absoluteFill}>
        <Group origin={{ x: size.width / 2, y: size.height / 2 }} transform={[{ translateX: viewport.x }, { translateY: viewport.y }, { scale: viewport.zoom }, { rotate: viewport.rotation }]}>
          <Group transform={[{ translateX: offsetX }, { translateY: offsetY }, { scale: fit }]}>
            <Rect x={0} y={0} width={document.width} height={document.height} color="#ffffff" />
            {document.layers.map(layer => <React.Fragment key={layer.id}><LayerContent layer={layer} selected={mode === 'layer' && layer.id === document.selectedId} previewMask={mode === 'mask' && layer.id === document.selectedId ? previewMask : null} />{mode === 'brush' && previewStroke && layer.id === document.selectedId && layer.type === 'paint' && <Group transform={[{ translateX: layer.x + layer.width/2 }, { translateY: layer.y + layer.height/2 }, { rotate: layer.rotation }, { translateX: -layer.width/2 }, { translateY: -layer.height/2 }]}><StrokeShape stroke={previewStroke} /></Group>}</React.Fragment>)}
          </Group>
        </Group>
      </Canvas>
    </View>
  </GestureDetector>;
});
const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: '#17191f', overflow: 'hidden' } });
