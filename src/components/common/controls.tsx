/**
 * Controles compartidos por todos los paneles. Antes convivían tres sliders distintos
 * (uno propio con PanResponder, el de @react-native-community/slider y botones +/−).
 */
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Slider from '@react-native-community/slider';

export const theme = {
  bg: '#101010', panel: '#191919', surface: '#292929', surfaceHi: '#303030', border: '#444',
  text: '#ffffff', muted: '#aaaaaa', accent: '#18e500', accentInk: '#062208', danger: '#ff4d5e',
};

export function ValueSlider({ label, value, min, max, step = 1, onChange, format, compact }: {
  label: string; value: number; min: number; max: number; step?: number;
  onChange: (v: number) => void; format?: (v: number) => string; compact?: boolean;
}) {
  const shown = format ? format(value) : String(Math.round(value * 100) / 100);
  return <View style={compact ? s.sliderRowCompact : s.sliderBlock}>
    <View style={s.sliderHead}>
      <Text style={s.sliderLabel}>{label}</Text>
      <Text style={s.sliderValue}>{shown}</Text>
    </View>
    <Slider style={compact ? s.sliderCompact : s.slider} minimumValue={min} maximumValue={max} step={step}
      value={Math.max(min, Math.min(max, value))} onValueChange={onChange}
      minimumTrackTintColor={theme.accent} maximumTrackTintColor="#555" thumbTintColor={theme.accent} />
  </View>;
}

export function MiniButton({ label, onPress, active, disabled, danger }: { label: string; onPress: () => void; active?: boolean; disabled?: boolean; danger?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress}
    style={[s.mini, active && s.miniActive, disabled && { opacity: .4 }]}>
    <Text style={[s.miniText, active && { color: theme.accentInk }, danger && { color: theme.danger }]}>{label}</Text>
  </Pressable>;
}

export function Swatches({ colors, value, onPick, size = 28 }: { colors: string[]; value?: string | null; onPick: (c: string) => void; size?: number }) {
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" contentContainerStyle={s.swatches}>
    {colors.map((c, i) => <Pressable key={`${c}-${i}`} accessibilityLabel={`Color ${c}`} onPress={() => onPick(c)}
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c, borderWidth: value === c ? 3 : 1, borderColor: value === c ? theme.accent : '#777' }} />)}
  </ScrollView>;
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return <View style={s.segmented}>
    {options.map(o => <Pressable key={o.id} onPress={() => onChange(o.id)} style={[s.segment, value === o.id && s.segmentActive]}>
      <Text style={[s.segmentText, value === o.id && { color: theme.accentInk }]}>{o.label}</Text>
    </Pressable>)}
  </View>;
}

export const Help = ({ children }: { children: React.ReactNode }) => <Text style={s.help}>{children}</Text>;
export const Row = ({ children }: { children: React.ReactNode }) => <View style={s.row}>{children}</View>;
export const SectionLabel = ({ children }: { children: React.ReactNode }) => <Text style={s.section}>{children}</Text>;

const s = StyleSheet.create({
  sliderBlock: { gap: 0 },
  sliderRowCompact: { gap: 0 },
  sliderHead: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 2 },
  sliderLabel: { color: '#ddd', fontSize: 12 },
  sliderValue: { color: theme.muted, fontSize: 12, fontVariant: ['tabular-nums'] },
  slider: { height: 34 },
  sliderCompact: { height: 26 },
  mini: { backgroundColor: theme.surfaceHi, paddingHorizontal: 13, paddingVertical: 10, borderRadius: 9 },
  miniActive: { backgroundColor: theme.accent },
  miniText: { color: theme.text, fontSize: 12, fontWeight: '600' },
  swatches: { gap: 9, alignItems: 'center', paddingVertical: 4 },
  segmented: { flexDirection: 'row', gap: 6 },
  segment: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 9, backgroundColor: theme.surface },
  segmentActive: { backgroundColor: theme.accent },
  segmentText: { color: theme.text, fontSize: 12, fontWeight: '700' },
  help: { color: theme.muted, fontSize: 12 },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  section: { color: '#ddd', fontSize: 12, fontWeight: '700', marginTop: 4 },
});
