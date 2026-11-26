/**
 * Vistas previas de los filtros: la misma imagen de referencia con cada filtro aplicado, dibujada por el propio
 * motor (así la miniatura es exactamente el resultado). Se generan una a una en segundo plano y se guardan en memoria.
 *
 * La imagen de referencia es src/assets/filter-preview.png (por defecto, el logo de Memeshop). Para usar otra,
 * reemplaza ese archivo por un dibujo propio con el mismo nombre.
 */
import { useEffect, useState } from 'react';
import { Image } from 'react-native';
import type { EditorDocument, ImageLayer } from '../../types/editor';
import { renderThumbnailBase64 } from '../../components/editor/PhotoCanvas';
import { filterPatch } from './presets';

const SIZE = 160;
const source = Image.resolveAssetSource(require('../../assets/filter-preview.png'));
const cache = new Map<string, string>();
const listeners = new Map<string, Set<(uri: string) => void>>();
let queue: Promise<unknown> = Promise.resolve();

function previewDoc(name: string): EditorDocument {
  const k = SIZE / Math.min(source.width || SIZE, source.height || SIZE); // recorte cuadrado (cubre)
  const w = (source.width || SIZE) * k, h = (source.height || SIZE) * k;
  const base: ImageLayer = { id: 'preview', type: 'image', name: 'preview', uri: source.uri, sourceWidth: source.width || SIZE, sourceHeight: source.height || SIZE,
    x: (SIZE - w) / 2, y: (SIZE - h) / 2, width: w, height: h, rotation: 0, opacity: 1, visible: true };
  const layer = { ...base, ...filterPatch(name, base) } as ImageLayer;
  return { width: SIZE, height: SIZE, layers: [layer], selectedId: null, background: '#ffffff' };
}

function request(name: string) {
  if (cache.has(name) || listeners.get(name)?.size === undefined) return;
  queue = queue.then(async () => {
    if (cache.has(name)) return;
    try {
      const b64 = await renderThumbnailBase64(previewDoc(name), SIZE);
      const uri = `data:image/jpeg;base64,${b64}`;
      cache.set(name, uri);
      listeners.get(name)?.forEach(l => l(uri));
    } catch (e) { console.warn('Vista previa de filtro:', name, e); }
  });
}

/** URI de la miniatura del filtro, o null mientras se genera. */
export function useFilterPreview(name: string): string | null {
  const [uri, setUri] = useState(cache.get(name) ?? null);
  useEffect(() => {
    if (uri) return;
    let set = listeners.get(name);
    if (!set) { set = new Set(); listeners.set(name, set); }
    set.add(setUri);
    request(name);
    return () => { set!.delete(setUri); };
  }, [name, uri]);
  return uri;
}
