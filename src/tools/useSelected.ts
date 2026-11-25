import { useEditorStore } from '../store/useEditorStore';
import type { EditorLayer, LayerOf, LayerType } from '../types/editor';

/** Capa seleccionada. Solo re-renderiza cuando cambia ESA capa (el documento es inmutable). */
export function useSelectedLayer(): EditorLayer | undefined {
  return useEditorStore(s => s.document?.layers.find(l => l.id === s.document?.selectedId));
}
/** Capa seleccionada si es del tipo pedido; si no, undefined. */
export function useSelectedOf<T extends LayerType>(type: T): LayerOf<T> | undefined {
  const layer = useSelectedLayer();
  return layer?.type === type ? (layer as LayerOf<T>) : undefined;
}
