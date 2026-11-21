/** Varita mágica por color. Sin red, sin modelo. Máscara A8 en memoria; la imagen se decodifica y convierte a Oklab una sola vez. */
import { Skia } from '@shopify/react-native-skia';
import * as ImageManipulator from 'expo-image-manipulator';
import { alphaImage, registerMask } from './maskStore';
import { buildLab, computeAlpha, type LabBuffer, type Region, type WandSettings } from './wandCore';

export type { WandSettings } from './wandCore';

const WORK_WIDTH = 768;
const CACHE_SIZE = 2;
const cache = new Map<string, Promise<LabBuffer>>();

async function decodeLab(uri: string): Promise<LabBuffer> {
  const resized = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: WORK_WIDTH } }], { format: ImageManipulator.SaveFormat.PNG });
  const image = Skia.Image.MakeImageFromEncoded(await Skia.Data.fromURI(resized.uri));
  if (!image) throw new Error('No se pudo decodificar la imagen');
  const w = image.width(), h = image.height();
  const pixels = image.readPixels(0, 0);
  if (!pixels || pixels.length < w * h * 4) throw new Error('No se pudieron leer los píxeles');
  return buildLab(pixels, w, h);
}

/** Lab cacheado por imagen (LRU de 2): mover un slider ya no vuelve a redimensionar, decodificar ni convertir. */
export function getLab(uri: string): Promise<LabBuffer> {
  let p = cache.get(uri);
  if (p) { cache.delete(uri); cache.set(uri, p); return p; }
  p = decodeLab(uri);
  cache.set(uri, p);
  p.catch(() => cache.delete(uri));
  while (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value as string);
  return p;
}
export const dropLab = (uri: string) => { cache.delete(uri); };

async function maskFor(uri: string, region: Region, settings: WandSettings): Promise<string> {
  const buf = await getLab(uri);
  return registerMask(alphaImage(computeAlpha(buf, region, settings), buf.w, buf.h));
}

/** Coordenadas normalizadas 0..1 respecto a la imagen. Devuelve una clave de máscara en memoria (mem-mask:...). */
export const createMagicMask = (uri: string, nx: number, ny: number, settings: WandSettings) =>
  maskFor(uri, { kind: 'seed', x: nx, y: ny }, settings);

/** Fondo conectado a los bordes, con el color de fondo detectado solo. Es el respaldo cuando no hay modelo nativo. */
export const createBorderMask = (uri: string, settings: Partial<WandSettings> = {}) =>
  maskFor(uri, { kind: 'border' }, { tolerance: 18, feather: 8, contiguous: true, ...settings });
