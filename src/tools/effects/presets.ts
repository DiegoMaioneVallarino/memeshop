import type { ImageLayer, LayerPatch, PhotoAdjustments } from '../../types/editor';

export const GLITCH_NAMES = ['Slice Repeat', 'Block Displacement', 'RGB Split', 'Pixel Sorting', 'VHS Tracking', 'Compression Corruption', 'Datamosh', 'Data Dropout', 'Bit Crush', 'Interlace Error'];
export const GLITCH_LAB_GROUPS: Record<string, string[]> = {
  ESTRUCTURA: ['Recursive Tear', 'Tile Scramble', 'Pixel Melt', 'Echo Trails'],
  DATOS: ['Memory Corruption', 'Bit Flip', 'Wrong Stride', 'Channel Corruption'],
  'SEÑAL': ['Sync Loss', 'Chroma Bleed', 'LCD Damage', 'Moiré Interference'],
  EXPERIMENTAL: ['Voronoi Shatter', 'Recursive Feedback', 'Noise Field Warp'],
};
/** El índice + 1 es el `mode` del shader de glitch: NO reordenar. */
export const ALL_GLITCH_NAMES = [...GLITCH_NAMES, ...Object.values(GLITCH_LAB_GROUPS).flat()];

export const COLOR_PRESETS: Record<string, PhotoAdjustments> = {
  Ninguno: { brightness: 0, contrast: 0, saturation: 0 },
  Vibrante: { brightness: .03, contrast: .16, saturation: .48 },
  Vintage: { brightness: .08, contrast: -.12, saturation: -.38 },
  Desaturado: { brightness: 0, contrast: .06, saturation: -1 },
  Brillante: { brightness: .18, contrast: .08, saturation: .12 },
  'Dramático': { brightness: -.08, contrast: .4, saturation: -.3 },
  Pastel: { brightness: .12, contrast: -.18, saturation: -.15 },
  'Frío': { brightness: -.03, contrast: .06, saturation: -.12 },
  'Cálido': { brightness: .09, contrast: .06, saturation: .22 },
};
export const RECOLOR = 'Sustituir color';

// ---- Estilos («looks»): combinaciones listas de ajustes + glitch ------------------------------------------------
export type Look = { id: string; name: string; description: string; adjustments: Partial<PhotoAdjustments>; glitch?: { name: string; intensity: number; density: number } };
export const LOOKS: Look[] = [
  { id: 'deep-fried', name: 'Deep fried', description: 'El clásico meme frito: color al máximo, nitidez y ruido.', adjustments: { saturation: 1, vibrance: .6, contrast: .7, exposure: .25, sharpness: 1, grain: .45, temperature: .35 } },
  { id: 'vaporwave', name: 'Vaporwave', description: 'Rosas y cianes lavados con desfase de color.', adjustments: { saturation: .35, tint: .6, temperature: -.45, contrast: .15, fade: .35, highlights: .2 }, glitch: { name: 'RGB Split', intensity: .35, density: .3 } },
  { id: 'vhs', name: 'VHS 1997', description: 'Cinta vieja: líneas de arrastre, color gastado y grano.', adjustments: { saturation: -.2, fade: .4, grain: .35, sharpness: -.3, temperature: .15 }, glitch: { name: 'VHS Tracking', intensity: .5, density: .45 } },
  { id: 'glitch', name: 'Glitch total', description: 'Imagen corrupta por bloques, como un video roto.', adjustments: { contrast: .25, saturation: .2 }, glitch: { name: 'Datamosh', intensity: .9, density: .6 } },
  { id: 'cyberpunk', name: 'Ciberpunk', description: 'Neón magenta y cian, contraste alto y bordes oscuros.', adjustments: { tint: .45, temperature: -.6, contrast: .35, saturation: .4, clarity: .4, vignette: .5 }, glitch: { name: 'Chroma Bleed', intensity: .4, density: .4 } },
  { id: 'noir', name: 'Cine negro', description: 'Blanco y negro dramático con viñeta y grano.', adjustments: { saturation: -1, contrast: .45, vignette: .7, grain: .3, shadows: -.2 } },
  { id: 'polaroid', name: 'Polaroid', description: 'Foto instantánea: cálida, desvanecida y suave.', adjustments: { fade: .45, temperature: .3, saturation: -.15, highlights: .2, vignette: .25, grain: .15 } },
  { id: 'pixel', name: '8 bits', description: 'Colores reducidos como en una consola vieja.', adjustments: { saturation: .3, contrast: .2 }, glitch: { name: 'Bit Crush', intensity: .8, density: .7 } },
  { id: 'lofi', name: 'Lo-fi', description: 'Tranquilo y gastado: poco color, grano y viñeta.', adjustments: { fade: .3, saturation: -.3, temperature: .2, grain: .5, sharpness: -.4, vignette: .4 } },
];
export const LOOK_NAMES = LOOKS.map(l => l.name);

/** Qué hace cada filtro, en una línea (se muestra al elegirlo). */
export const FILTER_DESCRIPTIONS: Record<string, string> = {
  Ninguno: 'La imagen sin filtro de color.', Vibrante: 'Colores más vivos y algo más de contraste.', Vintage: 'Tonos apagados y suaves, como una foto antigua.',
  Desaturado: 'Blanco y negro.', Brillante: 'Más luz y un poco más de color.', 'Dramático': 'Mucho contraste y poco color.',
  Pastel: 'Suave y claro, con colores lavados.', 'Frío': 'Un poco más oscuro y menos saturado.', 'Cálido': 'Más luz y colores más cálidos.',
  [RECOLOR]: 'Cambia un color de la imagen por otro.',
  'Slice Repeat': 'Franjas horizontales repetidas.', 'Block Displacement': 'Bloques desplazados de su sitio.', 'RGB Split': 'Los canales rojo, verde y azul se separan.',
  'Pixel Sorting': 'Píxeles estirados en columnas.', 'VHS Tracking': 'Líneas de arrastre de una cinta VHS.', 'Compression Corruption': 'Bloques de compresión rota.',
  Datamosh: 'Imagen arrastrada como un video corrupto.', 'Data Dropout': 'Zonas que desaparecen como datos perdidos.', 'Bit Crush': 'Menos colores, efecto 8 bits.',
  'Interlace Error': 'Líneas entrelazadas desfasadas.', 'Recursive Tear': 'Desgarros que se repiten.', 'Tile Scramble': 'Mosaico desordenado.',
  'Pixel Melt': 'Los píxeles se derriten hacia abajo.', 'Echo Trails': 'Estela de copias fantasma.', 'Memory Corruption': 'Ruido de memoria dañada.',
  'Bit Flip': 'Colores invertidos al azar.', 'Wrong Stride': 'Imagen desfasada en diagonal.', 'Channel Corruption': 'Un canal de color se rompe.',
  'Sync Loss': 'Pérdida de sincronía de la señal.', 'Chroma Bleed': 'El color se escurre fuera de los bordes.', 'LCD Damage': 'Pantalla con píxeles dañados.',
  'Moiré Interference': 'Patrón de interferencia en ondas.', 'Voronoi Shatter': 'Imagen rota en fragmentos.', 'Recursive Feedback': 'Bucle de retroalimentación.',
  'Noise Field Warp': 'Deformación con ruido.',
  ...Object.fromEntries(LOOKS.map(l => [l.name, l.description])),
};

const ZERO_ADJ: PhotoAdjustments = { brightness: 0, contrast: 0, saturation: 0 };
/**
 * Cambios que aplica un filtro a una imagen. Puro: lo usan el panel y las vistas previas.
 * - Estilo: reemplaza ajustes y glitch por los suyos.
 * - Color: cambia brillo/contraste/saturación y conserva el resto de ajustes.
 * - Glitch: cambia el modo de glitch (conserva la semilla).
 */
export function filterPatch(name: string, layer: Pick<ImageLayer, 'adjustments' | 'colorReplace' | 'glitchSettings'>): LayerPatch {
  const look = LOOKS.find(l => l.name === name);
  if (look) {
    const g = look.glitch ? ALL_GLITCH_NAMES.indexOf(look.glitch.name) : -1;
    return { adjustments: { ...ZERO_ADJ, ...look.adjustments }, glitch: 0,
      glitchSettings: g >= 0 && look.glitch ? { mode: g + 1, intensity: look.glitch.intensity, density: look.glitch.density, seed: layer.glitchSettings?.seed ?? 1337 } : undefined };
  }
  if (name === RECOLOR) return { colorReplace: layer.colorReplace ?? { source: '#18e500', target: '#ff304f', tolerance: .15, softness: .08, strength: 1 } };
  const glitchIndex = ALL_GLITCH_NAMES.indexOf(name);
  if (glitchIndex >= 0) return { glitch: 0, glitchSettings: { mode: glitchIndex + 1, intensity: .65, density: .55, seed: layer.glitchSettings?.seed ?? 1337 } };
  if (name === 'Ninguno') return { adjustments: undefined, glitchSettings: undefined, glitch: 0, colorReplace: undefined };
  return { adjustments: { ...ZERO_ADJ, ...layer.adjustments, ...COLOR_PRESETS[name] } };
}

export const FILTER_CATEGORIES: Record<string, string[]> = {
  TODOS: ['Ninguno', ...LOOK_NAMES, RECOLOR, ...Object.keys(COLOR_PRESETS).filter(n => n !== 'Ninguno'), ...ALL_GLITCH_NAMES],
  ESTILOS: ['Ninguno', ...LOOK_NAMES],
  COLOR: ['Ninguno', 'Vibrante', 'Desaturado', 'Brillante', 'Frío', 'Cálido', RECOLOR],
  ESTILO: ['Vintage', 'Dramático', 'Pastel'],
  GLITCH: GLITCH_NAMES,
  ...GLITCH_LAB_GROUPS,
};
export const RECOLOR_SWATCHES = ['#18e500', '#ffffff', '#111111', '#ff304f', '#25c5ff', '#ffe05a', '#0000ff', '#ff8800'];
