import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Slider from '@react-native-community/slider';
import { CROP_RATIOS, initialCrop, type CropState } from '../../utils/crop';

function Row({ label, value, min, max, step = 1, onChange, suffix = '%' }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; suffix?: string }) {
  return <View style={s.row}>
    <Text style={s.label}>{label}</Text>
    <Slider style={s.slider} minimumValue={min} maximumValue={max} step={step} value={value} onValueChange={onChange} minimumTrackTintColor="#e946da" maximumTrackTintColor="#555" thumbTintColor="#fff" />
    <Text style={s.value}>{Math.round(value * 10) / 10}{suffix}</Text>
  </View>;
}

export function CropPanel({ crop, setCrop, onApply, hasImage, busy }: { crop: CropState; setCrop: (c: CropState) => void; onApply: () => void; hasImage: boolean; busy: boolean }) {
  if (!hasImage) return <Text style={s.help}>Selecciona una capa de imagen para recortarla.</Text>;
  const patch = (p: Partial<CropState>) => setCrop({ ...crop, ...p });
  const free = crop.ratio === 'Libre';
  return <ScrollView style={{ maxHeight: 250 }} showsVerticalScrollIndicator={false}>
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      {CROP_RATIOS.map(r => <Pressable key={r} onPress={() => setCrop({ ...crop, ratio: r, zoom: 1, panX: .5, panY: .5 })} style={[s.chip, crop.ratio === r && s.chipActive]}><Text style={{ color: 'white' }}>{r}</Text></Pressable>)}
    </ScrollView>
    {free ? <>
      <Row label="Izquierda" value={crop.left} min={0} max={45} onChange={v => patch({ left: v })} />
      <Row label="Derecha" value={crop.right} min={0} max={45} onChange={v => patch({ right: v })} />
      <Row label="Arriba" value={crop.top} min={0} max={45} onChange={v => patch({ top: v })} />
      <Row label="Abajo" value={crop.bottom} min={0} max={45} onChange={v => patch({ bottom: v })} />
    </> : <>
      <Row label="Zoom" value={crop.zoom} min={1} max={4} step={.05} suffix="×" onChange={v => patch({ zoom: v })} />
      <Row label="Horizontal" value={crop.panX * 100} min={0} max={100} onChange={v => patch({ panX: v / 100 })} />
      <Row label="Vertical" value={crop.panY * 100} min={0} max={100} onChange={v => patch({ panY: v / 100 })} />
    </>}
    <Row label="Enderezar" value={crop.angle} min={-45} max={45} step={.5} suffix="°" onChange={v => patch({ angle: v })} />
    {Math.abs(crop.angle) > .01 && <Text style={s.help}>Las esquinas que queden fuera de la imagen quedarán transparentes. Usa zoom o márgenes para evitarlo.</Text>}
    <View style={s.actions}>
      <Pressable onPress={() => setCrop({ ...initialCrop })} style={s.secondary}><Text style={s.btnText}>Restablecer</Text></Pressable>
      <Pressable onPress={onApply} disabled={busy} style={[s.primary, busy && { opacity: .5 }]}><Text style={s.btnText}>Aplicar</Text></Pressable>
    </View>
  </ScrollView>;
}
const s = StyleSheet.create({
  chip: { padding: 12, margin: 5, backgroundColor: '#222', borderRadius: 12 }, chipActive: { backgroundColor: '#555' },
  row: { flexDirection: 'row', alignItems: 'center' }, label: { color: '#ddd', fontSize: 13, width: 78 }, slider: { flex: 1, height: 34 }, value: { color: '#ccc', fontSize: 12, width: 48, textAlign: 'right' },
  help: { color: '#aaa', fontSize: 12, marginVertical: 6 },
  actions: { flexDirection: 'row', justifyContent: 'center', gap: 12, marginTop: 8, marginBottom: 6 },
  primary: { backgroundColor: '#333', paddingHorizontal: 40, paddingVertical: 12, borderRadius: 12 }, secondary: { backgroundColor: '#222', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 }, btnText: { color: 'white', fontWeight: '700' },
});
