import React from 'react';
import { View } from 'react-native';
import { Help, MiniButton, ValueSlider } from '../../components/common/controls';
import { useEditorStore } from '../../store/useEditorStore';
import type { PhotoAdjustments } from '../../types/editor';
import { useSelectedOf } from '../useSelected';

const KEYS: { key: keyof PhotoAdjustments; label: string }[] = [
  { key: 'brightness', label: 'Brillo' }, { key: 'contrast', label: 'Contraste' }, { key: 'saturation', label: 'Saturación' },
];
const ZERO: PhotoAdjustments = { brightness: 0, contrast: 0, saturation: 0 };

export function AdjustPanel() {
  const layer = useSelectedOf('image');
  const update = useEditorStore(s => s.update);
  if (!layer) return <Help>Selecciona una capa de imagen para ajustarla.</Help>;
  const adj = { ...ZERO, ...layer.adjustments };
  return <View style={{ gap: 4, paddingBottom: 8 }}>
    {KEYS.map(({ key, label }) => <ValueSlider key={key} label={label} value={Math.round(adj[key] * 100)} min={-100} max={100}
      onChange={v => update(layer.id, { adjustments: { ...adj, [key]: v / 100 } })} format={v => (v > 0 ? `+${Math.round(v)}` : String(Math.round(v)))} />)}
    <MiniButton label="Restablecer ajustes" onPress={() => update(layer.id, { adjustments: undefined })} />
  </View>;
}
