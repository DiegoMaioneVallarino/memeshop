/**
 * Estado de la INTERFAZ del editor (no del documento): herramienta abierta, ajustes de pincel, varita, recorte…
 * Antes eran 39 useState dentro de EditorScreen. Aquí no hay historial: nada de esto se deshace.
 * Cada panel lee solo lo que necesita con un selector, así que mover un slider de pincel no re-renderiza el resto.
 */
import { create } from 'zustand';
import { initialCrop, type CropState } from '../utils/crop';

export type Tool =
  | 'tools' | 'adjust' | 'brush' | 'layers' | 'add' | 'transform' | 'effects' | 'text' | 'stickers'
  | 'images' | 'mask' | 'crop' | 'rotate' | 'perspective' | 'wand' | 'warp' | 'shape' | 'templates' | 'canvas' | 'photo' | 'liquify' | 'cutout' | 'collage' | 'scene';

/** Herramientas que abren una sesión de edición (Aplicar / Cancelar en la cabecera). */
export const EDIT_SESSION_TOOLS: Tool[] = ['effects', 'adjust', 'crop', 'rotate', 'perspective', 'warp', 'transform', 'wand', 'brush', 'mask', 'text', 'shape', 'canvas', 'liquify', 'cutout', 'collage', 'scene'];

export type TextTab = 'Estilos' | 'Fuente' | 'Trazo' | 'Color' | 'Resaltador' | 'Sombra';
export type BrushSettings = { color: string; size: number; eraser: boolean; opacity: number; hardness: number; spread: number };
export type MaskSettings = { mode: 'erase' | 'restore'; size: number; opacity: number; hardness: number; spread: number };
export type WandSettingsUi = { tolerance: number; feather: number; contiguous: boolean };
export type WandSession = { point: { x: number; y: number } | null; layerId: string | null; working: boolean };
export type GpuWand = { layerId: string; x: number; y: number; tolerance: number; feather: number };
import type { LiquifyMode } from '../utils/liquify';
import type { CompositionParams, PatternParams } from '../utils/pattern';
import type { PatternSource } from '../types/editor';
import { DEFAULT_COMPOSITION, DEFAULT_PATTERN } from '../utils/pattern';
/** Collage: stickers elegidos y parámetros. Las capas que genera se recuerdan para actualizarlas en vivo. */
export type CollageState = { mode: 'pattern' | 'random'; sources: PatternSource[]; pattern: PatternParams; composition: CompositionParams; randomBackground: boolean; patternLayerId: string | null; groupId: string | null };
/** Para qué se abrió la biblioteca de stickers en modo «elegir». */
export type StickerPick = { purpose: 'collage' } | { purpose: 'replace'; layerId: string; query: string };
export type LiquifySettings = { mode: LiquifyMode; size: number; strength: number };
/** Texto abierto en el editor a pantalla completa. `isNew`: se acaba de crear (Cancelar lo quita). */
export type TextEditing = { layerId: string; isNew: boolean; closeToolOnCancel: boolean };
export type AdjustTab = 'luz' | 'color' | 'detalle';
export type Toast = { id: number; message: string; actionLabel?: string; action?: () => void };

export const DEFAULT_PALETTE = ['#18e500', '#ffffff', '#111111', '#25c5ff', '#ffe05a', '#65e89b'];

type UiState = {
  tool: Tool | null;
  layersOpen: boolean;
  stickersOpen: boolean;
  templatesOpen: boolean;
  /** Botón de ojo pulsado: el lienzo muestra el «antes». */
  comparing: boolean;
  liquify: LiquifySettings;
  textEditing: TextEditing | null;
  adjustTab: AdjustTab;
  /** Quitar fondo en revisión: mover el lienzo, o corregir la selección borrando / restaurando. */
  cutoutBrush: 'view' | 'erase' | 'restore';
  /** La revisión de quitar fondo se abrió desde «Crear sticker»: al Aplicar se pregunta si guardarlo. */
  stickerFlow: boolean;
  /** Ventana «Guardar sticker» abierta para esta capa. */
  stickerSave: { layerId: string } | null;
  collage: CollageState;
  stickerPick: StickerPick | null;
  canvasFit: 'fit' | 'fill';
  pickingColor: boolean;
  busy: boolean;
  imageLoading: boolean;
  bgWorking: boolean;
  brush: BrushSettings;
  mask: MaskSettings;
  palette: string[];
  crop: CropState;
  textTab: TextTab;
  filterCategory: string;
  filterPreset: string;
  wand: WandSettingsUi;
  wandSession: WandSession;
  gpuWand: GpuWand | null;
  toast: Toast | null;

  set: (patch: Partial<Omit<UiState, 'set' | 'setBrush' | 'setMask' | 'setWand' | 'setLiquify' | 'setCollage' | 'setWandSession' | 'showToast' | 'hideToast' | 'resetForDocument'>>) => void;
  setBrush: (patch: Partial<BrushSettings>) => void;
  setMask: (patch: Partial<MaskSettings>) => void;
  setWand: (patch: Partial<WandSettingsUi>) => void;
  setLiquify: (patch: Partial<LiquifySettings>) => void;
  setCollage: (patch: Partial<CollageState>) => void;
  setWandSession: (patch: Partial<WandSession>) => void;
  showToast: (toast: Omit<Toast, 'id'>) => void;
  hideToast: () => void;
  /** Al abrir otro proyecto: cierra paneles y olvida selecciones temporales (los ajustes de pincel se conservan). */
  resetForDocument: () => void;
};

let toastId = 0;

export const useUiStore = create<UiState>((set) => ({
  tool: null,
  layersOpen: false,
  stickersOpen: false,
  templatesOpen: false,
  comparing: false,
  liquify: { mode: 'push', size: 60, strength: 50 },
  textEditing: null,
  adjustTab: 'luz',
  cutoutBrush: 'view',
  stickerFlow: false,
  stickerSave: null,
  collage: { mode: 'pattern', sources: [], pattern: DEFAULT_PATTERN, composition: DEFAULT_COMPOSITION, randomBackground: false, patternLayerId: null, groupId: null },
  stickerPick: null,
  canvasFit: 'fit',
  pickingColor: false,
  busy: false,
  imageLoading: false,
  bgWorking: false,
  brush: { color: '#18e500', size: 20, eraser: false, opacity: 100, hardness: 100, spread: 35 },
  mask: { mode: 'erase', size: 20, opacity: 100, hardness: 80, spread: 35 },
  palette: DEFAULT_PALETTE,
  crop: initialCrop,
  textTab: 'Fuente',
  filterCategory: 'TODOS',
  filterPreset: 'Ninguno',
  wand: { tolerance: 25, feather: 12, contiguous: true },
  wandSession: { point: null, layerId: null, working: false },
  gpuWand: null,
  toast: null,

  set: (patch) => set(patch),
  setBrush: (patch) => set(s => ({ brush: { ...s.brush, ...patch } })),
  setMask: (patch) => set(s => ({ mask: { ...s.mask, ...patch } })),
  setWand: (patch) => set(s => ({ wand: { ...s.wand, ...patch } })),
  setLiquify: (patch) => set(s => ({ liquify: { ...s.liquify, ...patch } })),
  setCollage: (patch) => set(s => ({ collage: { ...s.collage, ...patch } })),
  setWandSession: (patch) => set(s => ({ wandSession: { ...s.wandSession, ...patch } })),
  showToast: (toast) => set({ toast: { ...toast, id: ++toastId } }),
  hideToast: () => set({ toast: null }),
  resetForDocument: () => set({
    tool: null, layersOpen: false, stickersOpen: false, templatesOpen: false, comparing: false, textEditing: null, pickingColor: false, crop: initialCrop,
    wandSession: { point: null, layerId: null, working: false }, gpuWand: null, toast: null, filterPreset: 'Ninguno',
  }),
}));
