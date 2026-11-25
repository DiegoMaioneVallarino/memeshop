export type LayerBlendMode = 'srcOver' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten' | 'difference';
export type LayerMeta = { locked?: boolean; blendMode?: LayerBlendMode; groupId?: string; maskStrokes?: MaskStroke[] };
export type MaskStroke = { id: string; points: StrokePoint[]; radius: number; opacity: number; spread: number; restore: boolean; hardness?: number };
export type WarpSettings = { mode: 'push' | 'twirl' | 'bulge' | 'wave' | 'mesh'; centerX: number; centerY: number; radius: number; strength: number; frequency: number; strokes?: {x:number;y:number;dx:number;dy:number;strokeId?:number}[]; frozen?: {x:number;y:number;radius:number}[]; brushMode?: 'push' | 'freeze'; }
export type EffectStage = 'warp' | 'glitch' | 'recolor' | 'adjustments';
export type ImageLayer = { id: string; type: 'image'; name: string; uri: string; sourceWidth: number; sourceHeight: number; x: number; y: number; width: number; height: number; rotation: number; flipX?: boolean; opacity: number; visible: boolean; perspectiveX?: number; perspectiveY?: number; maskStrokes?: MaskStroke[]; magicMaskUri?: string; adjustments?: PhotoAdjustments; glitch?: number; colorReplace?: { source: string; target: string; tolerance: number; softness: number; strength: number }; warp?: WarpSettings; glitchSettings?: { mode: number; intensity: number; density: number; seed: number }; effectOrder?: EffectStage[]; effectDisabled?: EffectStage[] };
export type ShapeKind = 'rect' | 'rounded' | 'ellipse';
export type ShapeLayer = { id: string; type: 'shape'; name: string; color: string; shape?: ShapeKind; x: number; y: number; width: number; height: number; rotation: number; opacity: number; visible: boolean };
export type StrokePoint = { x: number; y: number };
export type BrushStroke = { id: string; points: StrokePoint[]; color: string; size: number; eraser: boolean; opacity?: number; hardness?: number; spread?: number };
export type PaintLayer = { id: string; type: 'paint'; name: string; x: number; y: number; width: number; height: number; rotation: number; opacity: number; visible: boolean; strokes: BrushStroke[] };
export type PhotoAdjustments = { brightness: number; contrast: number; saturation: number };
export type TextLayer = { id: string; type: 'text'; name: string; text: string; color: string; fontSize: number; align: 'left' | 'center' | 'right'; lineHeight: number; fontFamily?: string; letterSpacing?: number; highlightOpacity?: number; shadowOffsetX?: number; shadowOffsetY?: number; strokeWidth?: number; strokeColor?: string; shadowBlur?: number; shadowColor?: string; highlightColor?: string | null; x: number; y: number; width: number; height: number; rotation: number; opacity: number; visible: boolean };
export type EditorLayer = (ImageLayer | ShapeLayer | PaintLayer | TextLayer) & LayerMeta;
export type PhotoAsset = { uri: string; width: number; height: number; name?: string };
export type EditorDocument = { width: number; height: number; layers: EditorLayer[]; selectedId: string | null };
export type LayerType = EditorLayer['type'];
export type LayerOf<T extends LayerType> = Extract<EditorLayer, { type: T }>;
/**
 * Cambio parcial válido para ALGÚN tipo de capa (id y type no se pueden cambiar).
 * Es una unión de parciales: `{ fontSize: 20 }` solo encaja con TextLayer, `{ adjustments }` solo con ImageLayer.
 * Para comprobar el cambio contra un tipo concreto, usa `patchFor<'text'>({...})`.
 */
export type LayerPatch = { [T in LayerType]: Partial<Omit<LayerOf<T>, 'id' | 'type'>> }[LayerType];
export const patchFor = <T extends LayerType>(patch: Partial<Omit<LayerOf<T>, 'id' | 'type'>>): LayerPatch => patch as LayerPatch;
