/**
 * Máscaras en memoria (SkImage Alpha_8). Sustituyen al PNG escrito a mano + archivo en disco.
 *
 * - Una capa referencia su máscara con `magicMaskUri`. Mientras la máscara solo vive en memoria,
 *   ese valor es una clave `mem-mask:<id>`. Al autoguardar el proyecto, materializeMasks() la
 *   codifica UNA vez (PNG nativo de Skia) dentro de memeshop-assets/, que es la carpeta que
 *   pruneAssets() ya limpia. Así no queda ningún archivo huérfano.
 * - El historial (undo) sigue funcionando porque las claves viven mientras dure la sesión.
 */
import React from 'react';
import { AlphaType, ColorType, Group, Image as SkiaImage, Skia, drawAsImage } from '@shopify/react-native-skia';
import type { SkImage } from '@shopify/react-native-skia';
import * as FileSystem from 'expo-file-system/legacy';
import type { EditorDocument } from '../types/editor';

const MEM = 'mem-mask:';
const masks = new Map<string, SkImage>();
const materialized = new Map<string, string>(); // clave en memoria -> archivo ya escrito
let counter = 0;

export const isMemMask = (uri?: string | null): uri is string => !!uri && uri.startsWith(MEM);
export const getMemMask = (uri?: string | null): SkImage | null => (isMemMask(uri) ? masks.get(uri) ?? null : null);

export function registerMask(image: SkImage): string {
  const key = `${MEM}${Date.now().toString(36)}-${(counter++).toString(36)}`;
  masks.set(key, image);
  return key;
}
export function releaseMask(key?: string | null) {
  if (isMemMask(key)) masks.delete(key);
}
export function clearMasks() {
  masks.clear();
  materialized.clear();
}

/** w*h bytes de alfa -> SkImage Alpha_8 (si el dispositivo no lo admite, cae a RGBA con el mismo alfa). */
export function alphaImage(alpha: Uint8Array, w: number, h: number): SkImage {
  let img = Skia.Image.MakeImage(
    { width: w, height: h, alphaType: AlphaType.Premul, colorType: ColorType.Alpha_8 },
    Skia.Data.fromBytes(alpha), w);
  if (!img) {
    const rgba = new Uint8Array(w * h * 4);
    for (let i = 0; i < alpha.length; i++) rgba[i * 4 + 3] = alpha[i];
    img = Skia.Image.MakeImage(
      { width: w, height: h, alphaType: AlphaType.Premul, colorType: ColorType.RGBA_8888 },
      Skia.Data.fromBytes(rgba), w * 4);
  }
  if (!img) throw new Error('No se pudo crear la máscara');
  return img;
}

/** Carga una máscara desde memoria o desde archivo (proyectos guardados). */
export async function loadMaskImage(uri: string): Promise<SkImage | null> {
  const mem = getMemMask(uri);
  if (mem) return mem;
  if (isMemMask(uri)) return null; // clave de una sesión anterior: ya no existe
  try {
    return Skia.Image.MakeImageFromEncoded(await Skia.Data.fromURI(uri));
  } catch { return null; }
}

const ASSETS_DIR = 'memeshop-assets/';
/** Escribe en disco las máscaras que solo viven en memoria y devuelve el documento con rutas de archivo. */
export async function materializeMasks(doc: EditorDocument): Promise<EditorDocument> {
  let changed = false;
  const layers: EditorDocument["layers"] = [];
  for (const l of doc.layers) {
    if (l.type !== 'image' || !isMemMask(l.magicMaskUri)) { layers.push(l); continue; }
    let file = materialized.get(l.magicMaskUri);
    if (!file) {
      const img = masks.get(l.magicMaskUri);
      if (!img) { layers.push({ ...l, magicMaskUri: undefined }); changed = true; continue; }
      // Se redibuja a RGBA (alfa conservado) para que el PNG recargado conserve el canal alfa sí o sí.
      const rgba = await drawAsImage(<SkiaImage image={img} x={0} y={0} width={img.width()} height={img.height()} fit="fill" />,
        { width: img.width(), height: img.height() });
      const dir = FileSystem.documentDirectory + ASSETS_DIR;
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
      file = `${dir}mask-${Date.now()}-${Math.random().toString(36).slice(2)}.png`;
      await FileSystem.writeAsStringAsync(file, rgba.encodeToBase64(), { encoding: FileSystem.EncodingType.Base64 });
      materialized.set(l.magicMaskUri, file);
    }
    layers.push({ ...l, magicMaskUri: file });
    changed = true;
  }
  return changed ? { ...doc, layers } : doc;
}
