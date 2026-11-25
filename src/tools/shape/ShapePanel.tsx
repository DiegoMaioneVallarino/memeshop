import React from 'react';
import { View } from 'react-native';
import { Help, MiniButton, SectionLabel, Segmented, Swatches, ValueSlider } from '../../components/common/controls';
import { fillPlaceholder } from '../../editor/templateActions';
import { useEditorStore } from '../../store/useEditorStore';
import { useUiStore } from '../../store/useUiStore';
import type { ShapeKind } from '../../types/editor';
import { useSelectedOf } from '../useSelected';

const COLORS = ['#18e500', '#ffffff', '#111111', '#ff304f', '#25c5ff', '#ffe05a', '#ff8800', '#a78bfa', '#fa8fff', '#0b3d0b'];
const KINDS: { id: ShapeKind; label: string }[] = [{ id: 'rect', label: 'Rectángulo' }, { id: 'rounded', label: 'Redondeado' }, { id: 'ellipse', label: 'Elipse' }];

export function ShapePanel() {
  const layer = useSelectedOf('shape');
  const update = useEditorStore(s => s.update);
  const palette = useUiStore(s => s.palette);
  if (!layer) return <Help>Selecciona una forma para editarla.</Help>;
  const canvasColors = palette.filter(c => !COLORS.includes(c));
  if (layer.placeholder) return <View style={{ gap: 8, paddingBottom: 8 }}>
    <Help>Este es un hueco de foto de la plantilla.</Help>
    <MiniButton label="Poner foto aquí" active onPress={() => void fillPlaceholder(layer.id)} />
    <MiniButton label="Convertir en forma de color" onPress={() => update(layer.id, { placeholder: false })} />
  </View>;
  return <View style={{ gap: 8, paddingBottom: 8 }}>
    <Segmented value={layer.shape ?? 'rect'} onChange={shape => update(layer.id, { shape })} options={KINDS} />
    <SectionLabel>Color</SectionLabel>
    <Swatches colors={COLORS} value={layer.color} onPick={color => update(layer.id, { color })} />
    {canvasColors.length > 0 && <><SectionLabel>Colores de la imagen</SectionLabel>
      <Swatches colors={canvasColors} value={layer.color} onPick={color => update(layer.id, { color })} /></>}
    <ValueSlider label="Opacidad" value={Math.round(layer.opacity * 100)} min={0} max={100}
      onChange={v => update(layer.id, { opacity: v / 100 })} format={v => `${Math.round(v)}%`} />
  </View>;
}
