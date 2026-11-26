/** Vista «original» para el botón de comparar: el mismo documento sin efectos de imagen. Módulo puro. */
import type { EditorDocument, EditorLayer } from '../types/editor';

/**
 * Quita de cada imagen los efectos de color y deformación (ajustes, filtros, glitch, sustituir color, warp,
 * perspectiva, licuar). Se conservan la posición, los recortes, las máscaras y el resto de capas: así se compara
 * el efecto, no la composición.
 */
export function withoutEffects(doc: EditorDocument): EditorDocument {
  let changed = false;
  const layers = doc.layers.map((l): EditorLayer => {
    if (l.type !== 'image') return l;
    if (!l.adjustments && !l.glitch && !l.glitchSettings && !l.colorReplace && !l.warp && !l.liquify && !l.perspectiveX && !l.perspectiveY) return l;
    changed = true;
    return { ...l, adjustments: undefined, glitch: 0, glitchSettings: undefined, colorReplace: undefined, warp: undefined, liquify: undefined, perspectiveX: 0, perspectiveY: 0 };
  });
  return changed ? { ...doc, layers } : doc;
}

export const hasEffects = (doc: EditorDocument | null | undefined) => !!doc && withoutEffects(doc) !== doc;
