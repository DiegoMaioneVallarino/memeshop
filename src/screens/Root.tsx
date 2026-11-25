/**
 * Raíz: arranque, pantalla de inicio y ciclo de vida del proyecto abierto (autoguardado, miniatura, limpieza).
 * El editor ya no sabe nada de proyectos: recibe un documento en el store y un callback para volver.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Image, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ProjectsHome } from './ProjectsHome';
import { EditorScreen } from './EditorScreen';
import {
  deleteProject, detachLibraryAssets, duplicateProject, listProjects, loadProject, migrateLegacyMasks, migrateLegacyProjects,
  persistProject, pruneAssets, renameProject, writeThumbnail, type ProjectMeta,
} from '../services/projects';
import { clearMasks } from '../services/maskStore';
import { ensureFonts } from '../services/fonts';
import { renderThumbnailBase64 } from '../components/editor/PhotoCanvas';
import { useEditorStore } from '../store/useEditorStore';
import { useUiStore } from '../store/useUiStore';
import { theme } from '../components/common/controls';

const AUTOSAVE_MS = 1200;

export function Root() {
  const [booting, setBooting] = useState(true);
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [open, setOpen] = useState<{ id: string; name: string; thumbnail?: string } | null>(null);
  /** Documento del que se hizo la última miniatura: si no cambió, no se vuelve a renderizar. */
  const thumbFor = useRef<unknown>(null);

  const refresh = useCallback(() => listProjects().then(setProjects), []);

  useEffect(() => {
    let alive = true;
    const start = Date.now();
    void ensureFonts();
    void migrateLegacyProjects().then(() => migrateLegacyMasks()).then(() => listProjects())
      .then(items => { if (alive) setProjects(items); })
      .catch(e => console.warn('Proyectos:', e?.stack ?? e))
      .finally(() => setTimeout(() => { if (alive) setBooting(false); }, Math.max(0, 650 - (Date.now() - start))));
    return () => { alive = false; };
  }, []);

  /** Guarda el proyecto abierto. Con `withThumbnail` renderiza también la miniatura (solo si el documento cambió). */
  const save = useCallback(async (withThumbnail: boolean) => {
    const doc = useEditorStore.getState().document;
    if (!open || !doc) return;
    let thumbnail = open.thumbnail;
    if (withThumbnail && thumbFor.current !== doc) {
      try { thumbnail = await writeThumbnail(await renderThumbnailBase64(doc)); thumbFor.current = doc; setOpen(o => o ? { ...o, thumbnail } : o); }
      catch (e) { console.warn('Miniatura:', e); }
    }
    await persistProject({ id: open.id, name: open.name, updatedAt: Date.now(), thumbnail, document: doc });
  }, [open]);

  // Autoguardado (sin miniatura: renderizarla en cada cambio sería caro). Se suscribe al store FUERA de React:
  // si Root leyera el documento con un selector, se volvería a renderizar —y con él el editor— en cada trazo.
  useEffect(() => {
    if (!open) return;
    let t: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = useEditorStore.subscribe((state, prev) => {
      if (!state.document || state.document === prev.document) return;
      if (t) clearTimeout(t);
      t = setTimeout(() => { void save(false).catch(e => console.warn('Autoguardado:', e?.stack ?? e)); }, AUTOSAVE_MS);
    });
    return () => { unsubscribe(); if (t) clearTimeout(t); };
  }, [open, save]);

  // Al pasar a segundo plano se guarda con miniatura: el sistema puede cerrar la app sin avisar.
  useEffect(() => {
    const sub = AppState.addEventListener('change', st => { if (st === 'background') void save(true).catch(() => {}); });
    return () => sub.remove();
  }, [save]);

  const openProject = async (meta: ProjectMeta) => {
    const p = await loadProject(meta.id);
    if (!p) { Alert.alert('Abrir proyecto', 'No se pudo leer este proyecto. Puede estar dañado.'); return; }
    let doc = p.document;
    try { doc = (await detachLibraryAssets(doc)).document; } catch (e) { console.warn(e); }
    clearMasks();
    useUiStore.getState().resetForDocument();
    useEditorStore.setState({ document: doc, past: [], future: [], editBaseline: null });
    thumbFor.current = doc; // recién abierto: la miniatura guardada ya corresponde a este documento
    setOpen({ id: p.id, name: p.name, thumbnail: p.thumbnail });
  };
  const newProject = () => {
    clearMasks();
    useUiStore.getState().resetForDocument();
    useEditorStore.getState().resetDocument();
    thumbFor.current = null;
    setOpen({ id: String(Date.now()), name: 'Proyecto sin título' });
  };
  const goHome = async () => {
    const st = useEditorStore.getState();
    if (st.editBaseline) st.finishEdit(); // un panel abierto cuenta como aplicado
    try { await save(true); } catch (e) { console.warn('Guardar al salir:', e); }
    useUiStore.getState().resetForDocument();
    setOpen(null);
    await refresh();
    void pruneAssets();
  };

  const goHomeRef = useRef(goHome); goHomeRef.current = goHome;
  const onBack = useCallback(() => { void goHomeRef.current(); }, []);

  if (booting) return <View style={{ flex: 1, backgroundColor: '#071d08', alignItems: 'center', justifyContent: 'center' }}>
    <Image source={require('../assets/memeshop-logo.png')} style={{ width: 180, height: 180, borderRadius: 35 }} resizeMode="contain" />
    <Text style={{ color: '#fff', fontSize: 24, fontWeight: '800', marginTop: 18 }}>MEMESHOP</Text>
    <ActivityIndicator color={theme.accent} size="large" style={{ marginTop: 24 }} />
  </View>;

  if (open) return <EditorScreen onBack={onBack} />;

  return <SafeAreaView style={{ flex: 1, backgroundColor: 'white' }} edges={['top', 'left', 'right']}>
    <ProjectsHome projects={projects} onOpen={p => void openProject(p)} onCreate={newProject}
      onRename={async (id, name) => { try { await renameProject(id, name); await refresh(); } catch (e) { Alert.alert('Renombrar', String(e)); } }}
      onDuplicate={async id => { try { await duplicateProject(id); await refresh(); } catch (e) { Alert.alert('Duplicar', String(e)); } }}
      onDelete={async id => { await deleteProject(id); await refresh(); void pruneAssets(); }} />
  </SafeAreaView>;
}
