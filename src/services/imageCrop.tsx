import React from 'react';
import { Group, Image as SkiaImage, Skia, drawAsImage } from '@shopify/react-native-skia';
import type { SkImage } from '@shopify/react-native-skia';
import * as FileSystem from 'expo-file-system/legacy';
import type { Rect } from '../utils/crop';

/**
 * Crop + straighten in one pass, rendered with Skia (same engine as the editor, so the result matches the preview).
 * Works in the layer's DISPLAY space (displayW x displayH): the image is rotated about its center, then the
 * `frac` rectangle is cut out and scaled to source-pixel resolution. Empty corners stay transparent (PNG).
 */
export async function cropAndStraighten(uri: string, displayW: number, displayH: number, frac: Rect, angle: number, outW: number, outH: number) {
  const data = await Skia.Data.fromURI(uri);
  const img = Skia.Image.MakeImageFromEncoded(data);
  if (!img) throw new Error('No se pudo decodificar la imagen para recortarla.');
  const kx = outW / (frac.w * displayW), ky = outH / (frac.h * displayH);
  const scene = <Group transform={[
    { scaleX: kx }, { scaleY: ky },
    { translateX: -frac.x * displayW }, { translateY: -frac.y * displayH },
    { translateX: displayW / 2 }, { translateY: displayH / 2 }, { rotate: angle }, { translateX: -displayW / 2 }, { translateY: -displayH / 2 },
  ]}>
    <SkiaImage image={img} x={0} y={0} width={displayW} height={displayH} fit="fill" />
  </Group>;
  const out = await drawAsImage(scene, { width: outW, height: outH });
  const base64 = out.encodeToBase64();
  if (!FileSystem.cacheDirectory) throw new Error('No se encontró el directorio temporal.');
  const file = `${FileSystem.cacheDirectory}crop-${Date.now()}.png`;
  await FileSystem.writeAsStringAsync(file, base64, { encoding: FileSystem.EncodingType.Base64 });
  return file;
}

/**
 * Recorta/endereza la MÁSCARA con exactamente la misma transformación que la imagen, para que siga alineada.
 * La máscara cubre toda la imagen (es independiente de su resolución), así que se recorta a su propia resolución.
 * Devuelve un SkImage con el alfa de la máscara; las esquinas vacías tras enderezar quedan en 0 (quitadas), igual que la imagen.
 */
export async function cropMaskImage(mask: SkImage, displayW: number, displayH: number, frac: Rect, angle: number): Promise<SkImage> {
  const outW = Math.max(1, Math.round(mask.width() * frac.w)), outH = Math.max(1, Math.round(mask.height() * frac.h));
  const kx = outW / (frac.w * displayW), ky = outH / (frac.h * displayH);
  const scene = <Group transform={[
    { scaleX: kx }, { scaleY: ky },
    { translateX: -frac.x * displayW }, { translateY: -frac.y * displayH },
    { translateX: displayW / 2 }, { translateY: displayH / 2 }, { rotate: angle }, { translateX: -displayW / 2 }, { translateY: -displayH / 2 },
  ]}>
    <SkiaImage image={mask} x={0} y={0} width={displayW} height={displayH} fit="fill" />
  </Group>;
  return await drawAsImage(scene, { width: outW, height: outH });
}
