import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Help, MiniButton, Row, Segmented, ValueSlider, theme } from '../../components/common/controls';
import { useUiStore } from '../../store/useUiStore';
import { useSelectedLayer } from '../useSelected';
import { wand } from './wandController';

export function WandPanel() {
  const settings = useUiStore(s => s.wand), setWand = useUiStore(s => s.setWand);
  const session = useUiStore(s => s.wandSession), gpu = useUiStore(s => s.gpuWand), busy = useUiStore(s => s.busy);
  const selected = useSelectedLayer();
  const change = (patch: Parameters<typeof setWand>[0]) => { setWand(patch); wand.settingsChanged(); };
  if (selected?.type !== 'image') return <Help>Selecciona una capa de imagen y toca el fondo que quieres quitar.</Help>;
  return <View style={s.root}>
    <Help>Toca el fondo. Global: quita todo lo que tenga ese color. Contiguo: solo la zona conectada al toque.</Help>
    <Segmented value={settings.contiguous ? 'c' : 'g'} onChange={v => change({ contiguous: v === 'c' })}
      options={[{ id: 'c', label: 'Contiguo' }, { id: 'g', label: 'Global' }]} />
    <ValueSlider label="Tolerancia" value={settings.tolerance} min={0} max={100} onChange={v => change({ tolerance: v })} format={v => `${Math.round(v)}%`} />
    <ValueSlider label="Suavizado" value={settings.feather} min={0} max={100} onChange={v => change({ feather: v })} format={v => `${Math.round(v)}%`} />
    {session.working && <Row><ActivityIndicator color={theme.accent} /><Help>Actualizando selección…</Help></Row>}
    {session.point && session.layerId === selected.id &&
      <Pressable disabled={session.working || busy} onPress={() => void wand.saveAsSticker()}
        style={[s.primary, (session.working || busy) && { opacity: .5 }]}>
        <Text style={s.primaryText}>{gpu ? 'Aplicar máscara GPU' : 'Guardar como sticker'}</Text>
      </Pressable>}
    <MiniButton label="Restablecer fondo" onPress={() => wand.reset()} />
  </View>;
}
const s = StyleSheet.create({
  root: { gap: 8, paddingBottom: 8 },
  primary: { backgroundColor: theme.accent, padding: 14, borderRadius: 12, alignItems: 'center' },
  primaryText: { color: theme.accentInk, fontWeight: '800' },
});
