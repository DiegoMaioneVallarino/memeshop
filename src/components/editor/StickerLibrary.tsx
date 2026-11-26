/**
 * Biblioteca de stickers. Los stickers se CREAN desde una foto (quitar fondo + revisión + nombre y etiquetas);
 * ya no se guarda una imagen tal cual al importarla. Buscador local por nombre y etiquetas.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { deleteSticker, getStickers, updateSticker, type StickerAsset } from '../../services/stickerLibrary';
import { matchesQuery } from '../../utils/search';
import { ActionSheet } from '../common/overlays';
import { theme } from '../common/controls';
import { StickerSaveModal } from './StickerSaveModal';

/** Cuadrícula de transparencia hecha con Views (8×8 celdas): se ve qué parte del sticker es transparente. */
function Checker() {
  return <View style={StyleSheet.absoluteFill}>
    {Array.from({ length: 8 }, (_, r) => <View key={r} style={{ flex: 1, flexDirection: 'row' }}>
      {Array.from({ length: 8 }, (_, c) => <View key={c} style={{ flex: 1, backgroundColor: (r + c) % 2 ? '#3a3a3a' : '#2e2e2e' }} />)}
    </View>)}
  </View>;
}

export function StickerLibrary({ onInsert, onClose, onCreate, title, initialQuery }: { onInsert: (a: StickerAsset) => void; onClose: () => void; onCreate: () => void; title?: string; initialQuery?: string }) {
  const [items, setItems] = useState<StickerAsset[]>([]);
  const [query, setQuery] = useState(initialQuery ?? '');
  const [menuFor, setMenuFor] = useState<StickerAsset | null>(null);
  const [editing, setEditing] = useState<StickerAsset | null>(null);
  const refresh = () => getStickers().then(setItems).catch(e => Alert.alert('Biblioteca', String(e)));
  useEffect(() => { void refresh(); }, []);
  const visible = useMemo(() => items.filter(a => matchesQuery(a, query)), [items, query]);

  return <View style={s.root}>
    <View style={s.head}>
      <Text style={s.title} numberOfLines={1}>{title ?? 'Mis stickers'}</Text>
      <Pressable accessibilityLabel="Cerrar" hitSlop={10} onPress={onClose}><Feather name="x" size={24} color="white" /></Pressable>
    </View>
    <View style={s.search}>
      <Feather name="search" color="#999" size={19} />
      <TextInput placeholder="Buscar por nombre o etiqueta" placeholderTextColor="#999" value={query} onChangeText={setQuery} style={s.input} autoCapitalize="none" />
      {!!query && <Pressable hitSlop={10} onPress={() => setQuery('')}><Feather name="x" size={18} color="#999" /></Pressable>}
    </View>
    <Pressable onPress={onCreate} style={s.create}>
      <Feather name="scissors" color={theme.accentInk} size={19} />
      <Text style={s.createText}>Crear sticker desde una foto</Text>
    </Pressable>
    <Text style={s.hint}>Eliges una foto, se quita el fondo, corriges la selección y decides si guardarla con nombre y etiquetas.</Text>
    <ScrollView contentContainerStyle={s.grid}>
      {items.length === 0 && <Text style={s.empty}>Aún no tienes stickers.</Text>}
      {items.length > 0 && visible.length === 0 && <Text style={s.empty}>Ningún sticker coincide con «{query}».</Text>}
      {visible.map(a => <Pressable key={a.id} onPress={() => onInsert(a)} onLongPress={() => setMenuFor(a)} delayLongPress={350} style={s.tile} accessibilityLabel={`Sticker ${a.name}`}>
        <View style={s.thumb}><Checker /><Image source={{ uri: a.uri }} resizeMode="contain" style={StyleSheet.absoluteFill} /></View>
        <Text style={s.name} numberOfLines={1}>{a.name}</Text>
        {!!a.tags?.length && <Text style={s.tags} numberOfLines={1}>{a.tags.map(t => `#${t}`).join(' ')}</Text>}
        <Pressable hitSlop={8} onPress={() => setMenuFor(a)} style={s.more}><Feather name="more-horizontal" size={16} color="#bbb" /></Pressable>
      </Pressable>)}
    </ScrollView>

    <ActionSheet visible={!!menuFor} title={menuFor?.name} onClose={() => setMenuFor(null)} actions={menuFor ? [
      { label: 'Añadir al lienzo', onPress: () => onInsert(menuFor) },
      { label: 'Editar nombre y etiquetas', onPress: () => setEditing(menuFor) },
      { label: 'Eliminar', destructive: true, onPress: () => Alert.alert('Eliminar sticker', 'Se eliminará de la biblioteca, no de los proyectos donde ya lo usaste.', [
        { text: 'Cancelar' }, { text: 'Eliminar', style: 'destructive', onPress: () => { void deleteSticker(menuFor.id).then(refresh); } },
      ]) },
    ] : []} />
    <StickerSaveModal visible={!!editing} title="Editar sticker" initialName={editing?.name ?? ''} initialTags={editing?.tags ?? []}
      confirmLabel="Guardar cambios" cancelLabel="Cancelar" onCancel={() => setEditing(null)}
      onConfirm={(name, tags) => { if (editing) void updateSticker(editing.id, { name, tags }).then(refresh); setEditing(null); }} />
  </View>;
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#171717', padding: 16 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  title: { color: 'white', fontSize: 21, fontWeight: '700', flex: 1, marginRight: 12 },
  search: { backgroundColor: '#292929', borderRadius: 12, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 6 },
  input: { flex: 1, color: 'white', paddingVertical: 10 },
  create: { backgroundColor: theme.accent, padding: 14, borderRadius: 12, flexDirection: 'row', gap: 8, marginTop: 14, alignItems: 'center', justifyContent: 'center' },
  createText: { color: theme.accentInk, fontWeight: '800' },
  hint: { color: '#888', fontSize: 12, marginTop: 8, marginBottom: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingBottom: 40 },
  empty: { color: '#888', fontSize: 13, paddingVertical: 20 },
  tile: { width: '30%' },
  thumb: { aspectRatio: 1, borderRadius: 10, overflow: 'hidden' },
  name: { color: '#ddd', fontSize: 12, marginTop: 5, paddingRight: 16 },
  tags: { color: '#7fbf78', fontSize: 10 },
  more: { position: 'absolute', right: 0, bottom: 14 },
});
