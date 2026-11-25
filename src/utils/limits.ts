/** Límites de trabajo. Módulo puro (sin React Native) para poder probarlo en Node. */

/** 4096 es el límite de textura que soportan prácticamente todas las GPU móviles. */
export const MAX_WORK_SIDE = 4096;

export function fitWithin(width: number, height: number, maxSide = MAX_WORK_SIDE) {
  const k = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)), scaled: k < 1 };
}
