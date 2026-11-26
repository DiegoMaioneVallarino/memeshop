/** Guardar (o editar) un sticker: nombre + etiquetas para el buscador local. */
import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { theme } from '../common/controls';
import { parseTags } from '../../utils/search';

export function StickerSaveModal({ visible, title, initialName, initialTags = [], confirmLabel = 'Guardar sticker', cancelLabel = 'No guardar', busy, onCancel, onConfirm }: {
  visible: boolean; title: string; initialName: string; initialTags?: string[]; confirmLabel?: string; cancelLabel?: string; busy?: boolean;
  onCancel: () => void; onConfirm: (name: string, tags: string[]) => void;
}) {
  const [name, setName] = useState(initialName);
  const [tagText, setTagText] = useState(initialTags.join(', '));
  useEffect(() => { if (visible) { setName(initialName); setTagText(initialTags.join(', ')); } }, [visible]);
  const tags = parseTags(tagText);
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.backdrop}>
      <View style={s.card}>
        <Text style={s.title}>{title}</Text>
        <Text style={s.label}>Nombre</Text>
        <TextInput value={name} onChangeText={setName} maxLength={40} placeholder="Ej. León sorprendido" placeholderTextColor="#777" style={s.input} selectTextOnFocus />
        <Text style={s.label}>Etiquetas (separadas por comas)</Text>
        <TextInput value={tagText} onChangeText={setTagText} placeholder="reacción, risa, gato" placeholderTextColor="#777" style={s.input} autoCapitalize="none" />
        {tags.length > 0 && <View style={s.chips}>{tags.map(t => <View key={t} style={s.chip}><Text style={s.chipText}>#{t}</Text></View>)}</View>}
        <Text style={s.hint}>Con las etiquetas lo encuentras después en el buscador de tus stickers.</Text>
        <View style={s.actions}>
          <Pressable onPress={onCancel} style={s.secondary}><Text style={{ color: '#ccc', fontWeight: '600' }}>{cancelLabel}</Text></Pressable>
          <Pressable disabled={busy || !name.trim()} onPress={() => onConfirm(name.trim(), tags)} style={[s.primary, (busy || !name.trim()) && { opacity: .5 }]}>
            <Text style={{ color: theme.accentInk, fontWeight: '800' }}>{busy ? 'Guardando…' : confirmLabel}</Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}
const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,.6)', justifyContent: 'center', padding: 22 },
  card: { backgroundColor: '#1f1f1f', borderRadius: 16, padding: 18, gap: 8 },
  title: { color: '#fff', fontSize: 18, fontWeight: '800', marginBottom: 4 },
  label: { color: '#aaa', fontSize: 12, fontWeight: '700', marginTop: 4 },
  input: { backgroundColor: '#2b2b2b', color: '#fff', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, borderWidth: 1, borderColor: '#444' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { backgroundColor: '#14531a', borderRadius: 12, paddingHorizontal: 9, paddingVertical: 4 },
  chipText: { color: '#d6ffd2', fontSize: 12, fontWeight: '700' },
  hint: { color: '#888', fontSize: 12 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 8 },
  secondary: { paddingHorizontal: 14, paddingVertical: 10 },
  primary: { backgroundColor: theme.accent, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10 },
});
