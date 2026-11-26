import React from 'react';
import { ScrollView, View } from 'react-native';
import { Help, MiniButton, Row, Segmented, ValueSlider } from '../../components/common/controls';
import { useEditorStore } from '../../store/useEditorStore';
import type { WarpSettings } from '../../types/editor';
import { useSelectedOf } from '../useSelected';

// «Liquify» (push) pasó a su propia herramienta: Herramientas → Licuar. Aquí quedan las distorsiones globales.
const MODES: [WarpSettings['mode'], string][] = [['twirl', 'Remolino'], ['bulge', 'Inflar'], ['wave', 'Ondas'], ['mesh', 'Malla']];
const DEFAULT_WARP: WarpSettings = { mode: 'twirl', centerX: .5, centerY: .5, radius: .5, strength: .5, frequency: 2 };

export function WarpPanel() {
  const layer = useSelectedOf('image');
  const update = useEditorStore(s => s.update);
  if (!layer) return <Help>Selecciona una capa de imagen para deformarla.</Help>;
  const w = layer.warp ?? DEFAULT_WARP;
  const patch = (changes: Partial<WarpSettings>) => update(layer.id, { warp: { ...w, ...changes } });
  const num = (v: number) => v.toFixed(2);
  return <View style={{ gap: 4, paddingBottom: 8 }}>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 4 }}>
      {MODES.map(([mode, label]) => <MiniButton key={mode} label={label} active={w.mode === mode} onPress={() => patch({ mode })} />)}
    </ScrollView>
    <ValueSlider label="Intensidad" value={w.strength} min={-1} max={1} step={.01} onChange={v => patch({ strength: v })} format={num} />
    <ValueSlider label="Radio" value={w.radius} min={.05} max={1.5} step={.01} onChange={v => patch({ radius: v })} format={num} />
    {w.mode !== 'push' && <>
      <ValueSlider label="Centro X" value={w.centerX} min={0} max={1} step={.01} onChange={v => patch({ centerX: v })} format={num} />
      <ValueSlider label="Centro Y" value={w.centerY} min={0} max={1} step={.01} onChange={v => patch({ centerY: v })} format={num} />
    </>}
    {(w.mode === 'wave' || w.mode === 'mesh') && <ValueSlider label="Frecuencia" value={w.frequency} min={.25} max={8} step={.05} onChange={v => patch({ frequency: v })} format={num} />}
    {w.mode === 'push' && <>
      <Help>Arrastra sobre la imagen para deformar; Congelar protege zonas. El círculo verde muestra el radio. Hasta 128 segmentos.</Help>
      <Segmented value={w.brushMode === 'freeze' ? 'freeze' : 'push'} onChange={brushMode => patch({ brushMode })}
        options={[{ id: 'push', label: 'Empujar' }, { id: 'freeze', label: 'Congelar' }]} />
      <Row>
        <MiniButton label="Deshacer trazo" onPress={() => {
          const st = w.strokes ?? []; const last = st[st.length - 1]?.strokeId;
          patch({ strokes: last === undefined ? st.slice(0, -1) : st.filter(t => t.strokeId !== last) });
        }} />
        <MiniButton label="Quitar congeladas" onPress={() => patch({ frozen: [] })} />
        <MiniButton label="Borrar trazos" onPress={() => patch({ strokes: [] })} />
      </Row>
    </>}
    <MiniButton label="Restablecer deformación" onPress={() => update(layer.id, { warp: undefined })} />
  </View>;
}
