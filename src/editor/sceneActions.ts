/**
 * Escenas: cada capa puede tener un «papel» (mar, tierra, palmera, personaje…). Guardada como plantilla, una escena
 * se rellena sustituyendo cada papel por stickers de la biblioteca: a mano o al azar entre los que tengan esa
 * etiqueta (o ese nombre). Funciona con imágenes, huecos de foto y fondos de patrón.
 */
import { Alert } from 'react-native';
import { useEditorStore, makeId } from '../store/useEditorStore';
import { useUiStore } from '../store/useUiStore';
import { durableImage } from '../services/projects';
import { getStickers, type StickerAsset } from '../services/stickerLibrary';
import { matchesQuery } from '../utils/search';
import type { EditorLayer } from '../types/editor';

const ui = () => useUiStore.getState();
const docStore = () => useEditorStore.getState();

export const ROLE_PRESETS = ['cielo', 'mar', 'tierra', 'montaña', 'árbol', 'palmera', 'personaje', 'animal', 'objeto', 'fondo'];

/** Capas que admiten un sticker en su lugar. */
export const isReplaceable = (l: EditorLayer) => l.type === 'image' || l.type === 'pattern' || (l.type === 'shape' && !!l.placeholder);

export function setRole(layerId: string, role: string | undefined) {
  docStore().update(layerId, { role: role?.trim() ? role.trim().toLowerCase() : undefined });
}

/** Coloca el sticker en lugar de la capa: mismo centro, mismo giro, cabiendo en la caja original. */
export async function replaceLayerWithSticker(layerId: string, asset: StickerAsset, silent = false) {
  const layer = docStore().document?.layers.find(l => l.id === layerId);
  if (!layer || !isReplaceable(layer)) return false;
  try {
    const uri = await durableImage(asset.uri);
    if (layer.type === 'pattern') {
      docStore().update(layer.id, { sources: [{ uri, width: asset.width, height: asset.height, name: asset.name }], items: layer.items.map(i => ({ ...i, src: 0 })) });
      return true;
    }
    const k = Math.min(layer.width / (asset.width || 1), layer.height / (asset.height || 1));
    const width = asset.width * k, height = asset.height * k;
    const cx = layer.x + layer.width / 2, cy = layer.y + layer.height / 2;
    const geometry = { x: cx - width / 2, y: cy - height / 2, width, height };
    if (layer.type === 'image') {
      docStore().update(layer.id, { uri, sourceWidth: asset.width, sourceHeight: asset.height, name: asset.name, ...geometry,
        magicMaskUri: undefined, maskStrokes: undefined, liquify: undefined });
    } else {
      docStore().replaceLayer(layer.id, { id: makeId(), type: 'image', name: asset.name, uri, sourceWidth: asset.width, sourceHeight: asset.height, ...geometry,
        rotation: layer.rotation, opacity: layer.opacity, visible: layer.visible, role: layer.role, groupId: layer.groupId });
    }
    return true;
  } catch (e) { if (!silent) Alert.alert('Sustituir', String(e)); return false; }
}

/** Sustituye cada papel por un sticker al azar que tenga esa etiqueta o nombre. */
export async function randomizeScene(onlyLayerId?: string) {
  const doc = docStore().document;
  if (!doc) return;
  const targets = doc.layers.filter(l => l.role && isReplaceable(l) && (!onlyLayerId || l.id === onlyLayerId));
  if (!targets.length) { Alert.alert('Escena', 'Ninguna capa tiene papel. Selecciona una capa y asígnale uno (mar, tierra, personaje…).'); return; }
  ui().set({ imageLoading: true });
  try {
    const stickers = await getStickers();
    const missing = new Set<string>();
    let done = 0;
    for (const l of targets) {
      const candidates = stickers.filter(s => matchesQuery(s, l.role!));
      if (!candidates.length) { missing.add(l.role!); continue; }
      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      if (await replaceLayerWithSticker(l.id, pick, true)) done++;
    }
    const msg = missing.size
      ? `${done} sustituidos. Sin stickers con etiqueta: ${[...missing].join(', ')}.`
      : `${done} ${done === 1 ? 'componente sustituido' : 'componentes sustituidos'}.`;
    ui().showToast({ message: msg });
  } finally { ui().set({ imageLoading: false }); }
}

/** Abre la biblioteca para elegir el sticker de un papel, con la búsqueda ya puesta. */
export function pickStickerFor(layerId: string) {
  const role = docStore().document?.layers.find(l => l.id === layerId)?.role ?? '';
  ui().set({ stickerPick: { purpose: 'replace', layerId, query: role } });
}

export const hasRoles = (layers: EditorLayer[]) => layers.some(l => !!l.role);
