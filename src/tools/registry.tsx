/** Qué panel y qué título corresponde a cada herramienta. Añadir una herramienta = una línea aquí + su Panel. */
import React from 'react';
import type { Tool } from '../store/useUiStore';
import { AdjustPanel } from './adjust/AdjustPanel';
import { BrushPanel, MaskPanel } from './brush/BrushPanels';
import { GeometryPanel } from './crop/GeometryPanel';
import { EffectsPanel } from './effects/EffectsPanel';
import { AddPanel, ToolsGrid } from './grid/ToolGrids';
import { ShapePanel } from './shape/ShapePanel';
import { TextPanel } from './text/TextPanel';
import { TransformPanel } from './transform/TransformPanel';
import { WandPanel } from './wand/WandPanel';
import { WarpPanel } from './warp/WarpPanel';

type PanelDef = { title: string; Panel: React.ComponentType };
export const TOOL_PANELS: Partial<Record<Tool, PanelDef>> = {
  tools: { title: 'Herramientas', Panel: ToolsGrid },
  add: { title: 'Añadir elemento', Panel: AddPanel },
  adjust: { title: 'Ajustes de imagen', Panel: AdjustPanel },
  brush: { title: 'Pincel', Panel: BrushPanel },
  mask: { title: 'Borrar / restaurar', Panel: MaskPanel },
  transform: { title: 'Transformar capa', Panel: TransformPanel },
  effects: { title: 'Efectos', Panel: EffectsPanel },
  crop: { title: 'Recortar', Panel: GeometryPanel },
  rotate: { title: 'Rotar', Panel: GeometryPanel },
  perspective: { title: 'Perspectiva', Panel: GeometryPanel },
  warp: { title: 'Deformar · GPU', Panel: WarpPanel },
  wand: { title: 'Varita mágica', Panel: WandPanel },
  text: { title: 'Texto', Panel: TextPanel },
  shape: { title: 'Forma', Panel: ShapePanel },
};
