import { create } from 'zustand';
import type { EditorDocument, EditorLayer, PhotoAsset } from '../types/editor';
const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
type State = {
  document: EditorDocument | null;
  past: EditorDocument[];
  future: EditorDocument[];
  editBaseline: EditorDocument | null;
  beginEdit: () => void;
  finishEdit: () => void;
  undo: () => void;
  redo: () => void;
  setPhoto: (asset: PhotoAsset) => void;
  addImage: (asset: PhotoAsset) => void;
  addShape: () => void;
  addPaint: () => void;
  appendStroke: (id: string, stroke: import('../types/editor').BrushStroke) => void;
  appendMaskStroke: (id: string, stroke: import('../types/editor').MaskStroke) => void;
  select: (id: string | null) => void;
  update: (id: string, patch: Partial<EditorLayer>) => void;
  move: (id: string, direction: -1 | 1) => void;
  duplicate: (id: string) => void;
  remove: (id: string) => void;
  resetDocument: () => void;
};
const imageLayer = (asset: PhotoAsset, docWidth: number, docHeight: number): EditorLayer => {
  const fit = Math.min(docWidth / asset.width, docHeight / asset.height, 1);
  const width = asset.width * fit, height = asset.height * fit;
  return { id: makeId(), type: 'image', name: asset.name || 'Imagen', uri: asset.uri,
    sourceWidth: asset.width, sourceHeight: asset.height, x: (docWidth-width)/2, y: (docHeight-height)/2,
    width, height, rotation: 0, opacity: 1, visible: true };
};
export const useEditorStore = create<State>((set) => ({
  document: null,
  past: [], future: [], editBaseline: null,
  beginEdit: () => set(s => s.document && !s.editBaseline ? { editBaseline: structuredClone(s.document) } : s),
  finishEdit: () => set(s => {
    if (!s.editBaseline) return s;
    const changed = JSON.stringify(s.editBaseline) !== JSON.stringify(s.document);
    return { editBaseline: null, past: changed ? [...s.past.slice(-39), s.editBaseline] : s.past, future: changed ? [] : s.future };
  }),
  undo: () => set(s => {
    if (!s.document || !s.past.length) return s;
    const previous = s.past[s.past.length - 1];
    return { document: previous, past: s.past.slice(0, -1), future: [s.document, ...s.future], editBaseline: null };
  }),
  redo: () => set(s => {
    if (!s.document || !s.future.length) return s;
    return { document: s.future[0], past: [...s.past, s.document], future: s.future.slice(1), editBaseline: null };
  }),
  setPhoto: (asset) => set(() => { const layer = imageLayer(asset, asset.width, asset.height); return { document: { width: asset.width, height: asset.height, layers: [layer], selectedId: layer.id }, past: [], future: [], editBaseline: null }; }),
  addImage: (asset) => set((s) => {
    if (!s.document) { const layer = imageLayer(asset, asset.width, asset.height); return { document: { width: asset.width, height: asset.height, layers: [layer], selectedId: layer.id }, past: [], future: [], editBaseline: null }; }
    const layer = imageLayer(asset, s.document.width, s.document.height);
    return { document: { ...s.document, layers: [...s.document.layers, layer], selectedId: layer.id } };
  }),
  addShape: () => set((s) => {
    if (!s.document) return s;
    const { width, height } = s.document;
    const w = width * .35, h = height * .22;
    const layer: EditorLayer = { id: makeId(), type: 'shape', name: 'Rectángulo', color: '#a78bfa', x: (width-w)/2, y: (height-h)/2, width: w, height: h, rotation: 0, opacity: 1, visible: true };
    return { document: { ...s.document, layers: [...s.document.layers, layer], selectedId: layer.id } };
  }),
  addPaint: () => set(s => {
    if (!s.document) return s;
    const { width, height } = s.document;
    const layer: EditorLayer = { id: makeId(), type: 'paint', name: 'Pintura', x: 0, y: 0, width, height, rotation: 0, opacity: 1, visible: true, strokes: [] };
    return { document: { ...s.document, layers: [...s.document.layers, layer], selectedId: layer.id } };
  }),
  appendStroke: (id, stroke) => set(s => {
    if (!s.document) return s;
    return { document: { ...s.document, layers: s.document.layers.map(l => l.id === id && l.type === 'paint' ? { ...l, strokes: [...l.strokes, stroke] } : l) } };
  }),
  appendMaskStroke: (id: string, stroke: import('../types/editor').MaskStroke) => set(s => !s.document ? s : ({ document: { ...s.document, layers: s.document.layers.map(l => l.id === id && l.type === 'image' ? { ...l, maskStrokes: [...(l.maskStrokes ?? []), stroke] } : l) } })),
  select: (id) => set((s) => s.document ? { document: { ...s.document, selectedId: id } } : s),
  update: (id, patch) => set((s) => {
    if (!s.document) return s;
    const layers = s.document.layers.map((layer) => {
      if (layer.id !== id) return layer;
      const next = { ...layer, ...patch } as EditorLayer;
      return { ...next, opacity: clamp(next.opacity, 0, 1), width: Math.max(1, next.width), height: Math.max(1, next.height) };
    });
    return { document: { ...s.document, layers } };
  }),
  move: (id, direction) => set((s) => {
    if (!s.document) return s;
    const layers = [...s.document.layers], index = layers.findIndex((l) => l.id === id), target = index + direction;
    if (index < 0 || target < 0 || target >= layers.length) return s;
    [layers[index], layers[target]] = [layers[target], layers[index]];
    return { document: { ...s.document, layers } };
  }),
  duplicate: (id) => set((s) => {
    if (!s.document) return s;
    const layers = [...s.document.layers], index = layers.findIndex((l) => l.id === id);
    if (index < 0) return s;
    const original = layers[index];
    const layer = { ...original, id: makeId(), name: `${original.name} copia`, x: original.x + 24, y: original.y + 24 };
    layers.splice(index + 1, 0, layer);
    return { document: { ...s.document, layers, selectedId: layer.id } };
  }),
  remove: (id) => set((s) => {
    if (!s.document) return s;
    const layers = s.document.layers.filter((l) => l.id !== id);
    return { document: { ...s.document, layers, selectedId: s.document.selectedId === id ? layers[layers.length - 1]?.id ?? null : s.document.selectedId } };
  }),
  resetDocument: () => set({ document: null, past: [], future: [], editBaseline: null }),
}));
