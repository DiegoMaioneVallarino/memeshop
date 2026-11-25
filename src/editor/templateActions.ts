/** Plantillas, huecos de foto y tamaño de lienzo. */
import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { useEditorStore, makeId } from '../store/useEditorStore';
import { useUiStore } from '../store/useUiStore';
import { durableImage } from '../services/projects';
import { normalizeImage } from '../services/imageImport';
import { loadTemplate, saveTemplate, type MemeTemplate, type TemplateKind, type TemplateMeta } from '../services/templates';
import { BUILTIN_TEMPLATES } from '../templates/builtin';
import { renderThumbnailBase64 } from '../components/editor/PhotoCanvas';
import { coverCrop, instantiateDocument, instantiateLayers } from '../utils/templates';
import { fitLayersTo, resizeDocument } from '../utils/canvas';
import { fitWithin } from '../utils/limits';
import type { EditorDocument, EditorLayer } from '../types/editor';
import { acceptEdit } from './actions';

const ui = () => useUiStore.getState();
const docStore = () => useEditorStore.getState();

/** Undo desde el aviso: solo si el cambio sigue siendo el último (si no, deshacer quitaría otra cosa). */
function undoToast(message: string, before: EditorDocument | null) {
  ui().showToast({ message, actionLabel: before ? 'Deshacer' : undefined, action: before ? () => {
    const st = docStore();
    if (st.past[st.past.length - 1] === before) st.undo();
  } : undefined });
}

/** Las imágenes de una plantilla del usuario se copian al proyecto: borrar la plantilla no rompe el proyecto. */
async function adoptImages(layers: EditorLayer[]): Promise<EditorLayer[]> {
  const out: EditorLayer[] = [];
  for (const l of layers) {
    if (l.type !== 'image') { out.push(l); continue; }
    out.push({ ...l, uri: await durableImage(l.uri), magicMaskUri: l.magicMaskUri ? await durableImage(l.magicMaskUri) : undefined });
  }
  return out;
}

async function resolve(meta: TemplateMeta): Promise<MemeTemplate | null> {
  if (meta.builtIn) return BUILTIN_TEMPLATES.find(t => t.id === meta.id) ?? null;
  return loadTemplate(meta.id);
}

/**
 * Usa una plantilla.
 * - layout: reemplaza el lienzo por el diseño (un paso de historial: «Deshacer» lo revierte).
 * - overlay: añade sus capas encima de la imagen actual, escaladas al tamaño del lienzo.
 */
export async function applyTemplate(meta: TemplateMeta) {
  try {
    ui().set({ imageLoading: true });
    if (docStore().editBaseline) acceptEdit();
    const t = await resolve(meta);
    if (!t) throw new Error('No se pudo leer la plantilla.');
    const before = docStore().document;
    if (t.kind === 'layout' || !before) {
      const doc = instantiateDocument(t.document);
      docStore().replaceDocument({ ...doc, layers: await adoptImages(doc.layers) });
    } else {
      const layers = fitLayersTo(instantiateLayers(t.document.layers), t.document, before, 'fit');
      docStore().appendLayers(await adoptImages(layers));
    }
    ui().set({ templatesOpen: false });
    undoToast(`Plantilla «${t.name}» aplicada`, before);
  } catch (e) { Alert.alert('Plantillas', String(e)); }
  finally { ui().set({ imageLoading: false }); }
}

export async function saveCurrentAsTemplate(name: string, kind: TemplateKind): Promise<TemplateMeta | null> {
  const doc = docStore().document;
  if (!doc) return null;
  try {
    ui().set({ busy: true });
    if (docStore().editBaseline) acceptEdit();
    const current = docStore().document!;
    const source = kind === 'overlay' && current.layers.length > 1 ? { ...current, layers: current.layers.slice(1), background: 'transparent' } : current;
    let thumbnailBase64: string | undefined;
    try { thumbnailBase64 = await renderThumbnailBase64(source, 360); } catch (e) { console.warn('Miniatura de plantilla:', e); }
    const meta = await saveTemplate({ name, kind, document: current, thumbnailBase64 });
    ui().showToast({ message: `Plantilla «${meta.name}» guardada en tu biblioteca` });
    return meta;
  } catch (e) { Alert.alert('Guardar plantilla', String(e)); return null; }
  finally { ui().set({ busy: false }); }
}

/** Rellena un hueco de plantilla con una foto recortada al centro para cubrirlo. Un paso de historial. */
export async function fillPlaceholder(layerId: string) {
  const slot = docStore().document?.layers.find(l => l.id === layerId);
  if (!slot || slot.type !== 'shape' || !slot.placeholder) return;
  try {
    ui().set({ imageLoading: true });
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 1 });
    if (result.canceled || !result.assets.length) return;
    const a = result.assets[0];
    const n = await normalizeImage({ uri: a.uri, width: a.width, height: a.height, mimeType: a.mimeType });
    const crop = coverCrop(n.width, n.height, slot.width, slot.height);
    const opaque = /\.jpe?g(\?|$)/i.test(n.uri);
    const cut = await ImageManipulator.manipulateAsync(n.uri, [{ crop }],
      opaque ? { format: ImageManipulator.SaveFormat.JPEG, compress: .92 } : { format: ImageManipulator.SaveFormat.PNG });
    const uri = await durableImage(cut.uri);
    if (docStore().editBaseline) acceptEdit();
    docStore().replaceLayer(slot.id, {
      id: makeId(), type: 'image', name: a.fileName ?? slot.name, uri, sourceWidth: cut.width, sourceHeight: cut.height,
      x: slot.x, y: slot.y, width: slot.width, height: slot.height, rotation: slot.rotation, opacity: 1, visible: true, groupId: slot.groupId,
    });
  } catch (e) { Alert.alert('Poner foto', String(e)); }
  finally { ui().set({ imageLoading: false }); }
}

// ---- tamaño de lienzo ----------------------------------------------------------------------------------------
/**
 * Cambia el lienzo a width×height. Siempre parte del documento de ANTES de abrir el panel (editBaseline),
 * así probar varios tamaños seguidos no va encogiendo el contenido. El color de fondo elegido se conserva.
 */
export function setCanvasSize(width: number, height: number) {
  const st = docStore();
  const current = st.document;
  if (!current) return;
  const base = st.editBaseline ?? current;
  const next = resizeDocument(base, Math.round(width), Math.round(height), ui().canvasFit);
  st.replaceDocument({ ...next, background: current.background, selectedId: current.selectedId });
}

/** Proporción de la primera foto del documento (limitada a MAX_WORK_SIDE). */
export function originalPhotoSize(doc: EditorDocument | null) {
  const photo = doc?.layers.find(l => l.type === 'image');
  if (!photo || photo.type !== 'image') return null;
  const { width, height } = fitWithin(photo.sourceWidth, photo.sourceHeight);
  return { width, height };
}

export function setCanvasBackground(background: string) {
  const doc = docStore().document;
  if (doc) docStore().replaceDocument({ ...doc, background });
}

/** Lienzo vacío para empezar desde cero (p. ej. una plantilla de capas encima sin foto). */
export function blankDocument(width: number, height: number, background = '#ffffff'): EditorDocument {
  return { width, height, layers: [], selectedId: null, background };
}
