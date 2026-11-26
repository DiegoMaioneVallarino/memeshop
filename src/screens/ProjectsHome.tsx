import React, { useMemo, useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { ProjectMeta } from '../services/projects';
import { ActionSheet, PromptModal } from '../components/common/overlays';

type Tab = 'recent' | 'week' | 'az';
const TABS: { id: Tab; label: string }[] = [{ id: 'recent', label: 'Recientes' }, { id: 'week', label: 'Esta semana' }, { id: 'az', label: 'A–Z' }];
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function relativeDate(ts: number) {
  const days = Math.floor((Date.now() - ts) / 86400000);
  if (days <= 0) return 'Hoy';
  if (days === 1) return 'Ayer';
  if (days < 7) return `Hace ${days} días`;
  return new Date(ts).toLocaleDateString();
}

/** «Mis proyectos»: la lista completa con búsqueda, pestañas y menú de cada proyecto (se abre desde el inicio). */
export function ProjectsHome({ projects, onOpen, onCreate, onDelete, onRename, onDuplicate, onBack }: {
  onBack: () => void; projects: ProjectMeta[]; onOpen: (p: ProjectMeta) => void; onCreate: () => void;
  onDelete: (id: string) => void; onRename: (id: string, name: string) => void; onDuplicate: (id: string) => void;
}) {
  const [tab, setTab] = useState<Tab>('recent');
  const [query, setQuery] = useState('');
  const [menuFor, setMenuFor] = useState<ProjectMeta | null>(null);
  const [renaming, setRenaming] = useState<ProjectMeta | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ProjectMeta | null>(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = q ? projects.filter(p => p.name.toLowerCase().includes(q)) : projects;
    if (tab === 'week') list = list.filter(p => Date.now() - p.updatedAt < WEEK_MS);
    return [...list].sort(tab === 'az' ? (a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }) : (a, b) => b.updatedAt - a.updatedAt);
  }, [projects, tab, query]);

  const empty = projects.length === 0;
  return <View style={s.root}>
    <View style={s.header}>
      <Pressable accessibilityLabel="Volver al inicio" hitSlop={10} onPress={onBack} style={{ padding: 4 }}><Feather name="arrow-left" size={26} color="#111" /></Pressable>
      <Text style={s.heading}>Mis proyectos</Text>
      <View style={{ width: 34 }} />
    </View>
    {!empty && <>
      <View style={s.search}>
        <Feather name="search" size={18} color="#888" />
        <TextInput value={query} onChangeText={setQuery} placeholder="Buscar proyectos" placeholderTextColor="#999" style={s.searchInput} returnKeyType="search" />
        {!!query && <Pressable hitSlop={10} onPress={() => setQuery('')}><Feather name="x" size={18} color="#888" /></Pressable>}
      </View>
      <View style={s.tabs}>
        {TABS.map(t => <Pressable key={t.id} onPress={() => setTab(t.id)} style={[s.tab, tab === t.id && s.tabActive]}>
          <Text style={[s.tabText, tab === t.id && { color: 'white' }]}>{t.label}</Text>
        </Pressable>)}
      </View>
    </>}
    <FlatList data={visible} numColumns={2} keyExtractor={p => p.id} contentContainerStyle={{ padding: 12, paddingBottom: 110 }}
      ListEmptyComponent={empty
        ? <View style={s.empty}><Feather name="folder" size={50} color="#aaa" /><Text style={s.emptyText}>Todavía no tienes proyectos</Text>
            <Pressable onPress={onCreate} style={s.create}><Text style={{ color: 'white', fontWeight: '700' }}>Crear proyecto</Text></Pressable></View>
        : <View style={s.empty}><Feather name="search" size={40} color="#bbb" /><Text style={s.emptyText}>
            {query ? `Nada coincide con «${query}»` : 'No editaste ningún proyecto esta semana'}</Text></View>}
      renderItem={({ item }) => <View style={s.card}>
        <Pressable onPress={() => onOpen(item)} onLongPress={() => setMenuFor(item)} delayLongPress={350}>
          <View style={s.preview}>
            {item.thumbnail ? <Image source={{ uri: item.thumbnail }} style={{ width: '100%', height: '100%' }} resizeMode="cover" /> : <Feather name="image" size={35} color="#888" />}
          </View>
          <Text style={s.name} numberOfLines={1}>{item.name}</Text>
          <Text style={s.date}>{relativeDate(item.updatedAt)}</Text>
        </Pressable>
        <Pressable accessibilityLabel={`Opciones de ${item.name}`} hitSlop={8} style={s.more} onPress={() => setMenuFor(item)}>
          <Feather name="more-horizontal" size={22} color="#333" />
        </Pressable>
      </View>} />
    <Pressable accessibilityLabel="Nuevo proyecto" onPress={onCreate} style={s.fab}><Feather name="plus" size={32} color="white" /></Pressable>

    <ActionSheet visible={!!menuFor} title={menuFor?.name} onClose={() => setMenuFor(null)} actions={menuFor ? [
      { label: 'Abrir', onPress: () => onOpen(menuFor) },
      { label: 'Renombrar', onPress: () => setRenaming(menuFor) },
      { label: 'Duplicar', onPress: () => onDuplicate(menuFor.id) },
      { label: 'Eliminar', destructive: true, onPress: () => setConfirmDelete(menuFor) },
    ] : []} />
    <ActionSheet visible={!!confirmDelete} title={confirmDelete ? `¿Eliminar «${confirmDelete.name}»? No se puede deshacer.` : undefined}
      onClose={() => setConfirmDelete(null)} actions={confirmDelete ? [{ label: 'Eliminar proyecto', destructive: true, onPress: () => onDelete(confirmDelete.id) }] : []} />
    <PromptModal visible={!!renaming} title="Renombrar proyecto" initialValue={renaming?.name ?? ''} placeholder="Nombre del proyecto"
      onCancel={() => setRenaming(null)} onConfirm={name => { if (renaming) onRename(renaming.id, name); setRenaming(null); }} />
  </View>;
}
const green = '#0b6e09';
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  header: { paddingHorizontal: 24, paddingTop: 18, paddingBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brand: { fontSize: 12, fontWeight: '800', color: '#148d00' },
  heading: { fontSize: 24, fontWeight: '800', color: '#111' },
  search: { marginHorizontal: 18, marginBottom: 12, backgroundColor: '#f0f0f0', borderRadius: 14, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8 },
  searchInput: { flex: 1, paddingVertical: 10, color: '#111', fontSize: 15 },
  tabs: { flexDirection: 'row', gap: 10, paddingHorizontal: 18, paddingBottom: 6 },
  tab: { backgroundColor: '#f0f0f0', paddingVertical: 10, paddingHorizontal: 18, borderRadius: 25 },
  tabActive: { backgroundColor: green },
  tabText: { color: '#111', fontWeight: '600' },
  card: { width: '50%', padding: 7 },
  preview: { aspectRatio: 1, backgroundColor: '#f0f0f0', borderRadius: 15, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  name: { fontWeight: '600', fontSize: 15, marginTop: 8, color: '#111', paddingRight: 30 },
  date: { color: '#888', fontSize: 12, marginTop: 4 },
  more: { position: 'absolute', right: 10, bottom: 4, padding: 5 },
  empty: { alignItems: 'center', paddingTop: 100, gap: 18 },
  emptyText: { color: '#666', textAlign: 'center' },
  create: { backgroundColor: green, padding: 14, paddingHorizontal: 22, borderRadius: 20 },
  fab: { position: 'absolute', right: 25, bottom: 28, backgroundColor: green, width: 66, height: 66, borderRadius: 33, alignItems: 'center', justifyContent: 'center', elevation: 6 },
});
