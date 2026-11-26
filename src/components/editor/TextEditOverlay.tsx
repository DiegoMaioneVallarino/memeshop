/**
 * Edición del texto a pantalla completa. El teclado SOLO aparece aquí: el panel de texto (fuente, trazo, color…)
 * nunca queda tapado. El campo se centra en el espacio libre sobre el teclado, así nunca choca con él.
 */
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { theme } from '../common/controls';
import type { TextLayer } from '../../types/editor';

const NEXT_ALIGN: Record<TextLayer['align'], TextLayer['align']> = { left: 'center', center: 'right', right: 'left' };
const ALIGN_ICON = { left: 'align-left', center: 'align-center', right: 'align-right' } as const;

export function TextEditOverlay({ initialText, initialAlign, isNew, onCancel, onDone }: {
  initialText: string; initialAlign: TextLayer['align']; isNew: boolean;
  onCancel: () => void; onDone: (text: string, align: TextLayer['align']) => void;
}) {
  const insets = useSafeAreaInsets();
  const [text, setText] = useState(isNew ? '' : initialText);
  const [align, setAlign] = useState<TextLayer['align']>(initialAlign);
  return <View style={[StyleSheet.absoluteFill, s.backdrop]}>
    <View style={[s.bar, { paddingTop: insets.top + 6 }]}>
      <Pressable accessibilityLabel="Cancelar" hitSlop={12} onPress={onCancel} style={s.icon}><Feather name="x" size={28} color="#fff" /></Pressable>
      <Pressable accessibilityLabel="Cambiar alineación" hitSlop={12} onPress={() => setAlign(a => NEXT_ALIGN[a])} style={s.icon}>
        <Feather name={ALIGN_ICON[align]} size={26} color="#fff" />
      </Pressable>
      <Pressable accessibilityLabel="Listo" hitSlop={12} onPress={() => onDone(text, align)} style={s.icon}><Feather name="check" size={28} color={theme.accent} /></Pressable>
    </View>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.center}>
      <TextInput autoFocus multiline value={text} onChangeText={setText} placeholder="Escribe tu texto" placeholderTextColor="rgba(255,255,255,.45)"
        textAlign={align} style={[s.input, { textAlign: align }]} scrollEnabled maxLength={500} selectionColor={theme.accent} />
    </KeyboardAvoidingView>
  </View>;
}
const s = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(0,0,0,.72)', zIndex: 60, elevation: 30 },
  bar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingBottom: 8 },
  icon: { padding: 8 },
  center: { flex: 1, justifyContent: 'center', paddingHorizontal: 22 },
  input: { color: '#fff', fontSize: 34, fontWeight: '800', maxHeight: '80%', paddingVertical: 8 },
});
