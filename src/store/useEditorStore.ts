import { create } from 'zustand';
import type { BrushStroke, EditorDocument, EditorLayer, MaskStroke, PhotoAsset } from '../types/editor';
const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

const HISTORY_LIMIT = 40;
// Consecutive edits of the same kind (slider drags, +/- taps) inside this window share one undo step.
const COALESCE_MS = 700;
let lastKey: string | null = null;
let lastAt = 0;
const resetCoalesce = () => { lastKey = null; lastAt = 0; };

type State = {
  document: EditorDocument | null;
  past: EditorDocument[];
  future: EditorDocument[];
  editBaseline: EditorDocument | null;
  beginEdit: () => void;
  finishEdit: () => void;
  cancelEdit: () => void;
  undo: () => void;
  redo: () => void;
  setPhoto: (asset: PhotoAsset) => void;
  addImage: (asset: PhotoAsset) => void;
  addShape: () => void;
  addPaint: () => void;
  addText: () => void;
  appendStroke: (id: string, stroke: BrushStroke) => void;
  appendMaskStroke: (id: string, stroke: MaskStroke) => void;
  select: (id: string | null) => void;
  update: (id: string, patch: Partial<EditorLayer>) => void;
  move: (id: string, direction: -1 | 1) => void;
  duplicate: (id: string) => void;
  remove: (id: string) => void;
  resetDocument: () => void;
};

/**
 * Every document mutation goes through here so it lands in the undo history.
 * - Inside a gesture (editBaseline set) the gesture is committed as ONE step by finishEdit().
 * - With a `key`, repeated edits within COALESCE_MS are merged into the previous step.
 * The document is treated as immutable, so snapshots are plain references (no deep clone).
 */
function commit(s: State, document: EditorDocument, key?: string): Partial<State> {
  if (!s.document || s.editBaseline) return { document };
  const now = Date.now();
  if (key && key === lastKey && now - lastAt < COALESCE_MS) {
    lastAt = now;
    return { document, future: [] };
  }
  lastKey = key ?? null;
  lastAt = now;
  return { document, past: [...s.past.slice(-(HISTORY_LIMIT - 1)), s.document], future: [] };
}

const imageLayer = (asset: PhotoAsset, docWidth: number, docHeight: number): EditorLayer => {
  const fit = Math.min(docWidth / asset.width, docHeight / asset.height, 1);
  const width = asset.width * fit, height = asset.height * fit;
  return { id: makeId(), type: 'image', name: asset.name || 'Imagen', uri: asset.uri,
    sourceWidth: asset.width, sourceHeight: asset.height, x: (docWidth-width)/2, y: (docHeight-height)/2,
    width, height, rotation: 0, opacity: 1, visible: true };
};
const freshDocument = (asset: PhotoAsset): EditorDocument => {
  const layer = imageLayer(asset, asset.width, asset.height);
  return { width: asset.width, height: asset.height, layers: [layer], selectedId: layer.id };
};
export const useEditorStore = create<State>((set) => ({
  document: null,
  past: [], future: [], editBaseline: null,
  beginEdit: () => set(s => s.document && !s.editBaseline ? { editBaseline: s.document } : s),
  finishEdit: () => set(s => {
    if (!s.editBaseline) return s;
    resetCoalesce();
    const changed = s.editBaseline !== s.document;
    return { editBaseline: null, past: changed ? [...s.past.slice(-(HISTORY_LIMIT - 1)), s.editBaseline] : s.past, future: changed ? [] : s.future };
  }),
  cancelEdit: () => set(s => {
    if (!s.editBaseline) return s;
    resetCoalesce();
    return { document: s.editBaseline, editBaseline: null };
  }),
  undo: () => set(s => {
    if (!s.document || !s.past.length) return s;
    resetCoalesce();
    const previous = s.past[s.past.length - 1];
    return { document: previous, past: s.past.slice(0, -1), future: [s.document, ...s.future], editBaseline: null };
  }),
  redo: () => set(s => {
    if (!s.document || !s.future.length) return s;
    resetCoalesce();
    return { document: s.future[0], past: [...s.past, s.document], future: s.future.slice(1), editBaseline: null };
  }),
  // Replacing the photo is undoable when a document already exists (it used to wipe everything for good).
  setPhoto: (asset) => set((s) => {
    resetCoalesce();
    return { document: freshDocument(asset), past: s.document ? [...s.past.slice(-(HISTORY_LIMIT - 1)), s.document] : [], future: [], editBaseline: null };
  }),
  addImage: (asset) => set((s) => {
    if (!s.document) { resetCoalesce(); return { document: freshDocument(asset), past: [], future: [], editBaseline: null }; }
    const layer = imageLayer(asset, s.document.width, s.document.height);
    return commit(s, { ...s.document, layers: [...s.document.layers, layer], selectedId: layer.id });
  }),
  addShape: () => set((s) => {
    if (!s.document) return s;
    const { width, height } = s.document;
    const w = width * .35, h = height * .22;
    const layer: EditorLayer = { id: makeId(), type: 'shape', name: 'Rectángulo', color: '#a78bfa', x: (width-w)/2, y: (height-h)/2, width: w, height: h, rotation: 0, opacity: 1, visible: true };
    return commit(s, { ...s.document, layers: [...s.document.layers, layer], selectedId: layer.id });
  }),
  addPaint: () => set(s => {
    if (!s.document) return s;
    const { width, height } = s.document;
    const layer: EditorLayer = { id: makeId(), type: 'paint', name: 'Pintura', x: 0, y: 0, width, height, rotation: 0, opacity: 1, visible: true, strokes: [] };
    return commit(s, { ...s.document, layers: [...s.document.layers, layer], selectedId: layer.id });
  }),
  addText: () => set(s => {
    if (!s.document) return s;
    const { width, height } = s.document;
    const fontSize = Math.max(14, Math.round(Math.min(width, height) * 0.085));
    const w = width * 0.82;
    const layer: EditorLayer = { id: makeId(), type: 'text', name: 'Texto', text: 'Tu texto aquí', color: '#ffffff', fontSize, align: 'center', lineHeight: 1.2, x: (width-w)/2, y: height * 0.42, width: w, height: fontSize * 1.5, rotation: 0, opacity: 1, visible: true };
    return commit(s, { ...s.document, layers: [...s.document.layers, layer], selectedId: layer.id });
  }),
  appendStroke: (id, stroke) => set(s => {
    if (!s.document) return s;
    return commit(s, { ...s.document, layers: s.document.layers.map(l => l.id === id && l.type === 'paint' ? { ...l, strokes: [...l.strokes, stroke] } : l) });
  }),
  appendMaskStroke: (id, stroke) => set(s => !s.document ? s : commit(s, { ...s.document, layers: s.document.layers.map(l => l.id === id && l.type === 'image' ? { ...l, maskStrokes: [...(l.maskStrokes ?? []), stroke] } : l) })),
  // Selection is UI state, not an undoable edit. No-op when nothing changes so references stay stable.
  select: (id) => set((s) => s.document && s.document.selectedId !== id ? { document: { ...s.document, selectedId: id } } : s),
  update: (id, patch) => set((s) => {
    if (!s.document) return s;
    const layers = s.document.layers.map((layer) => {
      if (layer.id !== id) return layer;
      const next = { ...layer, ...patch } as EditorLayer;
      return { ...next, opacity: clamp(next.opacity, 0, 1), width: Math.max(1, next.width), height: Math.max(1, next.height) };
    });
    return commit(s, { ...s.document, layers }, `update:${id}:${Object.keys(patch).sort().join(',')}`);
  }),
  move: (id, direction) => set((s) => {
    if (!s.document) return s;
    const layers = [...s.document.layers], index = layers.findIndex((l) => l.id === id), target = index + direction;
    if (index < 0 || target < 0 || target >= layers.length) return s;
    [layers[index], layers[target]] = [layers[target], layers[index]];
    return commit(s, { ...s.document, layers });
  }),
  duplicate: (id) => set((s) => {
    if (!s.document) return s;
    const layers = [...s.document.layers], index = layers.findIndex((l) => l.id === id);
    if (index < 0) return s;
    const original = layers[index];
    const layer = { ...original, id: makeId(), name: `${original.name} copia`, x: original.x + 24, y: original.y + 24 };
    layers.splice(index + 1, 0, layer);
    return commit(s, { ...s.document, layers, selectedId: layer.id });
  }),
  remove: (id) => set((s) => {
    if (!s.document) return s;
    const layers = s.document.layers.filter((l) => l.id !== id);
    return commit(s, { ...s.document, layers, selectedId: s.document.selectedId === id ? layers[layers.length - 1]?.id ?? null : s.document.selectedId });
  }),
  resetDocument: () => { resetCoalesce(); set({ document: null, past: [], future: [], editBaseline: null }); },
}));
