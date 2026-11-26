import React from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Help, MiniButton, Row, SectionLabel, Segmented, ValueSlider, theme } from '../../components/common/controls';
import { useUiStore } from '../../store/useUiStore';
import { useSelectedLayer } from '../useSelected';
import { addCollageFromSelected, newVariation, removeCollageSource, setCollageMode, setCollageParams } from '../../editor/collageActions';

const pct = (v: number) => `${Math.round(v)}%`;
const deg = (v: number) => `${Math.round(v)}°`;

export function CollagePanel() {
  const c = useUiStore(s => s.collage), set = useUiStore(s => s.set);
  const selected = useSelectedLayer();
  const p = c.pattern, k = c.composition;
  const patchPattern = (patch: Partial<typeof p>) => setCollageParams({ pattern: { ...p, ...patch } });
  const patchComp = (patch: Partial<typeof k>) => setCollageParams({ composition: { ...k, ...patch } });
  return <View style={{ gap: 6, paddingBottom: 12 }}>
    <Segmented value={c.mode} onChange={setCollageMode} options={[{ id: 'pattern', label: 'Fondo de patrón' }, { id: 'random', label: 'Composición aleatoria' }]} />
    <SectionLabel>Stickers</SectionLabel>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, alignItems: 'center' }}>
      {c.sources.map((src, i) => <View key={`${src.uri}-${i}`} style={s.source}>
        <Image source={{ uri: src.uri }} style={s.sourceImg} resizeMode="contain" />
        <Pressable accessibilityLabel="Quitar sticker" hitSlop={6} onPress={() => removeCollageSource(i)} style={s.remove}><Feather name="x" size={12} color="#fff" /></Pressable>
      </View>)}
      <Pressable onPress={() => set({ stickerPick: { purpose: 'collage' } })} style={s.add}><Feather name="plus" size={20} color={theme.accent} /><Text style={s.addText}>Sticker</Text></Pressable>
      {selected?.type === 'image' && <Pressable onPress={() => void addCollageFromSelected()} style={s.add}><Feather name="image" size={18} color="#fff" /><Text style={[s.addText, { color: '#fff' }]}>Imagen{'\n'}seleccionada</Text></Pressable>}
    </ScrollView>
    {!c.sources.length && <Help>{c.mode === 'pattern'
      ? 'Elige uno o varios stickers: se repetirán girados y a distintos tamaños hasta cubrir todo el lienzo, detrás de lo demás.'
      : 'Elige varios stickers: se colocarán al azar como capas sueltas que luego puedes mover.'}</Help>}
    {c.sources.length > 0 && (c.mode === 'pattern' ? <>
      <Segmented value={p.layout} onChange={layout => patchPattern({ layout })} options={[{ id: 'scatter', label: 'Disperso' }, { id: 'grid', label: 'Cuadrícula' }]} />
      <ValueSlider compact label="Tamaño" value={p.size * 100} min={4} max={60} onChange={v => patchPattern({ size: v / 100 })} format={pct} />
      <ValueSlider compact label="Variación de tamaño" value={p.sizeVariation * 100} min={0} max={100} onChange={v => patchPattern({ sizeVariation: v / 100 })} format={pct} />
      <ValueSlider compact label="Giro" value={p.rotation} min={0} max={180} onChange={v => patchPattern({ rotation: v })} format={deg} />
      <ValueSlider compact label="Separación" value={p.spacing * 100} min={0} max={100} onChange={v => patchPattern({ spacing: v / 100 })} format={pct} />
      {p.layout === 'grid' && <ValueSlider compact label="Desorden" value={p.jitter * 100} min={0} max={100} onChange={v => patchPattern({ jitter: v / 100 })} format={pct} />}
      <Row><MiniButton label="Voltear al azar" active={p.flip} onPress={() => patchPattern({ flip: !p.flip })} /><MiniButton label="🎲 Otra variación" onPress={newVariation} /></Row>
    </> : <>
      <ValueSlider compact label="Cantidad" value={k.count} min={1} max={25} onChange={v => patchComp({ count: Math.round(v) })} format={v => String(Math.round(v))} />
      <ValueSlider compact label="Tamaño" value={k.size * 100} min={10} max={70} onChange={v => patchComp({ size: v / 100 })} format={pct} />
      <ValueSlider compact label="Variación de tamaño" value={k.sizeVariation * 100} min={0} max={100} onChange={v => patchComp({ sizeVariation: v / 100 })} format={pct} />
      <ValueSlider compact label="Giro" value={k.rotation} min={0} max={180} onChange={v => patchComp({ rotation: v })} format={deg} />
      <Row>
        <MiniButton label="Voltear al azar" active={k.flip} onPress={() => patchComp({ flip: !k.flip })} />
        <MiniButton label="Fondo de color al azar" active={c.randomBackground} onPress={() => setCollageParams({ randomBackground: !c.randomBackground })} />
        <MiniButton label="🎲 Otra variación" onPress={newVariation} />
      </Row>
    </>)}
  </View>;
}
const s = StyleSheet.create({
  source: { width: 56, height: 56, borderRadius: 10, backgroundColor: '#2e2e2e' },
  sourceImg: { width: '100%', height: '100%' },
  remove: { position: 'absolute', top: -4, right: -4, backgroundColor: '#c0392b', borderRadius: 9, width: 18, height: 18, alignItems: 'center', justifyContent: 'center' },
  add: { width: 64, height: 56, borderRadius: 10, borderWidth: 1, borderColor: '#444', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 2 },
  addText: { color: theme.accent, fontSize: 10, fontWeight: '700', textAlign: 'center' },
});
