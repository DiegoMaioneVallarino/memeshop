/**
 * Acciones del editor que no son de un solo panel: sesión de edición, importar, exportar, compartir,
 * quitar fondo, recortar. Antes estaban todas dentro de EditorScreen.
 */
import React from 'react';
import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Sharing from 'expo-sharing';
import type { PhotoCanvasHandle } from '../components/editor/PhotoCanvas';
import { useEditorStore } from '../store/useEditorStore';
import { EDIT_SESSION_TOOLS, useUiStore, type Tool } from '../store/useUiStore';
import { durableImage } from '../services/projects';
import { normalizeImage } from '../services/imageImport';
import { loadMaskImage, registerMask, releaseMask } from '../services/maskStore';
import { removeBackgroundAuto } from '../services/subject';
import { cropAndStraighten, cropMaskImage } from '../services/imageCrop';
import type { StickerAsset } from '../services/stickerLibrary';
import { cropRect, cropLocalAngle, croppedGeometry, initialCrop, isCropNoop, pixelRect } from '../utils/crop';
import type { EditorLayer, ImageLayer } from '../types/editor';
import { wand } from '../tools/wand/wandController';

/** El lienzo es único: cualquier módulo puede pedirle una captura o la paleta. */
export const canvasRef = React.createRef<PhotoCanvasHandle>();

const ui = () => useUiStore.getState();
const docStore = () => useEditorStore.getState();
export const selectedLayer = (): EditorLayer | undefined => { const d = docStore().document; return d?.layers.find(l => l.id === d.selectedId); };
const selectedImage = (): ImageLayer | null => { const l = selectedLayer(); return l?.type === 'image' ? l : null; };

// ---- sesión de edición (Aplicar / Cancelar) ----------------------------------------------------------------
export function openTool(tool: Tool | null) {
  ui().set({ tool, pickingColor: false });
  if (tool && EDIT_SESSION_TOOLS.includes(tool) && docStore().document) docStore().beginEdit();
  if (tool !== 'crop') ui().set({ crop: initialCrop });
}
export function acceptEdit() { docStore().finishEdit(); wand.commit(); ui().set({ tool: null }); }
export function discardEdit() { wand.discard(); docStore().cancelEdit(); ui().set({ tool: null, crop: initialCrop }); }
/** Cerrar el panel con la ✕ equivale a aplicar (igual que antes: el cambio ya está a la vista). */
export const closeTool = acceptEdit;

/** Botones de la barra inferior. Algunos no abren panel: hacen algo directamente. */
export function chooseTool(next: Tool) {
  const { tool, layersOpen } = ui();
  ui().set({ pickingColor: false });
  if (next === 'layers') { if (tool) acceptEdit(); ui().set({ layersOpen: !layersOpen }); return; }
  if (next === 'stickers') { if (tool) acceptEdit(); ui().set({ stickersOpen: true }); return; }
  if (next === 'images') { if (tool) acceptEdit(); void importImage(false); return; }
  if (next === 'templates') { if (tool) acceptEdit(); ui().set({ templatesOpen: true, layersOpen: false }); return; }
  ui().set({ layersOpen: false });
  if (tool === next) { acceptEdit(); return; }
  if (tool) acceptEdit();
  if (next === 'text') {
    if (selectedLayer()?.type !== 'text') docStore().addText();
    ui().set({ textTab: 'Fuente' });
  }
  if (next === 'brush') {
    if (selectedLayer()?.type !== 'paint') docStore().addPaint();
    void refreshPalette();
  }
  openTool(next);
}

// ---- importar -----------------------------------------------------------------------------------------------
/** Un paso de historial, sin abrir ningún panel (antes quedaba abierta una hoja "Imágenes" vacía). */
export async function importImage(replace = false) {
  try {
    ui().set({ imageLoading: true });
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 1 });
    if (result.canceled || !result.assets.length) return;
    const a = result.assets[0];
    // Limita el lado largo a MAX_WORK_SIDE y convierte HEIC/HEIF; las fotos opacas se guardan como JPEG.
    const normalized = await normalizeImage({ uri: a.uri, width: a.width, height: a.height, mimeType: a.mimeType });
    if (!normalized.width || !normalized.height) throw new Error('Imagen sin dimensiones');
    const photo = { uri: await durableImage(normalized.uri), width: normalized.width, height: normalized.height, name: a.fileName ?? undefined };
    if (replace) docStore().setPhoto(photo); else docStore().addImage(photo);
    if (normalized.downscaled) ui().showToast({ message: `Imagen reducida a ${normalized.width}×${normalized.height} para editarla con fluidez.` });
  } catch (e) { Alert.alert('Error al importar', String(e)); }
  finally { ui().set({ imageLoading: false }); }
}

export async function insertSticker(asset: StickerAsset) {
  try {
    ui().set({ imageLoading: true });
    // Copy into the project's own assets: deleting the sticker from the library must never break a project.
    const uri = await durableImage(asset.uri);
    docStore().addImage({ uri, width: asset.width, height: asset.height, name: asset.name });
    ui().set({ stickersOpen: false });
  } catch (e) { Alert.alert('No se pudo insertar el sticker', 'El archivo del sticker no está disponible. Quizá fue eliminado o dañado.\n' + String(e)); }
  finally { ui().set({ imageLoading: false }); }
}

// ---- exportar / compartir -------------------------------------------------------------------------------------
// expo-sharing abre la hoja nativa en Android e iOS. Share.share({url}) de React Native solo funciona en iOS.
export async function shareFile(file: string) {
  try {
    if (!(await Sharing.isAvailableAsync())) { Alert.alert('Compartir', 'Este dispositivo no permite compartir archivos.'); return; }
    await Sharing.shareAsync(file, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: 'Compartir imagen' });
  } catch (e) { Alert.alert('Compartir', String(e)); }
}

export async function exportImage() {
  if (!docStore().document || ui().busy) return;
  ui().set({ busy: true });
  try {
    const base64 = await canvasRef.current?.snapshotBase64();
    if (!base64) throw new Error('Skia no pudo generar la imagen. Espera a que termine de cargar.');
    if (!FileSystem.cacheDirectory) throw new Error('No se encontró el directorio temporal.');
    const file = `${FileSystem.cacheDirectory}memeshop-${Date.now()}.png`;
    await FileSystem.writeAsStringAsync(file, base64, { encoding: FileSystem.EncodingType.Base64 });
    const info = await FileSystem.getInfoAsync(file);
    if (!info.exists || !info.size) throw new Error('El archivo PNG quedó vacío.');
    const share = () => { void shareFile(file); };
    const permission = await MediaLibrary.requestPermissionsAsync(true);
    if (!permission.granted) {
      Alert.alert('Guardar imagen', 'Sin permiso para añadir fotos. Puedes compartir el PNG.', [{ text: 'Cancelar' }, { text: 'Compartir', onPress: share }]);
      return;
    }
    try {
      await MediaLibrary.saveToLibraryAsync(file);
      Alert.alert('Guardado', 'Imagen PNG guardada en Fotos.', [{ text: 'Listo' }, { text: 'Compartir', onPress: share }]);
    } catch {
      Alert.alert('No se pudo guardar en Fotos', 'El PNG se generó. Puedes compartirlo o guardarlo desde el menú del sistema.', [{ text: 'Cerrar' }, { text: 'Compartir PNG', onPress: share }]);
    }
  } catch (e) { Alert.alert('Error al exportar', String(e)); }
  finally { ui().set({ busy: false }); }
}

// ---- herramientas de un toque -----------------------------------------------------------------------------------
export async function refreshPalette() {
  try { const extracted = await canvasRef.current?.sampleColors(); if (extracted?.length) ui().set({ palette: extracted }); }
  catch (e) { console.warn('No se pudo analizar el color', e); }
}

export async function removeBackground() {
  const layer = selectedImage();
  if (!layer) { Alert.alert('Quitar fondo', 'Selecciona una capa de imagen.'); return; }
  if (ui().bgWorking) return;
  ui().set({ bgWorking: true });
  try {
    const r = await removeBackgroundAuto(layer.uri);
    if (!docStore().document?.layers.some(l => l.id === layer.id)) { releaseMask(r.key); return; }
    // Un solo paso de historial: deshacer devuelve el fondo. Los trazos de goma anteriores se descartan.
    docStore().update(layer.id, { magicMaskUri: r.key, maskStrokes: undefined });
  } catch (e) { Alert.alert('Quitar fondo', e instanceof Error ? e.message : String(e)); }
  finally { ui().set({ bgWorking: false }); }
}

const normAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
// A real mirror. Rendering is R(rotation)·F^flipX, so a mirror across the screen's vertical axis toggles flipX and negates
// the rotation; across the horizontal axis it toggles flipX and maps rotation to π − rotation.
export function flip(axis: 'h' | 'v') {
  const l = selectedImage();
  if (!l) { Alert.alert('Voltear', 'Selecciona una capa de imagen para voltearla.'); return; }
  docStore().update(l.id, { flipX: !l.flipX, rotation: normAngle(axis === 'h' ? -l.rotation : Math.PI - l.rotation) });
}

export async function applyCrop() {
  const l = selectedImage();
  if (!l) { Alert.alert('Recortar', 'Selecciona una capa de imagen para recortarla.'); return; }
  const crop = ui().crop;
  const rect = cropRect(crop, l.width, l.height, !!l.flipX);
  if (isCropNoop(crop, rect)) { acceptEdit(); return; }
  try {
    ui().set({ busy: true });
    const { px, frac } = pixelRect(rect, l.sourceWidth, l.sourceHeight);
    if (px.w < 2 || px.h < 2) throw new Error('Recorte demasiado pequeño');
    const angle = cropLocalAngle(crop, !!l.flipX);
    let tmp: string, outW = px.w, outH = px.h;
    if (Math.abs(angle) < 1e-4) {
      // Una foto JPEG recortada sigue siendo JPEG; solo las imágenes con transparencia se guardan como PNG.
      const opaque = /\.jpe?g(\?|$)/i.test(l.uri);
      const r = await ImageManipulator.manipulateAsync(l.uri, [{ crop: { originX: px.x, originY: px.y, width: px.w, height: px.h } }],
        opaque ? { format: ImageManipulator.SaveFormat.JPEG, compress: .92 } : { format: ImageManipulator.SaveFormat.PNG });
      tmp = r.uri; outW = r.width; outH = r.height;
    } else {
      tmp = await cropAndStraighten(l.uri, l.width, l.height, frac, angle, px.w, px.h);
    }
    const uri = await durableImage(tmp);
    // Content stays in place; mask strokes are re-expressed in the new image's coordinates.
    const g = croppedGeometry(l, frac, angle);
    // La máscara de la varita/quitafondos cubre toda la imagen: se recorta con la misma transformación.
    let magicMaskUri = l.magicMaskUri;
    if (magicMaskUri) { const m = await loadMaskImage(magicMaskUri); if (m) magicMaskUri = registerMask(await cropMaskImage(m, l.width, l.height, frac, angle)); }
    docStore().update(l.id, { uri, sourceWidth: outW, sourceHeight: outH, x: g.x, y: g.y, width: g.width, height: g.height, maskStrokes: g.maskStrokes, magicMaskUri });
    // The previous file is not deleted here: undo still needs it. pruneAssets() removes it once the project is closed.
    acceptEdit();
  } catch (e) { Alert.alert('Error de recorte', String(e)); }
  finally { ui().set({ busy: false }); }
}
