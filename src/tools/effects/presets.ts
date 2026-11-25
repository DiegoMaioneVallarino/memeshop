import type { PhotoAdjustments } from '../../types/editor';

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

export const FILTER_CATEGORIES: Record<string, string[]> = {
  TODOS: [RECOLOR, ...Object.keys(COLOR_PRESETS), ...ALL_GLITCH_NAMES],
  COLOR: ['Ninguno', 'Vibrante', 'Desaturado', 'Brillante', 'Frío', 'Cálido', RECOLOR],
  ESTILO: ['Vintage', 'Dramático', 'Pastel'],
  GLITCH: GLITCH_NAMES,
  ...GLITCH_LAB_GROUPS,
};
export const RECOLOR_SWATCHES = ['#18e500', '#ffffff', '#111111', '#ff304f', '#25c5ff', '#ffe05a', '#0000ff', '#ff8800'];
