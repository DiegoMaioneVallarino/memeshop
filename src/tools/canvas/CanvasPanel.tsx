import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Help, SectionLabel, Segmented, theme } from '../../components/common/controls';
import { useEditorStore } from '../../store/useEditorStore';
import { useUiStore } from '../../store/useUiStore';
import { CANVAS_PRESETS, ratioLabel } from '../../utils/canvas';
import { originalPhotoSize, setCanvasBackground, setCanvasSize } from '../../editor/templateActions';

const BACKGROUNDS = ['#ffffff', '#000000', '#18e500', '#ffe05a', '#ff304f', '#25c5ff', '#f2e8d5', 'transparent'];

/** Rectángulo con la proporción del tamaño, para reconocerlo de un vistazo. */
function Aspect({ w, h, active }: { w: number; h: number; active: boolean }) {
  const k = 34 / Math.max(w, h);
  return <View style={s.aspectBox}><View style={{ width: w * k, height: h * k, borderRadius: 3, borderWidth: 2, borderColor: active ? theme.accent : '#bbb' }} /></View>;
}

export function CanvasPanel() {
  const doc = useEditorStore(s => s.document);
  const fit = useUiStore(s => s.canvasFit), set = useUiStore(s => s.set);
  if (!doc) return <Help>Primero elige una imagen o una plantilla.</Help>;
  const original = originalPhotoSize(doc);
  const options = [
    ...(original ? [{ id: 'original', network: 'Foto original', label: ratioLabel(original.width, original.height), ...original }] : []),
    ...CANVAS_PRESETS,
  ];
  const changeFit = (v: 'fit' | 'fill') => { set({ canvasFit: v }); setCanvasSize(doc.width, doc.height); };
  return <View style={{ gap: 8, paddingBottom: 12 }}>
    <Help>Lienzo actual: {doc.width}×{doc.height} px ({ratioLabel(doc.width, doc.height)})</Help>
    <Segmented value={fit} onChange={changeFit} options={[{ id: 'fit', label: 'Ajustar (todo visible)' }, { id: 'fill', label: 'Rellenar (sin bordes)' }]} />
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
      {options.map(p => {
        const active = doc.width === p.width && doc.height === p.height;
        return <Pressable key={p.id} accessibilityLabel={`${p.network} ${p.label}`} onPress={() => setCanvasSize(p.width, p.height)} style={[s.card, active && s.cardActive]}>
          <Aspect w={p.width} h={p.height} active={active} />
          <Text style={s.network} numberOfLines={2}>{p.network}</Text>
          <Text style={s.label} numberOfLines={1}>{p.label}</Text>
          <Text style={s.px}>{p.width}×{p.height}</Text>
        </Pressable>;
      })}
    </ScrollView>
    <SectionLabel>Fondo</SectionLabel>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 9, alignItems: 'center' }}>
      {BACKGROUNDS.map(c => {
        const active = (doc.background ?? '#ffffff') === c;
        return <Pressable key={c} accessibilityLabel={c === 'transparent' ? 'Fondo transparente' : `Fondo ${c}`} onPress={() => setCanvasBackground(c)}
          style={[s.swatch, { backgroundColor: c === 'transparent' ? '#ffffff' : c, borderColor: active ? theme.accent : '#777', borderWidth: active ? 3 : 1 }]}>
          {c === 'transparent' && <View style={s.noFill} />}
        </Pressable>;
      })}
    </ScrollView>
    <Help>«Ajustar» deja márgenes con el color de fondo; «Rellenar» cubre todo y puede recortar los lados. El fondo transparente se exporta como PNG con transparencia.</Help>
  </View>;
}
const s = StyleSheet.create({
  card: { width: 104, padding: 8, borderRadius: 12, backgroundColor: theme.surface, borderWidth: 2, borderColor: 'transparent', gap: 2 },
  cardActive: { borderColor: theme.accent },
  aspectBox: { height: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  network: { color: '#fff', fontSize: 11, fontWeight: '700' },
  label: { color: '#ccc', fontSize: 11 },
  px: { color: '#888', fontSize: 10 },
  swatch: { width: 30, height: 30, borderRadius: 15, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  noFill: { width: 40, height: 3, backgroundColor: '#ff304f', transform: [{ rotate: '-45deg' }] },
});
