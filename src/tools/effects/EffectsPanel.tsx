import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Help, MiniButton, Row, SectionLabel, Swatches, ValueSlider, theme } from '../../components/common/controls';
import { useEditorStore } from '../../store/useEditorStore';
import { useUiStore } from '../../store/useUiStore';
import type { EffectStage, ImageLayer } from '../../types/editor';
import { useSelectedOf } from '../useSelected';
import { ALL_GLITCH_NAMES, COLOR_PRESETS, FILTER_CATEGORIES, RECOLOR, RECOLOR_SWATCHES } from './presets';

const STAGE_LABELS: Record<EffectStage, string> = { warp: 'Deformación', glitch: 'Glitch', recolor: 'Sustituir color', adjustments: 'Ajustes de color' };
const DEFAULT_ORDER: EffectStage[] = ['warp', 'glitch', 'recolor', 'adjustments'];
const pct = (v: number) => `${Math.round(v * 100)}%`;

function EffectChain({ layer }: { layer: ImageLayer }) {
  const update = useEditorStore(s => s.update);
  const order = [...(layer.effectOrder ?? DEFAULT_ORDER)];
  const disabled = layer.effectDisabled ?? [];
  const present: Record<EffectStage, boolean> = { warp: !!layer.warp, glitch: !!layer.glitchSettings || !!layer.glitch, recolor: !!layer.colorReplace, adjustments: !!layer.adjustments };
  const visible = order.filter(k => present[k]);
  if (!visible.length) return null;
  return <View style={s.chain}>
    <SectionLabel>CADENA DE EFECTOS · orden de procesamiento</SectionLabel>
    {visible.map(k => {
      const pos = order.indexOf(k), active = !disabled.includes(k);
      const shift = (d: number) => { const next = [...order], j = pos + d; if (j < 0 || j >= next.length) return; [next[pos], next[j]] = [next[j], next[pos]]; update(layer.id, { effectOrder: next }); };
      return <View key={k} style={s.chainRow}>
        <Pressable accessibilityLabel={active ? 'Ocultar efecto' : 'Mostrar efecto'} onPress={() => update(layer.id, { effectDisabled: active ? [...disabled, k] : disabled.filter(x => x !== k) })}
          style={[s.eye, active && s.eyeOn]}><Feather name={active ? 'eye' : 'eye-off'} size={15} color={active ? theme.accent : '#aaa'} /></Pressable>
        <Text style={[s.chainLabel, !active && { color: '#888' }]}>{STAGE_LABELS[k]}</Text>
        <Pressable accessibilityLabel="Subir" onPress={() => shift(-1)} style={{ padding: 7 }}><Feather name="arrow-up" size={17} color="#fff" /></Pressable>
        <Pressable accessibilityLabel="Bajar" onPress={() => shift(1)} style={{ padding: 7 }}><Feather name="arrow-down" size={17} color="#fff" /></Pressable>
      </View>;
    })}
    <Help>De arriba abajo: cada efecto se aplica sobre el resultado anterior. Ocultar no borra sus parámetros.</Help>
  </View>;
}

export function EffectsPanel() {
  const layer = useSelectedOf('image');
  const update = useEditorStore(s => s.update);
  const category = useUiStore(s => s.filterCategory), preset = useUiStore(s => s.filterPreset), set = useUiStore(s => s.set);
  if (!layer) return <Help>Selecciona una capa de imagen para aplicar efectos.</Help>;
  const apply = (name: string) => {
    if (name === RECOLOR) update(layer.id, { colorReplace: layer.colorReplace ?? { source: '#18e500', target: '#ff304f', tolerance: .15, softness: .08, strength: 1 } });
    else {
      const glitchIndex = ALL_GLITCH_NAMES.indexOf(name);
      if (glitchIndex >= 0) update(layer.id, { glitch: 0, glitchSettings: { mode: glitchIndex + 1, intensity: .65, density: .55, seed: layer.glitchSettings?.seed ?? 1337 } });
      else update(layer.id, { adjustments: { ...COLOR_PRESETS[name] } });
    }
    set({ filterPreset: name });
  };
  const recolor = layer.colorReplace, glitch = layer.glitchSettings;
  return <View style={{ paddingBottom: 12, gap: 8 }}>
    <EffectChain layer={layer} />
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      {Object.keys(FILTER_CATEGORIES).map(c => <Pressable key={c} onPress={() => set({ filterCategory: c })} style={[s.cat, category === c && s.catActive]}>
        <Text style={{ color: category === c ? theme.accent : 'white', fontWeight: '600' }}>{c}</Text>
      </Pressable>)}
    </ScrollView>
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      {(FILTER_CATEGORIES[category] ?? FILTER_CATEGORIES.TODOS).map(name => {
        const isGlitch = ALL_GLITCH_NAMES.includes(name);
        return <Pressable key={name} onPress={() => apply(name)} style={s.filter}>
          <View style={[s.filterThumb, isGlitch && { backgroundColor: '#173e29' }, preset === name && s.filterActive]}>
            <Feather name={isGlitch ? 'zap' : name === RECOLOR ? 'droplet' : 'image'} size={27} color="white" />
          </View>
          <Text numberOfLines={2} style={s.filterName}>{name}</Text>
        </Pressable>;
      })}
    </ScrollView>
    {recolor && <View style={s.section}>
      <SectionLabel>Color original</SectionLabel>
      <Swatches colors={RECOLOR_SWATCHES} value={recolor.source} onPick={c => update(layer.id, { colorReplace: { ...recolor, source: c } })} />
      <SectionLabel>Sustituir por</SectionLabel>
      <Swatches colors={RECOLOR_SWATCHES} value={recolor.target} onPick={c => update(layer.id, { colorReplace: { ...recolor, target: c } })} />
      <ValueSlider label="Sensibilidad" value={recolor.tolerance} min={0} max={1} step={.01} onChange={v => update(layer.id, { colorReplace: { ...recolor, tolerance: v } })} format={pct} />
      <ValueSlider label="Suavidad" value={recolor.softness} min={0} max={1} step={.01} onChange={v => update(layer.id, { colorReplace: { ...recolor, softness: v } })} format={pct} />
      <ValueSlider label="Intensidad" value={recolor.strength} min={0} max={1} step={.01} onChange={v => update(layer.id, { colorReplace: { ...recolor, strength: v } })} format={pct} />
      <MiniButton label="Quitar sustitución" onPress={() => update(layer.id, { colorReplace: undefined })} />
    </View>}
    {glitch && <View style={s.section}>
      <ValueSlider label="Intensidad glitch" value={glitch.intensity} min={0} max={2} step={.01} onChange={v => update(layer.id, { glitchSettings: { ...glitch, intensity: v } })} format={pct} />
      <ValueSlider label="Densidad" value={glitch.density} min={0} max={1} step={.01} onChange={v => update(layer.id, { glitchSettings: { ...glitch, density: v } })} format={pct} />
      <Row>
        <Help>Patrón #{glitch.seed}</Help>
        <MiniButton label="Variar patrón" onPress={() => update(layer.id, { glitchSettings: { ...glitch, seed: glitch.seed + 1 } })} />
        <MiniButton label="Quitar glitch" onPress={() => { update(layer.id, { glitchSettings: undefined, glitch: 0 }); set({ filterPreset: 'Ninguno' }); }} />
      </Row>
      <Help>Glitch Lab · 25 modos simulados en GPU. La semilla mantiene estable el patrón.</Help>
    </View>}
  </View>;
}
const s = StyleSheet.create({
  chain: { gap: 4, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#343434' },
  chainRow: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 36 },
  eye: { padding: 7, backgroundColor: '#333', borderRadius: 7 }, eyeOn: { backgroundColor: '#16491e' },
  chainLabel: { color: 'white', fontSize: 12, flex: 1 },
  cat: { padding: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' }, catActive: { borderBottomColor: theme.accent },
  filter: { marginRight: 9, width: 116, alignItems: 'center' },
  filterThumb: { width: 110, height: 76, backgroundColor: '#444', borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  filterActive: { borderColor: theme.accent },
  filterName: { color: 'white', fontSize: 11, marginTop: 7, textAlign: 'center' },
  section: { gap: 6, paddingTop: 4 },
});
