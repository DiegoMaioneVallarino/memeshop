/**
 * Normaliza toda imagen que entra al editor.
 *
 * - Lado largo máximo MAX_WORK_SIDE. Una foto de 48 MP (8000×6000) se convertía en una textura que muchas GPU
 *   de Android no pueden cargar (límite 4096 u 8192): la capa salía negra o la app se cerraba por memoria.
 * - Fotos sin transparencia → JPEG de alta calidad (una foto de 12 MP en PNG ocupaba ~25 MB; en JPEG ~3 MB).
 * - PNG / WebP (stickers, recortes) → PNG, para conservar el canal alfa.
 * - HEIC/HEIF y demás formatos de iPhone salen siempre convertidos a un formato que Skia decodifica.
 */
import * as ImageManipulator from 'expo-image-manipulator';

import { MAX_WORK_SIDE, fitWithin } from '../utils/limits';

export { MAX_WORK_SIDE, fitWithin };
const JPEG_QUALITY = 0.92;

export type NormalizedImage = { uri: string; width: number; height: number; downscaled: boolean };

const mayHaveAlpha = (uri: string, mimeType?: string | null) =>
  /png|webp|gif/i.test(mimeType ?? '') || /\.(png|webp|gif)(\?|$)/i.test(uri);

export async function normalizeImage(input: { uri: string; width?: number; height?: number; mimeType?: string | null }): Promise<NormalizedImage> {
  const keepAlpha = mayHaveAlpha(input.uri, input.mimeType);
  const actions: ImageManipulator.Action[] = [];
  let downscaled = false;
  if (input.width && input.height) {
    const fit = fitWithin(input.width, input.height);
    // Redimensionar solo por el lado largo conserva la proporción exacta.
    if (fit.scaled) { actions.push(input.width >= input.height ? { resize: { width: fit.width } } : { resize: { height: fit.height } }); downscaled = true; }
  }
  let out = await ImageManipulator.manipulateAsync(input.uri, actions, keepAlpha
    ? { format: ImageManipulator.SaveFormat.PNG }
    : { format: ImageManipulator.SaveFormat.JPEG, compress: JPEG_QUALITY });
  // Si el selector no informó dimensiones (pasa con algunos proveedores de Android), se comprueba después.
  if (!downscaled && Math.max(out.width, out.height) > MAX_WORK_SIDE) {
    const fit = fitWithin(out.width, out.height);
    out = await ImageManipulator.manipulateAsync(out.uri, [out.width >= out.height ? { resize: { width: fit.width } } : { resize: { height: fit.height } }], keepAlpha
      ? { format: ImageManipulator.SaveFormat.PNG }
      : { format: ImageManipulator.SaveFormat.JPEG, compress: JPEG_QUALITY });
    downscaled = true;
  }
  return { uri: out.uri, width: out.width, height: out.height, downscaled };
}
