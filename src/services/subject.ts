/**
 * "Quitar fondo" de un solo toque.
 *  1) Modelo nativo (Vision en iOS 17+, ML Kit en Android): máscara en ~100-300 ms según el dispositivo.
 *  2) Respaldo si no hay módulo o falla (Expo Go, simulador, iOS < 17): fondo conectado a los bordes por color.
 * Siempre devuelve una clave de máscara en memoria lista para `magicMaskUri`.
 */
import { alphaImage, registerMask } from './maskStore';
import { createBorderMask } from './magicWand';
import { isSubjectSegmentationSupported, NoSubjectError, segmentSubject } from '../../modules/subject-segmentation';

export type AutoBackgroundResult = { key: string; engine: 'native' | 'color' };

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
let B64_LOOKUP: Uint8Array | null = null;
/** Decodificador base64 -> bytes sin depender de atob (≈1-2 MB por máscara). */
function base64ToBytes(b64: string): Uint8Array {
  if (!B64_LOOKUP) { B64_LOOKUP = new Uint8Array(128); for (let i = 0; i < 64; i++) B64_LOOKUP[B64.charCodeAt(i)] = i; }
  const L = B64_LOOKUP;
  let len = b64.length;
  while (len > 0 && b64.charCodeAt(len - 1) === 61) len--; // '='
  const out = new Uint8Array(Math.floor((len * 3) / 4));
  let o = 0;
  for (let i = 0; i < len; i += 4) {
    const a = L[b64.charCodeAt(i)], b = L[b64.charCodeAt(i + 1)];
    const c = i + 2 < len ? L[b64.charCodeAt(i + 2)] : 0, d = i + 3 < len ? L[b64.charCodeAt(i + 3)] : 0;
    out[o++] = (a << 2) | (b >> 4);
    if (o < out.length) out[o++] = ((b & 15) << 4) | (c >> 2);
    if (o < out.length) out[o++] = ((c & 3) << 6) | d;
  }
  return out;
}

export async function removeBackgroundAuto(uri: string): Promise<AutoBackgroundResult> {
  if (isSubjectSegmentationSupported()) {
    try {
      const r = await segmentSubject(uri, { maxSide: 1280 });
      const bytes = base64ToBytes(r.data);
      if (bytes.length < r.width * r.height) throw new Error('Máscara incompleta');
      return { key: registerMask(alphaImage(bytes, r.width, r.height)), engine: 'native' };
    } catch (e) {
      if (e instanceof NoSubjectError) throw e; // no insistir con el color: el modelo ya dijo que no hay sujeto
      console.warn('Segmentación nativa falló; uso el respaldo por color:', e);
    }
  }
  return { key: await createBorderMask(uri), engine: 'color' };
}
