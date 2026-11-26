import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Help, MiniButton, ValueSlider, theme } from '../../components/common/controls';
import { useEditorStore } from '../../store/useEditorStore';
import { useUiStore } from '../../store/useUiStore';
import type { LiquifyMode } from '../../utils/liquify';
import { useSelectedOf } from '../useSelected';

const MODES: { id: LiquifyMode; label: string; icon: React.ComponentProps<typeof Feather>['name']; help: string }[] = [
  { id: 'push', label: 'Deformar', icon: 'move', help: 'Arrastra para empujar la imagen en la dirección del dedo.' },
  { id: 'twirlCW', label: 'Girar ↻', icon: 'rotate-cw', help: 'Mantén pulsado para girar en el sentido del reloj.' },
  { id: 'twirlCCW', label: 'Girar ↺', icon: 'rotate-ccw', help: 'Mantén pulsado para girar en sentido contrario.' },
  { id: 'pinch', label: 'Reducir', icon: 'minimize-2', help: 'Mantén pulsado para encoger lo que está bajo el pincel.' },
  { id: 'bloat', label: 'Ampliar', icon: 'maximize-2', help: 'Mantén pulsado para inflar lo que está bajo el pincel.' },
  { id: 'restore', label: 'Restaurar', icon: 'refresh-ccw', help: 'Pinta para devolver esa zona a su forma original.' },
];

export function LiquifyPanel() {
  const layer = useSelectedOf('image');
  const opts = useUiStore(s => s.liquify), setLiquify = useUiStore(s => s.setLiquify);
  const update = useEditorStore(s => s.update);
  if (!layer) return <Help>Selecciona una capa de imagen para licuarla.</Help>;
  const current = MODES.find(m => m.id === opts.mode) ?? MODES[0];
  return <View style={{ gap: 6, paddingBottom: 10 }}>
    <ValueSlider label="Tamaño" value={opts.size} min={10} max={200} onChange={v => setLiquify({ size: v })} format={v => String(Math.round(v))} />
    <ValueSlider label="Intensidad" value={opts.strength} min={1} max={100} onChange={v => setLiquify({ strength: v })} format={v => String(Math.round(v))} />
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4, paddingVertical: 4 }}>
      {MODES.map(m => {
        const active = m.id === opts.mode;
        return <Pressable key={m.id} accessibilityLabel={m.label} onPress={() => setLiquify({ mode: m.id })} style={[s.mode, active && s.modeActive]}>
          <Feather name={m.icon} size={22} color={active ? theme.accent : '#fff'} />
          <Text style={[s.modeText, active && { color: theme.accent }]}>{m.label}</Text>
        </Pressable>;
      })}
    </ScrollView>
    <Help>{current.help} Dos dedos mueven y acercan el lienzo.</Help>
    {layer.liquify && <MiniButton label="Restablecer toda la deformación" onPress={() => update(layer.id, { liquify: undefined })} />}
  </View>;
}
const s = StyleSheet.create({
  mode: { width: 78, alignItems: 'center', gap: 6, paddingVertical: 9, borderRadius: 10 },
  modeActive: { backgroundColor: '#2a2a2a' },
  modeText: { color: '#fff', fontSize: 12 },
});
