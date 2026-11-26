import React from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Help, MiniButton, Row, SectionLabel, Swatches, ValueSlider, theme } from '../../components/common/controls';
import { useEditorStore } from '../../store/useEditorStore';
import { useUiStore } from '../../store/useUiStore';
import type { EffectStage, ImageLayer } from '../../types/editor';
import { useSelectedLayer } from '../useSelected';
import { flattenDocument } from '../../editor/actions';
import { FILTER_CATEGORIES, FILTER_DESCRIPTIONS, RECOLOR_SWATCHES, filterPatch } from './presets';
import { useFilterPreview } from './previews';

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

/** Aplica un filtro a una imagen concreta. */
function applyTo(layer: ImageLayer, name: string) {
  useEditorStore.getState().update(layer.id, filterPatch(name, layer));
  useUiStore.getState().set({ filterPreset: name });
}

/**
 * Sin nada seleccionado, el filtro es para TODO el lienzo: las capas se combinan en una sola imagen y el filtro
 * se aplica sobre ella. Dentro de Efectos esto es parte de la sesión: «Cancelar» devuelve las capas separadas.
 */
async function applyToCanvas(name: string) {
  const id = await flattenDocument();
  const layer = useEditorStore.getState().document?.layers.find(l => l.id === id);
  if (layer?.type !== 'image') return;
  applyTo(layer, name);
  useUiStore.getState().showToast({ message: 'Capas combinadas en una sola para aplicar el filtro a todo el lienzo.' });
}

function FilterCard({ name, active, onPress }: { name: string; active: boolean; onPress: () => void }) {
  const uri = useFilterPreview(name);
  return <Pressable onPress={onPress} style={s.filter} accessibilityLabel={name}>
    <View style={[s.filterThumb, active && s.filterActive]}>
      {uri ? <Image source={{ uri }} style={s.filterImage} /> : <ActivityIndicator color="#777" />}
    </View>
    <Text numberOfLines={2} style={[s.filterName, active && { color: theme.accent }]}>{name}</Text>
  </Pressable>;
}

function FilterStrip({ onPick }: { onPick: (name: string) => void }) {
  const category = useUiStore(s => s.filterCategory), preset = useUiStore(s => s.filterPreset), set = useUiStore(s => s.set);
  return <>
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      {Object.keys(FILTER_CATEGORIES).map(c => <Pressable key={c} onPress={() => set({ filterCategory: c })} style={[s.cat, category === c && s.catActive]}>
        <Text style={{ color: category === c ? theme.accent : 'white', fontWeight: '600' }}>{c}</Text>
      </Pressable>)}
    </ScrollView>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
      {(FILTER_CATEGORIES[category] ?? FILTER_CATEGORIES.TODOS).map(name => <FilterCard key={name} name={name} active={preset === name} onPress={() => onPick(name)} />)}
    </ScrollView>
    {FILTER_DESCRIPTIONS[preset] ? <Help>{preset}: {FILTER_DESCRIPTIONS[preset]}</Help> : null}
  </>;
}

export function EffectsPanel() {
  const selected = useSelectedLayer();
  const update = useEditorStore(s => s.update);
  const set = useUiStore(s => s.set);
  const hasLayers = useEditorStore(s => !!s.document?.layers.length);
  if (!selected) return <View style={{ paddingBottom: 12, gap: 8 }}>
    <Help>{hasLayers ? 'Nada seleccionado: el filtro se aplicará a TODO el lienzo (las capas se combinan en una sola).' : 'Añade una imagen para aplicar filtros.'}</Help>
    {hasLayers && <FilterStrip onPick={name => void applyToCanvas(name)} />}
  </View>;
  if (selected.type !== 'image') return <Help>Los filtros se aplican a imágenes. Toca un espacio vacío del lienzo para quitar la selección y aplicarlo a todo el lienzo.</Help>;
  const layer = selected;
  const recolor = layer.colorReplace, glitch = layer.glitchSettings;
  return <View style={{ paddingBottom: 12, gap: 8 }}>
    <EffectChain layer={layer} />
    <FilterStrip onPick={name => applyTo(layer, name)} />
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
  filter: { width: 76, alignItems: 'center' },
  filterThumb: { width: 76, height: 76, backgroundColor: '#2a2a2a', borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent', overflow: 'hidden' },
  filterImage: { width: '100%', height: '100%' },
  filterActive: { borderColor: theme.accent },
  filterName: { color: 'white', fontSize: 11, marginTop: 5, textAlign: 'center', lineHeight: 13, minHeight: 26 },
  section: { gap: 6, paddingTop: 4 },
});
