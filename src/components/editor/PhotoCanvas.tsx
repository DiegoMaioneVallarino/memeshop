import React, { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Canvas, Group, Image as SkiaImage, Rect, useImage } from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import type { EditorDocument, EditorLayer, ImageLayer } from '../../types/editor';
import { useEditorStore } from '../../store/useEditorStore';

export type PhotoCanvasHandle = { snapshotBase64: () => string | null; reset: () => void };
export type InteractionMode = 'layer' | 'view';
type Viewport = { zoom: number; x: number; y: number; rotation: number };
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));

function ImageContent({ layer }: { layer: ImageLayer }) {
  const image = useImage(layer.uri);
  return image ? <SkiaImage image={image} x={0} y={0} width={layer.width} height={layer.height} fit="fill" /> : null;
}
function LayerContent({ layer, selected }: { layer: EditorLayer; selected: boolean }) {
  if (!layer.visible) return null;
  const transform = [
    { translateX: layer.x + layer.width / 2 }, { translateY: layer.y + layer.height / 2 },
    { rotate: layer.rotation }, { translateX: -layer.width / 2 }, { translateY: -layer.height / 2 },
  ];
  return <Group transform={transform}>
    <Group opacity={layer.opacity}>
      {layer.type === 'image' ? <ImageContent layer={layer} /> : <Rect x={0} y={0} width={layer.width} height={layer.height} color={layer.color} />}
    </Group>
    {selected && <Group>
      <Rect x={0} y={0} width={layer.width} height={layer.height} color="#a78bfa" style="stroke" strokeWidth={Math.max(1, Math.min(layer.width, layer.height) / 180)} />
      {[[0, 0], [layer.width, 0], [0, layer.height], [layer.width, layer.height]].map(([x, y], i) =>
        <Rect key={i} x={x - 5} y={y - 5} width={10} height={10} color="#ffffff" />)}
    </Group>}
  </Group>;
}
function hitTest(layers: EditorLayer[], x: number, y: number): EditorLayer | undefined {
  for (let i = layers.length - 1; i >= 0; i--) {
    const l = layers[i];
    if (!l.visible || l.opacity === 0) continue;
    const cx = l.x + l.width / 2, cy = l.y + l.height / 2;
    const dx = x - cx, dy = y - cy, c = Math.cos(l.rotation), s = Math.sin(l.rotation);
    const lx = dx * c + dy * s, ly = -dx * s + dy * c;
    if (Math.abs(lx) <= l.width / 2 && Math.abs(ly) <= l.height / 2) return l;
  }
}

export const PhotoCanvas = forwardRef<PhotoCanvasHandle, { document: EditorDocument; mode: InteractionMode }>(function PhotoCanvas({ document, mode }, ref) {
  const canvas = useRef<React.ElementRef<typeof Canvas>>(null);
  const [size, setSize] = useState({ width: 1, height: 1 });
  const [viewport, setViewport] = useState<Viewport>({ zoom: 1, x: 0, y: 0, rotation: 0 });
  const vpRef = useRef(viewport);
  const sizeRef = useRef(size);
  const modeRef = useRef(mode);
  vpRef.current = viewport;
  sizeRef.current = size;
  modeRef.current = mode;
  const active = useRef<{ id: string | null; layer: EditorLayer | null; vp: Viewport; lastX: number; lastY: number; zoom: number; rotation: number; changed: boolean } | null>(null);
  const select = useEditorStore(s => s.select);
  const update = useEditorStore(s => s.update);
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
  const begin = (x: number, y: number) => {
    if (active.current) return;
    const d = toDoc(x, y);
    const current = useEditorStore.getState().document;
    const hit = modeRef.current === 'layer' && current ? hitTest(current.layers, d.x, d.y) : undefined;
    if (modeRef.current === 'layer') select(hit?.id ?? null);
    if (hit) beginEdit();
    active.current = { id: hit?.id ?? null, layer: hit ? { ...hit } : null, vp: { ...vpRef.current }, lastX: d.x, lastY: d.y, zoom: 1, rotation: 0, changed: false };
  };
  const drag = (dx: number, dy: number) => {
    const a = active.current;
    if (!a) return;
    if (modeRef.current === 'layer' && a.layer && a.id) {
      const vp = a.vp, f = Math.min(sizeRef.current.width / document.width, sizeRef.current.height / document.height);
      const c = Math.cos(vp.rotation), s = Math.sin(vp.rotation);
      const x = (dx * c + dy * s) / (f * vp.zoom), y = (-dx * s + dy * c) / (f * vp.zoom);
      update(a.id, { x: a.layer.x + x, y: a.layer.y + y });
      a.changed = true;
    } else {
      const next = { ...a.vp, x: a.vp.x + dx, y: a.vp.y + dy };
      vpRef.current = next; setViewport(next);
    }
  };
  const pinch = (scale: number) => {
    const a = active.current;
    if (!a) return;
    a.zoom = scale;
    if (modeRef.current === 'layer' && a.layer && a.id) {
      const factor = clamp(scale, .1, 10);
      const w = a.layer.width * factor, h = a.layer.height * factor;
      update(a.id, { width: w, height: h, x: a.layer.x + (a.layer.width - w) / 2, y: a.layer.y + (a.layer.height - h) / 2 });
      a.changed = true;
    } else {
      const next = { ...vpRef.current, zoom: clamp(a.vp.zoom * scale, .2, 12) };
      vpRef.current = next; setViewport(next);
    }
  };
  const rotate = (angle: number) => {
    const a = active.current;
    if (!a) return;
    a.rotation = angle;
    if (modeRef.current === 'layer' && a.layer && a.id) {
      update(a.id, { rotation: a.layer.rotation + angle }); a.changed = true;
    } else {
      const next = { ...vpRef.current, rotation: a.vp.rotation + angle };
      vpRef.current = next; setViewport(next);
    }
  };
  const end = () => { if (active.current?.layer) finishEdit(); active.current = null; };
  const reset = () => { const next = { zoom: 1, x: 0, y: 0, rotation: 0 }; vpRef.current = next; setViewport(next); };
  useImperativeHandle(ref, () => ({ snapshotBase64: () => canvas.current?.makeImageSnapshot()?.encodeToBase64() ?? null, reset }));

  // All gestures share one transaction. runOnJS ensures Zustand updates stay on JS thread.
  const gesture = useMemo(() => {
    const pan = Gesture.Pan().runOnJS(true).minDistance(3)
      .onStart(e => begin(e.x - e.translationX, e.y - e.translationY))
      .onUpdate(e => drag(e.translationX, e.translationY))
      .onFinalize(end);
    const zoom = Gesture.Pinch().runOnJS(true)
      .onStart(e => begin(e.focalX, e.focalY))
      .onUpdate(e => pinch(e.scale))
      .onFinalize(end);
    const rotation = Gesture.Rotation().runOnJS(true)
      .onStart(e => begin(e.anchorX, e.anchorY))
      .onUpdate(e => rotate(e.rotation))
      .onFinalize(end);
    const tap = Gesture.Tap().runOnJS(true).onEnd(e => { begin(e.x, e.y); end(); });
    return Gesture.Race(Gesture.Simultaneous(zoom, rotation), pan, tap);
  }, [mode, document.width, document.height]);

  return <GestureDetector gesture={gesture}>
    <View style={styles.root} onLayout={e => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}>
      <Canvas ref={canvas} style={StyleSheet.absoluteFill}>
        <Group origin={{ x: size.width / 2, y: size.height / 2 }} transform={[{ translateX: viewport.x }, { translateY: viewport.y }, { scale: viewport.zoom }, { rotate: viewport.rotation }]}>
          <Group transform={[{ translateX: offsetX }, { translateY: offsetY }, { scale: fit }]}>
            <Rect x={0} y={0} width={document.width} height={document.height} color="#ffffff" />
            {document.layers.map(layer => <LayerContent key={layer.id} layer={layer} selected={mode === 'layer' && layer.id === document.selectedId} />)}
          </Group>
        </Group>
      </Canvas>
    </View>
  </GestureDetector>;
});
const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: '#17191f', overflow: 'hidden' } });
