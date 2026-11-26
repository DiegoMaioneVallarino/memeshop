import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Help, MiniButton, Row, Swatches, ValueSlider, theme } from '../../components/common/controls';
import { useEditorStore } from '../../store/useEditorStore';
import { useUiStore, type TextTab } from '../../store/useUiStore';
import { FONT_OPTIONS } from '../../services/fonts';
import type { TextLayer } from '../../types/editor';
import { startTextEditing } from '../../editor/actions';
import { useSelectedOf } from '../useSelected';

const TABS: TextTab[] = ['Estilos', 'Fuente', 'Trazo', 'Color', 'Resaltador', 'Sombra'];
const TEXT_COLORS = ['#111111', '#ffffff', '#18e500', '#ff304f', '#25c5ff', '#ffe05a', '#ff8800', '#fa8fff'];
type TextStyle = Partial<Omit<TextLayer, 'id' | 'type' | 'name'>>;

function presets(fontSize: number): { name: string; style: TextStyle }[] {
  return [
    { name: 'Clásico', style: { color: '#ffffff', fontFamily: 'Anton', strokeWidth: Math.max(2, fontSize * .055), strokeColor: '#000000', shadowBlur: 0, highlightColor: null, letterSpacing: 0 } },
    { name: 'Minimal', style: { color: '#111111', fontFamily: 'Montserrat', strokeWidth: 0, shadowBlur: 0, highlightColor: null, letterSpacing: 0 } },
    { name: 'Neón', style: { color: '#18e500', fontFamily: 'Anton', strokeWidth: Math.max(1, fontSize * .035), strokeColor: '#073b15', shadowBlur: 4, shadowColor: '#0a4f12', highlightColor: null, letterSpacing: 1 } },
    { name: 'Subtítulo', style: { color: '#ffffff', fontFamily: 'Montserrat', strokeWidth: 1, strokeColor: '#000000', shadowBlur: 2, shadowColor: '#000000', highlightColor: '#111111', highlightOpacity: .75, letterSpacing: 0 } },
    { name: 'Retro', style: { color: '#ffe05a', fontFamily: 'Gelasio', strokeWidth: 2, strokeColor: '#e54426', shadowBlur: 3, shadowColor: '#000000', highlightColor: null, letterSpacing: 2 } },
  ];
}

export function TextPanel() {
  const layer = useSelectedOf('text');
  const docWidth = useEditorStore(s => s.document?.width ?? 1000);
  const update = useEditorStore(s => s.update), addText = useEditorStore(s => s.addText);
  const tab = useUiStore(s => s.textTab), set = useUiStore(s => s.set);
  if (!layer) return <Help>Selecciona una capa de texto.</Help>;
  const patch = (p: TextStyle) => update(layer.id, p);
  const lines = layer.text.split('\n').length;
  return <View style={s.root}>
    <View style={s.topRow}>
      <Pressable accessibilityLabel="Editar texto" onPress={() => startTextEditing(false, false)} style={s.entry}>
        <Feather name="edit-2" size={15} color="#bbb" />
        <Text numberOfLines={1} style={s.entryText}>{layer.text || 'Toca para escribir'}</Text>
      </Pressable>
      <Pressable accessibilityLabel="Añadir otro texto" onPress={() => { addText(); startTextEditing(true, false); }} style={s.add}><Feather name="plus" color="#fff" size={19} /></Pressable>
    </View>
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" contentContainerStyle={s.tabs}>
        {TABS.map(t => <Pressable key={t} onPress={() => set({ textTab: t })} style={[s.tab, tab === t && s.tabActive]}>
          <Text style={{ color: tab === t ? theme.accentInk : '#ddd', fontWeight: '700', fontSize: 12 }}>{t}</Text>
        </Pressable>)}
      </ScrollView>
      <ScrollView style={s.options} contentContainerStyle={{ gap: 2 }} keyboardShouldPersistTaps="always" nestedScrollEnabled>
        {tab === 'Estilos' && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
          {presets(layer.fontSize).map(p => <Pressable key={p.name} onPress={() => patch(p.style)} style={s.chip}>
            <Text style={{ color: p.style.color, fontSize: 13, fontWeight: '800' }}>{p.name}</Text>
          </Pressable>)}
        </ScrollView>}
        {tab === 'Fuente' && <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
            {FONT_OPTIONS.map(f => <Pressable key={f.id} onPress={() => patch({ fontFamily: f.id })}
              style={[s.chip, (layer.fontFamily ?? 'System') === f.id && { borderColor: theme.accent }]}>
              <Text style={{ color: '#fff', fontSize: 12 }}>{f.label}</Text>
            </Pressable>)}
          </ScrollView>
          <ValueSlider compact label="Tamaño" value={layer.fontSize} min={8} max={Math.max(32, docWidth * .24)}
            onChange={v => patch({ fontSize: v, height: Math.max(1, lines * v * layer.lineHeight) })} format={v => String(Math.round(v))} />
          <Row>
            {(['left', 'center', 'right'] as const).map(a => <MiniButton key={a} active={layer.align === a}
              label={a === 'left' ? 'Izq.' : a === 'center' ? 'Centro' : 'Der.'} onPress={() => patch({ align: a })} />)}
          </Row>
          <ValueSlider compact label="Espaciado" value={layer.letterSpacing ?? 0} min={-2} max={Math.max(12, layer.fontSize * .15)} onChange={v => patch({ letterSpacing: v })} format={v => String(Math.round(v))} />
          <ValueSlider compact label="Interlínea" value={layer.lineHeight} min={.8} max={2} step={.05}
            onChange={v => patch({ lineHeight: v, height: Math.max(1, lines * layer.fontSize * v) })} format={v => v.toFixed(2)} />
        </>}
        {tab === 'Trazo' && <>
          <ValueSlider compact label="Contorno" value={layer.strokeWidth ?? 0} min={0} max={Math.max(10, layer.fontSize * .2)} onChange={v => patch({ strokeWidth: v })} format={v => String(Math.round(v))} />
          <Swatches colors={['#000000', '#ffffff', '#18e500', '#ff304f']} value={layer.strokeColor} onPick={c => patch({ strokeColor: c })} size={24} />
        </>}
        {tab === 'Color' && <Swatches colors={TEXT_COLORS} value={layer.color} onPick={c => patch({ color: c })} />}
        {tab === 'Resaltador' && <>
          <Row><MiniButton label="Ninguno" active={!layer.highlightColor} onPress={() => patch({ highlightColor: null })} />
            <Swatches colors={['#ffe05a', '#18e500', '#25c5ff', '#ff304f', '#ffffff', '#111111']} value={layer.highlightColor} onPick={c => patch({ highlightColor: c })} size={24} /></Row>
          <ValueSlider compact label="Opacidad" value={Math.round((layer.highlightOpacity ?? .5) * 100)} min={0} max={100} onChange={v => patch({ highlightOpacity: v / 100 })} format={v => `${Math.round(v)}%`} />
        </>}
        {tab === 'Sombra' && <>
          <View style={s.twoCols}>
            <View style={{ flex: 1 }}><ValueSlider compact label="Sombra" value={layer.shadowBlur ?? 0} min={0} max={Math.max(12, layer.fontSize * .3)} onChange={v => patch({ shadowBlur: v })} format={v => String(Math.round(v))} /></View>
            <Swatches colors={['#000000', '#ffffff', '#18e500']} value={layer.shadowColor} onPick={c => patch({ shadowColor: c })} size={22} />
          </View>
          <View style={s.twoCols}>
            <View style={{ flex: 1 }}><ValueSlider compact label="X" value={layer.shadowOffsetX ?? 0} min={-30} max={30} onChange={v => patch({ shadowOffsetX: v })} format={v => String(Math.round(v))} /></View>
            <View style={{ flex: 1 }}><ValueSlider compact label="Y" value={layer.shadowOffsetY ?? 0} min={-30} max={30} onChange={v => patch({ shadowOffsetY: v })} format={v => String(Math.round(v))} /></View>
          </View>
        </>}
      </ScrollView>
    </>
  </View>;
}
const s = StyleSheet.create({
  root: { gap: 5, paddingBottom: 2 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  entry: { flex: 1, height: 38, borderRadius: 8, backgroundColor: theme.surfaceHi, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  entryText: { color: '#fff', fontSize: 14, flex: 1 },
  add: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.surfaceHi, borderRadius: 8 },
  tabs: { gap: 6, paddingVertical: 3 },
  tab: { paddingHorizontal: 10, paddingVertical: 6, backgroundColor: theme.surface, borderRadius: 8 },
  tabActive: { backgroundColor: theme.accent },
  options: { maxHeight: 150 },
  chips: { gap: 6, alignItems: 'center', paddingVertical: 2 },
  chip: { backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1, borderRadius: 7, paddingHorizontal: 10, paddingVertical: 7 },
  twoCols: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
