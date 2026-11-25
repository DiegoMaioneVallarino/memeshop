import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Help, MiniButton, Segmented, Swatches, ValueSlider, theme } from '../../components/common/controls';
import { useEditorStore } from '../../store/useEditorStore';
import { useUiStore } from '../../store/useUiStore';
import { refreshPalette } from '../../editor/actions';
import { useSelectedLayer } from '../useSelected';

const int = (v: number) => String(Math.round(v));
const pct = (v: number) => `${Math.round(v)}%`;

function Preview({ size, color, opacity }: { size: number; color: string; opacity: number }) {
  const d = Math.max(5, Math.min(65, size / 3));
  return <View style={s.preview}><View style={{ width: d, height: d, borderRadius: 99, backgroundColor: color, opacity: opacity / 100, borderWidth: 1, borderColor: '#aaa' }} /></View>;
}

export function BrushPanel() {
  const brush = useUiStore(s => s.brush), setBrush = useUiStore(s => s.setBrush), palette = useUiStore(s => s.palette);
  const layer = useSelectedLayer();
  if (layer?.type !== 'paint') return <Help>Selecciona una capa de pintura o crea una desde Añadir → Pintura.</Help>;
  return <View style={s.root}>
    <Segmented value={brush.eraser ? 'erase' : 'draw'} onChange={v => setBrush({ eraser: v === 'erase' })}
      options={[{ id: 'draw', label: 'Dibujar' }, { id: 'erase', label: 'Borrar trazo' }]} />
    <Preview size={brush.size} color={brush.color} opacity={brush.opacity} />
    <ValueSlider compact label="Radio" value={brush.size} min={2} max={250} onChange={v => setBrush({ size: v })} format={int} />
    <ValueSlider compact label="Opacidad" value={brush.opacity} min={1} max={100} onChange={v => setBrush({ opacity: v })} format={pct} />
    <ValueSlider compact label="Dureza" value={brush.hardness} min={1} max={100} onChange={v => setBrush({ hardness: v })} format={pct} />
    <ValueSlider compact label="Suavidad del borde" value={brush.spread} min={0} max={100} onChange={v => setBrush({ spread: v })} format={pct} />
    <View style={s.paletteHead}>
      <Text style={s.section}>Colores del lienzo</Text>
      <Pressable accessibilityLabel="Volver a analizar colores" hitSlop={8} onPress={() => void refreshPalette()}><Feather name="refresh-cw" size={18} color="white" /></Pressable>
      <MiniButton label="Cuentagotas" onPress={() => useUiStore.getState().set({ pickingColor: true })} />
    </View>
    <Swatches colors={palette} value={brush.color} onPick={c => setBrush({ color: c, eraser: false })} />
    <Help>Dibuja con un dedo. Dos dedos mueven y acercan el lienzo.</Help>
  </View>;
}

export function MaskPanel() {
  const mask = useUiStore(s => s.mask), setMask = useUiStore(s => s.setMask);
  const layer = useSelectedLayer();
  const update = useEditorStore(s => s.update);
  if (!layer) return <Help>Selecciona una capa para borrar o restaurar partes de ella.</Help>;
  return <View style={s.root}>
    <Segmented value={mask.mode} onChange={mode => setMask({ mode })} options={[{ id: 'erase', label: 'Borrar' }, { id: 'restore', label: 'Restaurar' }]} />
    <Preview size={mask.size} color="#fff" opacity={mask.opacity} />
    <ValueSlider compact label="Radio" value={mask.size} min={2} max={250} onChange={v => setMask({ size: v })} format={int} />
    <ValueSlider compact label="Opacidad" value={mask.opacity} min={1} max={100} onChange={v => setMask({ opacity: v })} format={pct} />
    <ValueSlider compact label="Dureza" value={mask.hardness} min={1} max={100} onChange={v => setMask({ hardness: v })} format={pct} />
    <ValueSlider compact label="Suavidad del borde" value={mask.spread} min={0} max={100} onChange={v => setMask({ spread: v })} format={pct} />
    {!!layer.maskStrokes?.length && <MiniButton label="Restablecer máscara" onPress={() => update(layer.id, { maskStrokes: [] })} />}
    <Help>Borrar oculta partes de «{layer.name}»; Restaurar las recupera.</Help>
  </View>;
}
const s = StyleSheet.create({
  root: { gap: 6, paddingBottom: 12 },
  preview: { height: 64, backgroundColor: theme.surface, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  paletteHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  section: { color: 'white', fontWeight: '700', flex: 1 },
});
