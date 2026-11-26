import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Segmented, theme } from '../common/controls';
import { ActionSheet, PromptModal } from '../common/overlays';
import { deleteTemplate, listTemplates, renameTemplate, type TemplateKind, type TemplateMeta } from '../../services/templates';
import { BUILTIN_TEMPLATES } from '../../templates/builtin';
import { applyTemplate, saveCurrentAsTemplate } from '../../editor/templateActions';
import { renderThumbnailBase64 } from './PhotoCanvas';
import { useEditorStore } from '../../store/useEditorStore';

/** Las miniaturas de las plantillas incluidas se dibujan con el propio motor la primera vez y se guardan en memoria. */
const builtinThumbs = new Map<string, string>();
function useBuiltinThumb(id: string) {
  const [uri, setUri] = useState(builtinThumbs.get(id) ?? null);
  useEffect(() => {
    if (uri) return;
    const t = BUILTIN_TEMPLATES.find(b => b.id === id);
    if (!t) return;
    let alive = true;
    renderThumbnailBase64(t.document, 320).then(b64 => {
      const data = `data:image/jpeg;base64,${b64}`;
      builtinThumbs.set(id, data);
      if (alive) setUri(data);
    }).catch(e => console.warn('Miniatura de plantilla incluida:', e));
    return () => { alive = false; };
  }, [id, uri]);
  return uri;
}

const KIND_LABEL: Record<TemplateKind, string> = { layout: 'Diseño', overlay: 'Sobre tu foto' };

export function TemplateCard({ meta, onPress, onLongPress, width, light }: { meta: TemplateMeta; onPress: () => void; onLongPress?: () => void; width?: number; light?: boolean }) {
  const builtinUri = useBuiltinThumb(meta.builtIn ? meta.id : '');
  const uri = meta.builtIn ? builtinUri : meta.thumbnail ?? null;
  return <Pressable onPress={onPress} onLongPress={onLongPress} delayLongPress={350} style={width ? { width } : s.card} accessibilityLabel={`Plantilla ${meta.name}`}>
    <View style={[s.thumb, light && { backgroundColor: '#f0f0f0' }]}>
      {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="contain" /> : <ActivityIndicator color="#777" />}
      <View style={[s.badge, meta.kind === 'overlay' && { backgroundColor: '#1f3b8a' }]}><Text style={s.badgeText}>{KIND_LABEL[meta.kind]}</Text></View>
    </View>
    <Text style={[s.name, light && { color: '#111' }]} numberOfLines={1}>{meta.name}</Text>
    {onLongPress ? <Pressable hitSlop={10} onPress={onLongPress} style={s.more}><Feather name="more-horizontal" size={18} color="#ccc" /></Pressable> : null}
  </Pressable>;
}

function SaveTemplateModal({ visible, onClose }: { visible: boolean; onClose: (saved: boolean) => void }) {
  const [name, setName] = useState('Mi plantilla');
  const [kind, setKind] = useState<TemplateKind>('layout');
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (visible) { setName('Mi plantilla'); setKind('layout'); } }, [visible]);
  const save = async () => { setSaving(true); const meta = await saveCurrentAsTemplate(name, kind); setSaving(false); onClose(!!meta); };
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={() => onClose(false)}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.backdrop}>
      <View style={s.modal}>
        <Text style={s.modalTitle}>Guardar como plantilla</Text>
        <TextInput value={name} onChangeText={setName} selectTextOnFocus autoFocus maxLength={40} style={s.input} placeholder="Nombre" placeholderTextColor="#888" />
        <Segmented value={kind} onChange={setKind} options={[{ id: 'layout', label: 'Diseño completo' }, { id: 'overlay', label: 'Sin la foto de fondo' }]} />
        <Text style={s.hint}>{kind === 'layout'
          ? 'Guarda todo el lienzo, fotos incluidas. Al usarla, reemplaza el lienzo.'
          : 'Guarda todo menos la capa de abajo (textos, stickers, marcos) para ponerlo encima de cualquier foto.'}</Text>
        <View style={s.actions}>
          <Pressable onPress={() => onClose(false)} style={s.secondary}><Text style={{ color: '#ccc', fontWeight: '600' }}>Cancelar</Text></Pressable>
          <Pressable disabled={saving || !name.trim()} onPress={() => void save()} style={[s.primary, (saving || !name.trim()) && { opacity: .5 }]}>
            <Text style={{ color: theme.accentInk, fontWeight: '800' }}>{saving ? 'Guardando…' : 'Guardar'}</Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}

export function TemplateLibrary({ onClose }: { onClose: () => void }) {
  const hasDocument = useEditorStore(s => !!s.document?.layers.length);
  const [mine, setMine] = useState<TemplateMeta[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [menuFor, setMenuFor] = useState<TemplateMeta | null>(null);
  const [renaming, setRenaming] = useState<TemplateMeta | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<TemplateMeta | null>(null);
  const refresh = () => listTemplates().then(setMine);
  useEffect(() => { void refresh(); }, []);
  const builtins: TemplateMeta[] = BUILTIN_TEMPLATES.map(({ document: _d, ...meta }) => meta);

  return <View style={s.root}>
    <View style={s.head}>
      <Text style={s.title}>Plantillas</Text>
      <Pressable accessibilityLabel="Cerrar" hitSlop={10} onPress={onClose}><Feather name="x" size={24} color="white" /></Pressable>
    </View>
    <ScrollView contentContainerStyle={{ paddingBottom: 40, gap: 14 }}>
      {hasDocument && <Pressable onPress={() => setSaving(true)} style={s.saveButton}>
        <Feather name="bookmark" size={19} color={theme.accentInk} /><Text style={s.saveText}>Guardar mi diseño como plantilla</Text>
      </Pressable>}
      <Text style={s.section}>MIS PLANTILLAS</Text>
      {mine === null ? <ActivityIndicator color={theme.accent} /> : mine.length === 0
        ? <Text style={s.empty}>Aún no tienes plantillas. Diseña un meme y guárdalo aquí para reutilizarlo.</Text>
        : <View style={s.grid}>{mine.map(m => <TemplateCard key={m.id} meta={m} onPress={() => void applyTemplate(m)} onLongPress={() => setMenuFor(m)} />)}</View>}
      <Text style={s.section}>INCLUIDAS</Text>
      <Text style={s.empty}>«Diseño» reemplaza el lienzo; toca un hueco gris y «Poner foto» para rellenarlo. «Sobre tu foto» se añade encima de tu imagen.</Text>
      <View style={s.grid}>{builtins.map(m => <TemplateCard key={m.id} meta={m} onPress={() => void applyTemplate(m)} />)}</View>
    </ScrollView>

    <SaveTemplateModal visible={saving} onClose={saved => { setSaving(false); if (saved) void refresh(); }} />
    <ActionSheet visible={!!menuFor} title={menuFor?.name} onClose={() => setMenuFor(null)} actions={menuFor ? [
      { label: 'Usar plantilla', onPress: () => void applyTemplate(menuFor) },
      { label: 'Renombrar', onPress: () => setRenaming(menuFor) },
      { label: 'Eliminar', destructive: true, onPress: () => setConfirmDelete(menuFor) },
    ] : []} />
    <ActionSheet visible={!!confirmDelete} title={confirmDelete ? `¿Eliminar «${confirmDelete.name}»? Los proyectos que la usaron no cambian.` : undefined}
      onClose={() => setConfirmDelete(null)} actions={confirmDelete ? [{ label: 'Eliminar plantilla', destructive: true, onPress: () => { void deleteTemplate(confirmDelete.id).then(refresh); } }] : []} />
    <PromptModal visible={!!renaming} title="Renombrar plantilla" initialValue={renaming?.name ?? ''}
      onCancel={() => setRenaming(null)} onConfirm={name => { if (renaming) void renameTemplate(renaming.id, name).then(refresh); setRenaming(null); }} />
  </View>;
}
const s = StyleSheet.create({
  root: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: '#171717', zIndex: 20, padding: 16 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  title: { color: 'white', fontSize: 21, fontWeight: '700' },
  saveButton: { backgroundColor: theme.accent, borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  saveText: { color: theme.accentInk, fontWeight: '800' },
  section: { color: '#9a9a9a', fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  empty: { color: '#888', fontSize: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: { width: '47%' },
  thumb: { aspectRatio: 1, backgroundColor: '#262626', borderRadius: 12, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', left: 6, top: 6, backgroundColor: '#14531a', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  name: { color: '#eee', fontSize: 13, marginTop: 6, paddingRight: 24 },
  more: { position: 'absolute', right: 0, bottom: 0, padding: 2 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,.55)', justifyContent: 'center', padding: 24 },
  modal: { backgroundColor: '#1f1f1f', borderRadius: 16, padding: 18, gap: 12 },
  modalTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
  input: { backgroundColor: '#2b2b2b', color: '#fff', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, borderWidth: 1, borderColor: '#444' },
  hint: { color: '#999', fontSize: 12 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  secondary: { paddingHorizontal: 16, paddingVertical: 10 },
  primary: { backgroundColor: theme.accent, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10 },
});
