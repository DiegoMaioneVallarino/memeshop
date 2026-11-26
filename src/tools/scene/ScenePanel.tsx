import React, { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Help, MiniButton, Row, SectionLabel, theme } from '../../components/common/controls';
import { PromptModal } from '../../components/common/overlays';
import { useEditorStore } from '../../store/useEditorStore';
import { useSelectedLayer } from '../useSelected';
import { ROLE_PRESETS, isReplaceable, pickStickerFor, randomizeScene, setRole } from '../../editor/sceneActions';
import { saveCurrentAsTemplate } from '../../editor/templateActions';

/**
 * Escena: a cada capa se le da un papel (mar, tierra, palmera, personaje…). Así la escena se puede guardar como
 * plantilla y rellenar con stickers de la biblioteca, a mano o al azar según sus etiquetas.
 */
export function ScenePanel() {
  const selected = useSelectedLayer();
  const layers = useEditorStore(s => s.document?.layers ?? []);
  const select = useEditorStore(s => s.select);
  const [customRole, setCustomRole] = useState(false);
  const [saving, setSaving] = useState(false);
  const parts = layers.filter(l => l.role).slice().reverse();
  return <View style={{ gap: 6, paddingBottom: 12 }}>
    <SectionLabel>Papel de la capa seleccionada{selected ? ` · ${selected.name}` : ''}</SectionLabel>
    {selected
      ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {ROLE_PRESETS.map(r => <MiniButton key={r} label={r} active={selected.role === r} onPress={() => setRole(selected.id, selected.role === r ? undefined : r)} />)}
          <MiniButton label="Otro…" active={!!selected.role && !ROLE_PRESETS.includes(selected.role)} onPress={() => setCustomRole(true)} />
          {selected.role && <MiniButton label="Quitar papel" danger onPress={() => setRole(selected.id, undefined)} />}
        </ScrollView>
      : <Help>Toca una capa en el lienzo (o en Capas) para darle un papel: el mar, la tierra, una palmera, un personaje…</Help>}

    <SectionLabel>Componentes de la escena</SectionLabel>
    {parts.length === 0 && <Help>Todavía no hay papeles. Con papeles, la escena se rellena con tus stickers.</Help>}
    {parts.map(l => <Pressable key={l.id} onPress={() => select(l.id)} style={[s.part, selected?.id === l.id && s.partActive]}>
      <View style={s.thumb}>{l.type === 'image' ? <Image source={{ uri: l.uri }} style={StyleSheet.absoluteFill} resizeMode="contain" />
        : <Feather name={l.type === 'pattern' ? 'grid' : l.type === 'text' ? 'type' : 'square'} size={18} color="#ccc" />}</View>
      <View style={{ flex: 1 }}>
        <Text style={s.role}>{l.role}</Text>
        <Text style={s.name} numberOfLines={1}>{l.name}</Text>
      </View>
      {isReplaceable(l) && <>
        <Pressable accessibilityLabel={`Cambiar ${l.role}`} hitSlop={6} onPress={() => pickStickerFor(l.id)} style={s.icon}><Feather name="repeat" size={18} color="#fff" /></Pressable>
        <Pressable accessibilityLabel={`${l.role} al azar`} hitSlop={6} onPress={() => void randomizeScene(l.id)} style={s.icon}><Text style={{ fontSize: 17 }}>🎲</Text></Pressable>
      </>}
    </Pressable>)}

    {parts.length > 0 && <Row>
      <MiniButton label="🎲 Todo al azar desde mi biblioteca" onPress={() => void randomizeScene()} />
      <MiniButton label="Guardar escena como plantilla" active onPress={() => setSaving(true)} />
    </Row>}
    <Help>Al azar se eligen stickers cuyo nombre o etiqueta coincida con el papel (p. ej. etiqueta tus palmeras con «palmera»).</Help>

    <PromptModal visible={customRole} title="Papel de la capa" initialValue={selected?.role ?? ''} placeholder="Ej. volcán, nube, perro…"
      onCancel={() => setCustomRole(false)} onConfirm={v => { if (selected) setRole(selected.id, v); setCustomRole(false); }} />
    <PromptModal visible={saving} title="Guardar escena como plantilla" initialValue="Mi escena" confirmLabel="Guardar"
      onCancel={() => setSaving(false)} onConfirm={name => { setSaving(false); void saveCurrentAsTemplate(name, 'layout'); }} />
  </View>;
}
const s = StyleSheet.create({
  part: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, borderRadius: 10, backgroundColor: 'rgba(40,40,40,.7)' },
  partActive: { borderWidth: 1, borderColor: theme.accent },
  thumb: { width: 40, height: 40, borderRadius: 8, backgroundColor: '#2e2e2e', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  role: { color: theme.accent, fontWeight: '800', fontSize: 13, textTransform: 'capitalize' },
  name: { color: '#bbb', fontSize: 11 },
  icon: { padding: 6 },
});
