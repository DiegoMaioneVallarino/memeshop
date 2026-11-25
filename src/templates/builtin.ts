/**
 * Plantillas incluidas: estructuras de meme ORIGINALES (no contienen imágenes de memes existentes).
 * Los huecos de foto son formas con `placeholder: true`; el usuario los rellena con «Poner foto».
 * Módulo puro: las plantillas se generan en código, sin archivos.
 */
import type { EditorDocument, EditorLayer, ShapeLayer, TextLayer } from '../types/editor';
import type { MemeTemplate } from '../services/templates';

let n = 0;
const id = (p: string) => `${p}-${++n}`;

function text(t: string, x: number, y: number, width: number, fontSize: number, style: Partial<TextLayer> = {}): TextLayer {
  const lineHeight = style.lineHeight ?? 1.15;
  const lines = t.split('\n').length;
  return { id: id('t'), type: 'text', name: t.split('\n')[0].slice(0, 28), text: t, color: '#ffffff', fontSize, fontFamily: 'Anton',
    strokeWidth: Math.max(2, fontSize * .055), strokeColor: '#000000', shadowBlur: 0, shadowColor: '#000000', highlightColor: null,
    align: 'center', lineHeight, x, y, width, height: fontSize * lineHeight * lines, rotation: 0, opacity: 1, visible: true, ...style };
}
const plain = (color = '#111111', fontFamily = 'Montserrat'): Partial<TextLayer> => ({ color, fontFamily, strokeWidth: 0 });

function slot(name: string, x: number, y: number, width: number, height: number): ShapeLayer {
  return { id: id('slot'), type: 'shape', name, color: '#d9d9d9', placeholder: true, shape: 'rect', x, y, width, height, rotation: 0, opacity: 1, visible: true };
}
function block(color: string, x: number, y: number, width: number, height: number, name = 'Fondo'): EditorLayer {
  return { id: id('bg'), type: 'shape', name, color, shape: 'rect', x, y, width, height, rotation: 0, opacity: 1, visible: true, locked: true };
}
const doc = (width: number, height: number, layers: EditorLayer[], background = '#ffffff'): EditorDocument => ({ width, height, layers, selectedId: null, background });

function tpl(key: string, name: string, kind: MemeTemplate['kind'], document: EditorDocument): MemeTemplate {
  return { id: `builtin-${key}`, name, kind, builtIn: true, createdAt: 0, updatedAt: 0, document };
}

export const BUILTIN_TEMPLATES: MemeTemplate[] = [
  tpl('top-bottom', 'Clásico arriba y abajo', 'overlay', doc(1080, 1080, [
    text('TEXTO DE ARRIBA', 40, 36, 1000, 110),
    text('TEXTO DE ABAJO', 40, 1080 - 36 - 110 * 1.15, 1000, 110),
  ])),
  tpl('subtitle', 'Subtítulo de película', 'overlay', doc(1080, 1080, [
    text('y entonces me di cuenta…', 90, 900, 900, 54, { ...plain('#ffffff'), highlightColor: '#000000', highlightOpacity: .7, fontFamily: 'Montserrat' }),
  ])),
  tpl('caption', 'Título + foto', 'layout', doc(1080, 1350, [
    text('cuando dices "solo un capítulo más"\ny ya son las 4 a.m.', 60, 70, 960, 54, { ...plain(), align: 'left', lineHeight: 1.25 }),
    slot('Foto', 0, 290, 1080, 1060),
  ])),
  tpl('compare-2', 'Esto no / Esto sí', 'layout', doc(1080, 1080, [
    slot('Foto 1', 0, 0, 540, 540), slot('Foto 2', 0, 540, 540, 540),
    text('Lo que me\npiden hacer', 580, 200, 460, 60, plain()),
    text('Lo que\nhago', 580, 740, 460, 60, plain()),
    block('#111111', 0, 538, 1080, 4, 'Separador'),
  ])),
  tpl('escalation-4', 'Escalada en 4 pasos', 'layout', doc(1080, 1440, [
    ...[0, 1, 2, 3].flatMap(i => [
      slot(`Foto ${i + 1}`, 540, i * 360, 540, 360),
      text(['Nivel 1', 'Nivel 2', 'Nivel 3', 'Nivel máximo'][i], 30, i * 360 + 140, 480, 64, plain()),
      ...(i ? [block('#111111', 0, i * 360 - 2, 1080, 4, 'Separador')] : []),
    ]),
  ])),
  tpl('before-after', 'Antes / Después', 'layout', doc(1080, 1080, [
    slot('Antes', 0, 0, 536, 1080), slot('Después', 544, 0, 536, 1080),
    text('ANTES', 0, 940, 536, 96), text('DESPUÉS', 544, 940, 536, 96),
  ], '#000000')),
  tpl('expect-reality', 'Expectativa vs realidad', 'layout', doc(1080, 1350, [
    slot('Expectativa', 0, 0, 1080, 671), slot('Realidad', 0, 679, 1080, 671),
    text('EXPECTATIVA', 40, 560, 1000, 88), text('REALIDAD', 40, 1240, 1000, 88),
  ], '#000000')),
  tpl('demotivator', 'Desmotivador', 'layout', doc(1200, 1000, [
    block('#ffffff', 96, 56, 1008, 648, 'Marco'),
    slot('Foto', 104, 64, 992, 632),
    text('PERSEVERANCIA', 60, 740, 1080, 92, { ...plain('#ffffff', 'Gelasio'), letterSpacing: 6 }),
    text('A veces rendirse también es una opción.', 60, 860, 1080, 40, plain('#dddddd')),
  ], '#000000')),
];
