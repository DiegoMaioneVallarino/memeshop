import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Help, MiniButton, Row, Segmented, ValueSlider, theme } from '../../components/common/controls';
import { useEditorStore } from '../../store/useEditorStore';
import { useUiStore } from '../../store/useUiStore';
import { useSelectedOf } from '../useSelected';

const int = (v: number) => String(Math.round(v));
const pct = (v: number) => `${Math.round(v)}%`;

/**
 * Revisión de «Quitar fondo». La imagen se ve sola sobre la cuadrícula de transparencia: lo que se ve a cuadros
 * es lo que se quitará. Borrar quita lo que el algoritmo dejó de más; Restaurar recupera lo que quitó por error.
 */
export function CutoutPanel() {
  const layer = useSelectedOf('image');
  const brush = useUiStore(s => s.cutoutBrush), mask = useUiStore(s => s.mask);
  const set = useUiStore(s => s.set), setMask = useUiStore(s => s.setMask), working = useUiStore(s => s.bgWorking);
  const update = useEditorStore(s => s.update);
  if (!layer) return <Help>Selecciona una capa de imagen.</Help>;
  if (working) return <Row><ActivityIndicator color={theme.accent} /><Help>Detectando el sujeto…</Help></Row>;
  return <View style={{ gap: 6, paddingBottom: 10 }}>
    <Segmented value={brush} onChange={v => set({ cutoutBrush: v })}
      options={[{ id: 'view', label: 'Mover' }, { id: 'erase', label: 'Borrar' }, { id: 'restore', label: 'Restaurar' }]} />
    {brush === 'view'
      ? <Help>Lo que ves a cuadros es lo que se quitará. Acerca con dos dedos para revisar los bordes, y usa Borrar o Restaurar para corregir.</Help>
      : <>
        <ValueSlider compact label="Tamaño" value={mask.size} min={2} max={250} onChange={v => setMask({ size: v })} format={int} />
        <ValueSlider compact label="Dureza" value={mask.hardness} min={1} max={100} onChange={v => setMask({ hardness: v })} format={pct} />
        <Help>{brush === 'erase' ? 'Pinta sobre lo que sobra para quitarlo.' : 'Pinta sobre lo que se quitó por error para recuperarlo.'} Dos dedos mueven el lienzo.</Help>
      </>}
    {!!layer.maskStrokes?.length && <MiniButton label="Deshacer correcciones" onPress={() => update(layer.id, { maskStrokes: [] })} />}
    <Help>Pulsa «Aplicar» arriba cuando la selección esté bien.</Help>
  </View>;
}
