/** Utilidades puras de plantillas (probadas en tests/templates.test.ts). */
import type { EditorDocument, EditorLayer } from '../types/editor';

const fresh = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

/** Copia de las capas con ids nuevos (y grupos nuevos): usar la misma plantilla dos veces no repite ids. */
export function instantiateLayers(layers: EditorLayer[]): EditorLayer[] {
  const groups = new Map<string, string>();
  return layers.map(l => {
    let groupId = l.groupId;
    if (groupId) { if (!groups.has(groupId)) groups.set(groupId, fresh('g')); groupId = groups.get(groupId); }
    return { ...l, id: fresh(l.type), groupId };
  });
}

export function instantiateDocument(doc: EditorDocument): EditorDocument {
  const layers = instantiateLayers(doc.layers);
  // Se selecciona el primer hueco de foto (o el primer texto) para que el siguiente paso sea obvio.
  const first = layers.find(l => l.type === 'shape' && l.placeholder) ?? layers.find(l => l.type === 'text') ?? null;
  return { ...doc, layers, selectedId: first?.id ?? null };
}

/** Recorte centrado que cubre un hueco de proporción `slotW/slotH` (rectángulo en píxeles de la fuente). */
export function coverCrop(srcW: number, srcH: number, slotW: number, slotH: number) {
  const target = slotW / slotH;
  if (srcW / srcH > target) {
    const width = Math.max(1, Math.round(srcH * target));
    return { originX: Math.round((srcW - width) / 2), originY: 0, width, height: srcH };
  }
  const height = Math.max(1, Math.round(srcW / target));
  return { originX: 0, originY: Math.round((srcH - height) / 2), width: srcW, height };
}

export const placeholderCount = (doc: EditorDocument | null | undefined) =>
  doc ? doc.layers.filter(l => l.type === 'shape' && l.placeholder).length : 0;
