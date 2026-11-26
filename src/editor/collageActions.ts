/**
 * Collage: fondos de patrón (un sticker o varios repetidos por todo el lienzo) y composiciones aleatorias
 * (pocas piezas grandes como capas sueltas). Todo se regenera en vivo al mover un parámetro, dentro de la sesión
 * de la herramienta: «Aplicar» lo deja como un paso y «Cancelar» lo quita.
 */
import { Alert } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { makeId, useEditorStore } from '../store/useEditorStore';
import { useUiStore, type CollageState } from '../store/useUiStore';
import { durableImage } from '../services/projects';
import type { StickerAsset } from '../services/stickerLibrary';
import { renderStickerBase64 } from '../components/editor/PhotoCanvas';
import { generateComposition, generatePattern, rng } from '../utils/pattern';
import type { EditorLayer, ImageLayer, PatternLayer, PatternSource } from '../types/editor';
import { acceptEdit, openTool } from './actions';

const ui = () => useUiStore.getState();
const docStore = () => useEditorStore.getState();
const BACKGROUNDS = ['#ffe05a', '#18e500', '#25c5ff', '#ff304f', '#fa8fff', '#ff8800', '#111111', '#f2e8d5', '#a78bfa', '#0b3d0b'];

/** Abre Collage. Si hay un patrón seleccionado, se edita ese; si no, se empieza uno nuevo. */
export function startCollage() {
  if (ui().tool) acceptEdit();
  const doc = docStore().document;
  const sel = doc?.layers.find(l => l.id === doc.selectedId);
  if (sel?.type === 'pattern') {
    ui().setCollage({ mode: 'pattern', sources: sel.sources, pattern: sel.params ?? ui().collage.pattern, patternLayerId: sel.id, groupId: null });
  } else {
    ui().setCollage({ patternLayerId: null, groupId: null });
  }
  openTool('collage');
}

async function addSource(src: PatternSource) {
  ui().setCollage({ sources: [...ui().collage.sources, src].slice(0, 8) });
  sync();
}

export async function addCollageSticker(asset: StickerAsset) {
  try {
    ui().set({ imageLoading: true });
    await addSource({ uri: await durableImage(asset.uri), width: asset.width, height: asset.height, name: asset.name });
  } catch (e) { Alert.alert('Collage', String(e)); }
  finally { ui().set({ imageLoading: false }); }
}

/** La imagen seleccionada como fuente. Si tiene el fondo quitado o borrones, se "hornea" con su transparencia. */
export async function addCollageFromSelected() {
  const doc = docStore().document;
  const layer = doc?.layers.find(l => l.id === doc.selectedId);
  if (layer?.type !== 'image') { Alert.alert('Collage', 'Selecciona una imagen o elige un sticker.'); return; }
  try {
    ui().set({ imageLoading: true });
    if (!layer.magicMaskUri && !layer.maskStrokes?.length) {
      await addSource({ uri: layer.uri, width: layer.sourceWidth, height: layer.sourceHeight, name: layer.name });
      return;
    }
    const { base64, width, height } = await renderStickerBase64(layer);
    const tmp = `${FileSystem.cacheDirectory}collage-${Date.now()}.png`;
    await FileSystem.writeAsStringAsync(tmp, base64, { encoding: FileSystem.EncodingType.Base64 });
    await addSource({ uri: await durableImage(tmp), width, height, name: layer.name });
  } catch (e) { Alert.alert('Collage', String(e)); }
  finally { ui().set({ imageLoading: false }); }
}

export function removeCollageSource(index: number) {
  const sources = ui().collage.sources.filter((_, i) => i !== index);
  ui().setCollage({ sources });
  sync();
}

export function setCollageParams(patch: Partial<CollageState>) { ui().setCollage(patch); sync(); }
export function newVariation() {
  const c = ui().collage;
  if (c.mode === 'pattern') ui().setCollage({ pattern: { ...c.pattern, seed: c.pattern.seed + 1 } });
  else ui().setCollage({ composition: { ...c.composition, seed: c.composition.seed + 1 } });
  sync();
}

/** Cambiar entre Patrón y Aleatorio quita lo generado por el otro modo en esta sesión. */
export function setCollageMode(mode: CollageState['mode']) {
  const c = ui().collage;
  if (c.mode === mode) return;
  if (c.mode === 'pattern' && c.patternLayerId) docStore().remove(c.patternLayerId);
  if (c.mode === 'random' && c.groupId) docStore().replaceGroup(c.groupId, []);
  ui().setCollage({ mode, patternLayerId: null, groupId: null });
  sync();
}

/** Regenera lo que corresponde al modo actual con las fuentes y parámetros actuales. */
export function sync() {
  const doc = docStore().document, c = ui().collage;
  if (!doc || !c.sources.length) return;
  if (c.mode === 'pattern') {
    const items = generatePattern(c.pattern, doc.width, doc.height, c.sources.length);
    const existing = c.patternLayerId ? doc.layers.find(l => l.id === c.patternLayerId) : undefined;
    if (existing?.type === 'pattern') {
      docStore().update(existing.id, { sources: c.sources, items, params: c.pattern, x: 0, y: 0, width: doc.width, height: doc.height });
      return;
    }
    const layer: PatternLayer & { role: string } = { id: makeId(), type: 'pattern', name: 'Fondo de patrón', sources: c.sources, items, params: c.pattern,
      x: 0, y: 0, width: doc.width, height: doc.height, rotation: 0, opacity: 1, visible: true, role: 'fondo' };
    docStore().insertLayerAt(layer, 0); // al fondo: llena el espacio vacío detrás de todo
    ui().setCollage({ patternLayerId: layer.id });
    return;
  }
  // Aleatorio: capas sueltas con ids estables por posición, así mover un slider no recarga las imágenes.
  const groupId = c.groupId ?? `collage-${makeId()}`;
  const m = Math.min(doc.width, doc.height);
  const layers: EditorLayer[] = generateComposition(c.composition, doc.width, doc.height, c.sources.length).map((it, i) => {
    const src = c.sources[it.src];
    const w = it.size * m, h = w * ((src.height || 1) / (src.width || 1));
    const layer: ImageLayer = { id: `${groupId}-${i}`, type: 'image', name: src.name ?? `Pieza ${i + 1}`, uri: src.uri, sourceWidth: src.width, sourceHeight: src.height,
      x: it.x * doc.width - w / 2, y: it.y * doc.height - h / 2, width: w, height: h, rotation: it.rotation, flipX: it.flip, opacity: 1, visible: true };
    return layer;
  });
  docStore().replaceGroup(groupId, layers);
  if (c.randomBackground) {
    const r = rng(c.composition.seed * 7919);
    const d = docStore().document;
    if (d) docStore().replaceDocument({ ...d, background: BACKGROUNDS[Math.floor(r() * BACKGROUNDS.length)] });
  }
  if (!c.groupId) ui().setCollage({ groupId });
}
