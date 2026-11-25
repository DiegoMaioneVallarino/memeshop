/**
 * Ventanas que funcionan igual en Android e iOS.
 * Alert.prompt solo existe en iOS y Alert en Android muestra como máximo 3 botones, por eso se hacen a mano.
 */
import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { theme } from './controls';

export function PromptModal({ visible, title, initialValue, placeholder, confirmLabel = 'Guardar', onCancel, onConfirm }: {
  visible: boolean; title: string; initialValue: string; placeholder?: string; confirmLabel?: string;
  onCancel: () => void; onConfirm: (value: string) => void;
}) {
  const [value, setValue] = useState(initialValue);
  useEffect(() => { if (visible) setValue(initialValue); }, [visible, initialValue]);
  const trimmed = value.trim();
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.backdrop}>
      <View style={s.card}>
        <Text style={s.title}>{title}</Text>
        <TextInput autoFocus value={value} onChangeText={setValue} placeholder={placeholder} placeholderTextColor="#888"
          selectTextOnFocus maxLength={60} returnKeyType="done" onSubmitEditing={() => trimmed && onConfirm(trimmed)} style={s.input} />
        <View style={s.actions}>
          <Pressable onPress={onCancel} style={s.secondary}><Text style={s.secondaryText}>Cancelar</Text></Pressable>
          <Pressable disabled={!trimmed} onPress={() => onConfirm(trimmed)} style={[s.primary, !trimmed && { opacity: .4 }]}><Text style={s.primaryText}>{confirmLabel}</Text></Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}

// En iOS no se puede presentar un Modal mientras otro se está cerrando: la acción espera a que termine la animación.
export type SheetAction = { label: string; onPress: () => void; destructive?: boolean };
export function ActionSheet({ visible, title, actions, onClose }: { visible: boolean; title?: string; actions: SheetAction[]; onClose: () => void }) {
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <Pressable style={s.sheetBackdrop} onPress={onClose}>
      <Pressable style={s.sheet} onPress={() => {}}>
        {title ? <Text style={s.sheetTitle} numberOfLines={1}>{title}</Text> : null}
        {actions.map(a => <Pressable key={a.label} onPress={() => { onClose(); setTimeout(a.onPress, Platform.OS === 'ios' ? 350 : 0); }} style={s.sheetItem}>
          <Text style={[s.sheetItemText, a.destructive && { color: theme.danger }]}>{a.label}</Text>
        </Pressable>)}
        <Pressable onPress={onClose} style={[s.sheetItem, { borderBottomWidth: 0 }]}><Text style={[s.sheetItemText, { color: '#888' }]}>Cancelar</Text></Pressable>
      </Pressable>
    </Pressable>
  </Modal>;
}

/** Aviso temporal con acción opcional ("Capa eliminada · Deshacer"). */
export function ToastBar({ message, actionLabel, onAction, onHide, durationMs = 4000 }: { message: string; actionLabel?: string; onAction?: () => void; onHide: () => void; durationMs?: number }) {
  useEffect(() => { const t = setTimeout(onHide, durationMs); return () => clearTimeout(t); }, [message, onHide, durationMs]);
  return <View style={s.toast} pointerEvents="box-none">
    <Text style={s.toastText}>{message}</Text>
    {actionLabel && onAction ? <Pressable hitSlop={10} onPress={() => { onAction(); onHide(); }}><Text style={s.toastAction}>{actionLabel}</Text></Pressable> : null}
  </View>;
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,.55)', justifyContent: 'center', padding: 28 },
  card: { backgroundColor: '#1f1f1f', borderRadius: 16, padding: 18, gap: 14 },
  title: { color: '#fff', fontSize: 17, fontWeight: '700' },
  input: { backgroundColor: '#2b2b2b', color: '#fff', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, borderWidth: 1, borderColor: '#444' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  secondary: { paddingHorizontal: 16, paddingVertical: 10 },
  secondaryText: { color: '#ccc', fontWeight: '600' },
  primary: { backgroundColor: theme.accent, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10 },
  primaryText: { color: theme.accentInk, fontWeight: '800' },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#1f1f1f', borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingBottom: 24, paddingTop: 8 },
  sheetTitle: { color: '#999', fontSize: 13, textAlign: 'center', paddingVertical: 10, paddingHorizontal: 20 },
  sheetItem: { paddingVertical: 16, alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#333' },
  sheetItemText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  toast: { position: 'absolute', left: 16, right: 16, bottom: 92, backgroundColor: '#2c2c2c', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, elevation: 8, zIndex: 50 },
  toastText: { color: '#fff', fontSize: 14, flex: 1 },
  toastAction: { color: theme.accent, fontWeight: '800', fontSize: 14 },
});
