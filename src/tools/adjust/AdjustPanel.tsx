import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Help, ValueSlider, theme } from '../../components/common/controls';
import { useEditorStore } from '../../store/useEditorStore';
import { useUiStore, type AdjustTab } from '../../store/useUiStore';
import type { PhotoAdjustments } from '../../types/editor';
import { useSelectedOf } from '../useSelected';

type Key = keyof PhotoAdjustments;
const TABS: { id: AdjustTab; label: string; icon: React.ComponentProps<typeof Feather>['name']; keys: { key: Key; label: string }[] }[] = [
  { id: 'luz', label: 'Luz', icon: 'sun', keys: [
    { key: 'exposure', label: 'Exposición' }, { key: 'brightness', label: 'Brillo' }, { key: 'contrast', label: 'Contraste' },
    { key: 'highlights', label: 'Luces' }, { key: 'shadows', label: 'Sombras' },
  ] },
  { id: 'color', label: 'Color', icon: 'droplet', keys: [
    { key: 'saturation', label: 'Saturación' }, { key: 'vibrance', label: 'Intensidad' },
    { key: 'temperature', label: 'Temperatura' }, { key: 'tint', label: 'Tono' },
  ] },
  { id: 'detalle', label: 'Detalle', icon: 'aperture', keys: [
    { key: 'clarity', label: 'Claridad' }, { key: 'sharpness', label: 'Nitidez' }, { key: 'vignette', label: 'Viñeta' },
    { key: 'grain', label: 'Grano' }, { key: 'fade', label: 'Desvanecer' },
  ] },
];
const ZERO: PhotoAdjustments = { brightness: 0, contrast: 0, saturation: 0 };
const signed = (v: number) => (v > 0 ? `+${Math.round(v)}` : String(Math.round(v)));

export function AdjustPanel() {
  const layer = useSelectedOf('image');
  const update = useEditorStore(s => s.update);
  const tab = useUiStore(s => s.adjustTab), set = useUiStore(s => s.set);
  if (!layer) return <Help>Selecciona una capa de imagen para ajustarla.</Help>;
  const adj: PhotoAdjustments = { ...ZERO, ...layer.adjustments };
  const current = TABS.find(t => t.id === tab) ?? TABS[0];
  const touched = current.keys.some(k => Math.abs(adj[k.key] ?? 0) > .0001);
  const resetTab = () => { const next = { ...adj }; for (const k of current.keys) next[k.key] = 0; update(layer.id, { adjustments: next }); };
  return <View style={{ gap: 2, paddingBottom: 8 }}>
    <View style={s.head}>
      <Text style={s.title}>{current.label}</Text>
      <Pressable disabled={!touched} onPress={resetTab} hitSlop={8} style={[s.reset, !touched && { opacity: .35 }]}>
        <Feather name="refresh-ccw" size={14} color={theme.accent} /><Text style={s.resetText}>Reiniciar</Text>
      </Pressable>
    </View>
    {current.keys.map(({ key, label }) => <ValueSlider key={key} label={label} value={Math.round((adj[key] ?? 0) * 100)} min={-100} max={100}
      onChange={v => update(layer.id, { adjustments: { ...adj, [key]: v / 100 } })} format={signed} />)}
    <View style={s.tabs}>
      {TABS.map(t => <Pressable key={t.id} accessibilityLabel={t.label} onPress={() => set({ adjustTab: t.id })} style={[s.tab, tab === t.id && s.tabActive]}>
        <Feather name={t.icon} size={20} color={tab === t.id ? theme.accent : '#fff'} />
        <Text style={[s.tabText, tab === t.id && { color: theme.accent }]}>{t.label}</Text>
      </Pressable>)}
    </View>
  </View>;
}
const s = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 2 },
  title: { color: '#fff', fontWeight: '700' },
  reset: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  resetText: { color: theme.accent, fontWeight: '700', fontSize: 12 },
  tabs: { flexDirection: 'row', justifyContent: 'center', gap: 10, paddingTop: 8 },
  tab: { alignItems: 'center', gap: 4, paddingHorizontal: 16, paddingVertical: 7, borderRadius: 10 },
  tabActive: { backgroundColor: '#2a2a2a' },
  tabText: { color: '#fff', fontSize: 12 },
});
