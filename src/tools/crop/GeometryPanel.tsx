import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Help, MiniButton, Row, ValueSlider, theme } from '../../components/common/controls';
import { useEditorStore } from '../../store/useEditorStore';
import { useUiStore, type Tool } from '../../store/useUiStore';
import { CROP_RATIOS, initialCrop, type CropState } from '../../utils/crop';
import { applyCrop, flip } from '../../editor/actions';
import { useSelectedLayer } from '../useSelected';

const pct = (v: number) => `${Math.round(v)}%`;

function CropControls() {
  const crop = useUiStore(s => s.crop), busy = useUiStore(s => s.busy), set = useUiStore(s => s.set);
  const patch = (p: Partial<CropState>) => set({ crop: { ...crop, ...p } });
  const free = crop.ratio === 'Libre';
  return <View style={{ gap: 2 }}>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 4 }}>
      {CROP_RATIOS.map(r => <MiniButton key={r} label={r} active={crop.ratio === r} onPress={() => set({ crop: { ...crop, ratio: r, zoom: 1, panX: .5, panY: .5 } })} />)}
    </ScrollView>
    {free ? <>
      <ValueSlider compact label="Izquierda" value={crop.left} min={0} max={45} onChange={v => patch({ left: v })} format={pct} />
      <ValueSlider compact label="Derecha" value={crop.right} min={0} max={45} onChange={v => patch({ right: v })} format={pct} />
      <ValueSlider compact label="Arriba" value={crop.top} min={0} max={45} onChange={v => patch({ top: v })} format={pct} />
      <ValueSlider compact label="Abajo" value={crop.bottom} min={0} max={45} onChange={v => patch({ bottom: v })} format={pct} />
    </> : <>
      <ValueSlider compact label="Zoom" value={crop.zoom} min={1} max={4} step={.05} onChange={v => patch({ zoom: v })} format={v => `${v.toFixed(2)}×`} />
      <ValueSlider compact label="Horizontal" value={crop.panX * 100} min={0} max={100} onChange={v => patch({ panX: v / 100 })} format={pct} />
      <ValueSlider compact label="Vertical" value={crop.panY * 100} min={0} max={100} onChange={v => patch({ panY: v / 100 })} format={pct} />
    </>}
    <ValueSlider compact label="Enderezar" value={crop.angle} min={-45} max={45} step={.5} onChange={v => patch({ angle: v })} format={v => `${v.toFixed(1)}°`} />
    {Math.abs(crop.angle) > .01 && <Help>Las esquinas fuera de la imagen quedarán transparentes. Usa zoom o márgenes para evitarlo.</Help>}
    <Row>
      <MiniButton label="Restablecer" onPress={() => set({ crop: { ...initialCrop } })} />
      <MiniButton label={busy ? 'Recortando…' : 'Recortar'} active disabled={busy} onPress={() => void applyCrop()} />
    </Row>
  </View>;
}

export function GeometryPanel() {
  const tool = useUiStore(s => s.tool);
  const layer = useSelectedLayer();
  const update = useEditorStore(s => s.update);
  const tabs: { id: Tool; label: string }[] = [{ id: 'crop', label: 'Recortar' }, { id: 'rotate', label: 'Rotar' }, { id: 'perspective', label: 'Perspectiva' }];
  return <View style={{ paddingBottom: 10, gap: 6 }}>
    <View style={s.tabs}>
      {tabs.map(t => <Pressable key={t.id} onPress={() => { useUiStore.getState().set({ tool: t.id }); if (t.id !== 'crop') useUiStore.getState().set({ crop: initialCrop }); }}
        style={[s.tab, tool === t.id && s.tabActive]}><Text style={{ color: 'white', fontSize: 15 }}>{t.label}</Text></Pressable>)}
    </View>
    {tool === 'crop' && (layer?.type === 'image' ? <CropControls /> : <Help>Selecciona una capa de imagen para recortarla.</Help>)}
    {tool === 'rotate' && (layer ? <>
      <Row>
        <MiniButton label="↶ 90°" onPress={() => update(layer.id, { rotation: layer.rotation - Math.PI / 2 })} />
        <MiniButton label="↷ 90°" onPress={() => update(layer.id, { rotation: layer.rotation + Math.PI / 2 })} />
        <MiniButton label="Voltear horizontal" onPress={() => flip('h')} />
        <MiniButton label="Voltear vertical" onPress={() => flip('v')} />
      </Row>
      <ValueSlider label="Ángulo" value={Math.round(layer.rotation * 180 / Math.PI)} min={-180} max={180}
        onChange={v => update(layer.id, { rotation: v * Math.PI / 180 })} format={v => `${Math.round(v)}°`} />
    </> : <Help>Selecciona una capa para rotarla.</Help>)}
    {tool === 'perspective' && (layer?.type === 'image' ? <>
      <ValueSlider label="Convergencia horizontal" value={layer.perspectiveX ?? 0} min={-.5} max={.5} step={.01} onChange={v => update(layer.id, { perspectiveX: v })} format={v => v.toFixed(2)} />
      <ValueSlider label="Convergencia vertical" value={layer.perspectiveY ?? 0} min={-.5} max={.5} step={.01} onChange={v => update(layer.id, { perspectiveY: v })} format={v => v.toFixed(2)} />
    </> : <Help>Selecciona una capa de imagen para corregir la perspectiva.</Help>)}
  </View>;
}
const s = StyleSheet.create({
  tabs: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 6 },
  tab: { padding: 12, borderRadius: 12 }, tabActive: { backgroundColor: '#383838', borderBottomWidth: 2, borderBottomColor: theme.accent },
});
