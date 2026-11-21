import * as ExpoCore from 'expo-modules-core';

/** Máscara A8 cruda (w*h bytes, 255 = sujeto) en base64. Ya viene orientada como la imagen. */
export type SegmentResult = { width: number; height: number; data: string };
type Native = {
  isSupported(): boolean;
  segment(uri: string, maxSide: number, tapX: number, tapY: number): Promise<SegmentResult>;
};
// Opcional: en Expo Go, simulador sin Vision o builds sin el módulo, queda null y la app usa el respaldo por color.
const native: Native | null = (() => {
  try {
    const core: any = ExpoCore;
    if (typeof core.requireOptionalNativeModule === 'function') return core.requireOptionalNativeModule('SubjectSegmentation') as Native | null;
    if (typeof core.requireNativeModule === 'function') return core.requireNativeModule('SubjectSegmentation') as Native; // lanza si no está enlazado
  } catch { /* módulo no enlazado: se usa el respaldo por color */ }
  return null;
})();

export class NoSubjectError extends Error { constructor() { super('No se detectó ningún sujeto en la imagen.'); } }

export const isSubjectSegmentationSupported = (): boolean => { try { return !!native && native.isSupported(); } catch { return false; } };

/**
 * iOS 17+: Vision (VNGenerateForegroundInstanceMaskRequest). Android: ML Kit Subject Segmentation.
 * `tap` (0..1, origen arriba-izquierda) elige UN sujeto; sin `tap` se devuelven todos.
 */
export async function segmentSubject(uri: string, opts: { maxSide?: number; tap?: { x: number; y: number } } = {}): Promise<SegmentResult> {
  if (!native) throw new Error('Módulo de segmentación no disponible');
  try {
    return await native.segment(uri, opts.maxSide ?? 1280, opts.tap?.x ?? -1, opts.tap?.y ?? -1);
  } catch (e: any) {
    if (e?.code === 'E_NO_SUBJECT') throw new NoSubjectError();
    throw e;
  }
}
