/**
 * Stickers: se crean a partir de una foto. Flujo: importar → quitar fondo (revisión con Borrar / Restaurar) →
 * Aplicar → decidir si se guarda en la biblioteca, con nombre y etiquetas. Nada se guarda sin preguntar.
 */
import { Alert } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { useEditorStore } from '../store/useEditorStore';
import { useUiStore } from '../store/useUiStore';
import { saveSticker } from '../services/stickerLibrary';
import { renderStickerBase64 } from '../components/editor/PhotoCanvas';
import { acceptEdit, importImage, removeBackground } from './actions';

const ui = () => useUiStore.getState();
const docStore = () => useEditorStore.getState();

/** «Crear sticker» desde la biblioteca: la foto entra como capa y se abre la revisión de quitar fondo. */
export async function createStickerFromGallery() {
  ui().set({ stickersOpen: false });
  const before = docStore().document;
  await importImage(!before);
  const after = docStore().document;
  if (!after || after === before) return; // canceló el selector
  ui().set({ stickerFlow: true });
  await removeBackground();
  if (ui().tool !== 'cutout') ui().set({ stickerFlow: false }); // la detección falló o se canceló
}

/** «Aplicar» en la revisión de quitar fondo. */
export function acceptCutout() {
  const layerId = docStore().document?.selectedId ?? null;
  const fromSticker = ui().stickerFlow;
  acceptEdit();
  ui().set({ stickerFlow: false });
  if (!layerId) return;
  if (fromSticker) ui().set({ stickerSave: { layerId } });
  else ui().showToast({ message: 'Fondo quitado', actionLabel: 'Guardar como sticker', action: () => ui().set({ stickerSave: { layerId } }) });
}

/** Cancelar en la revisión desde «Crear sticker» también olvida el flujo. */
export const cancelStickerFlow = () => ui().set({ stickerFlow: false });

/** Renderiza la capa (con su recorte y correcciones) como PNG transparente y la guarda en la biblioteca. */
export async function saveLayerAsSticker(layerId: string, name: string, tags: string[]): Promise<boolean> {
  const layer = docStore().document?.layers.find(l => l.id === layerId);
  if (layer?.type !== 'image') { Alert.alert('Guardar sticker', 'La capa ya no existe.'); return false; }
  ui().set({ busy: true });
  try {
    const { base64, width, height } = await renderStickerBase64(layer);
    const path = `${FileSystem.cacheDirectory}memeshop-sticker-${Date.now()}.png`;
    await FileSystem.writeAsStringAsync(path, base64, { encoding: FileSystem.EncodingType.Base64 });
    await saveSticker({ uri: path, width, height, name, tags });
    ui().showToast({ message: `Sticker «${name}» guardado`, actionLabel: 'Ver', action: () => ui().set({ stickersOpen: true }) });
    return true;
  } catch (e) { Alert.alert('No se pudo guardar el sticker', String(e)); return false; }
  finally { ui().set({ busy: false }); }
}
