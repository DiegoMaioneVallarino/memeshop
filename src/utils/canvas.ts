/** Tamaños de lienzo y redimensionado del documento. Módulo puro: probado en tests/canvas.test.ts. */
import type { EditorDocument, EditorLayer } from '../types/editor';

export type CanvasPreset = { id: string; network: string; label: string; width: number; height: number };

/** Medidas recomendadas por cada red (píxeles). */
export const CANVAS_PRESETS: CanvasPreset[] = [
  { id: 'ig-square', network: 'Instagram', label: 'Publicación 1:1', width: 1080, height: 1080 },
  { id: 'ig-portrait', network: 'Instagram', label: 'Retrato 4:5', width: 1080, height: 1350 },
  { id: 'story', network: 'Historias · Reels · TikTok', label: 'Vertical 9:16', width: 1080, height: 1920 },
  { id: 'wa-status', network: 'WhatsApp', label: 'Estado 9:16', width: 1080, height: 1920 },
  { id: 'x-post', network: 'X / Twitter', label: 'Publicación 16:9', width: 1600, height: 900 },
  { id: 'fb-post', network: 'Facebook', label: 'Publicación 1.91:1', width: 1200, height: 630 },
  { id: 'yt-thumb', network: 'YouTube', label: 'Miniatura 16:9', width: 1280, height: 720 },
  { id: 'pinterest', network: 'Pinterest', label: 'Pin 2:3', width: 1000, height: 1500 },
  { id: 'reddit', network: 'Reddit', label: 'Imagen 4:3', width: 1200, height: 900 },
];

export type ResizeMode = 'fit' | 'fill';

/** Escala una capa alrededor del centro del lienzo: centro → (c - viejoCentro)·k + nuevoCentro. */
function scaleLayer(l: EditorLayer, k: number, ox: number, oy: number, W: number, H: number, w: number, h: number): EditorLayer {
  const cx = (l.x + l.width / 2 - W / 2) * k + w / 2 + ox;
  const cy = (l.y + l.height / 2 - H / 2) * k + h / 2 + oy;
  const width = l.width * k, height = l.height * k;
  // Las máscaras de goma viven en coordenadas locales de la capa: escalan con ella.
  const maskStrokes = l.maskStrokes?.map(s => ({ ...s, radius: s.radius * k, points: s.points.map(p => ({ x: p.x * k, y: p.y * k })) }));
  const base = { ...l, x: cx - width / 2, y: cy - height / 2, width, height, ...(maskStrokes ? { maskStrokes } : {}) };
  if (l.type === 'text') {
    return { ...base, type: 'text', fontSize: l.fontSize * k, letterSpacing: l.letterSpacing !== undefined ? l.letterSpacing * k : undefined,
      strokeWidth: l.strokeWidth !== undefined ? l.strokeWidth * k : undefined, shadowBlur: l.shadowBlur !== undefined ? l.shadowBlur * k : undefined,
      shadowOffsetX: l.shadowOffsetX !== undefined ? l.shadowOffsetX * k : undefined, shadowOffsetY: l.shadowOffsetY !== undefined ? l.shadowOffsetY * k : undefined } as EditorLayer;
  }
  if (l.type === 'paint') {
    // Los trazos de pintura tampoco escalan solos con el ancho de la capa.
    return { ...base, type: 'paint', strokes: l.strokes.map(s => ({ ...s, size: s.size * k, points: s.points.map(p => ({ x: p.x * k, y: p.y * k })) })) } as EditorLayer;
  }
  return base as EditorLayer;
}

/**
 * Cambia el tamaño del lienzo conservando la composición.
 * - fit: todo el contenido cabe (puede quedar margen con el color de fondo).
 * - fill: el contenido cubre todo el lienzo (puede recortarse por los lados).
 */
export function resizeDocument(doc: EditorDocument, width: number, height: number, mode: ResizeMode): EditorDocument {
  const W = doc.width, H = doc.height;
  const k = mode === 'fit' ? Math.min(width / W, height / H) : Math.max(width / W, height / H);
  return { ...doc, width, height, layers: doc.layers.map(l => scaleLayer(l, k, 0, 0, W, H, width, height)) };
}

/** Escala capas de un documento de referencia (p. ej. una plantilla) para colocarlas encima de otro lienzo. */
export function fitLayersTo(layers: EditorLayer[], from: { width: number; height: number }, to: { width: number; height: number }, mode: ResizeMode = 'fit'): EditorLayer[] {
  const k = mode === 'fit' ? Math.min(to.width / from.width, to.height / from.height) : Math.max(to.width / from.width, to.height / from.height);
  return layers.map(l => scaleLayer(l, k, 0, 0, from.width, from.height, to.width, to.height));
}

/** Proporción legible: 1080×1350 → "4:5". */
export function ratioLabel(w: number, h: number) {
  const g = (a: number, b: number): number => (b ? g(b, a % b) : a);
  const d = g(Math.round(w), Math.round(h));
  const a = Math.round(w) / d, b = Math.round(h) / d;
  return a <= 50 && b <= 50 ? `${a}:${b}` : `${(w / h).toFixed(2)}:1`;
}
