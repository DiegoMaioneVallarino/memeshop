/**
 * Pantalla del editor: solo compone la interfaz.
 * - Estado del documento: useEditorStore (con historial).
 * - Estado de la interfaz: useUiStore (herramienta abierta, pincel, varita…).
 * - Lógica: editor/actions.ts y tools/<herramienta>/.
 * - Paneles: tools/registry.tsx.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { PhotoCanvas, type BrushOptions, type CropPreview, type InteractionMode } from '../components/editor/PhotoCanvas';
import { EditorHeader, EditorToolbar, Sheet } from '../components/editor/EditorChrome';
import { LayersDrawer } from '../components/editor/LayersDrawer';
import { StickerLibrary } from '../components/editor/StickerLibrary';
import { TemplateLibrary } from '../components/editor/TemplateLibrary';
import { MiniButton, theme } from '../components/common/controls';
import { ToastBar } from '../components/common/overlays';
import { useEditorStore } from '../store/useEditorStore';
import { useUiStore } from '../store/useUiStore';
import type { EditorDocument } from '../types/editor';
import { TOOL_PANELS } from '../tools/registry';
import { wand } from '../tools/wand/wandController';
import { TextEditOverlay } from '../components/editor/TextEditOverlay';
import { Glass } from '../components/common/Glass';
import { StickerSaveModal } from '../components/editor/StickerSaveModal';
import { addCollageSticker, startCollage } from '../editor/collageActions';
import { replaceLayerWithSticker } from '../editor/sceneActions';
import type { StickerAsset } from '../services/stickerLibrary';

const HEADER_H = 64;
import { acceptCutout, cancelStickerFlow, createStickerFromGallery, saveLayerAsSticker } from '../editor/stickerActions';
import { cropRect, cropLocalAngle, initialCrop } from '../utils/crop';
import { hasEffects, withoutEffects } from '../utils/compare';
import { blankDocument, fillPlaceholder } from '../editor/templateActions';
import type { Tool } from '../store/useUiStore';
import { acceptEdit, applyCrop, cancelTextEditing, editTextLayer, finishTextEditing, canvasRef, chooseTool, closeTool, discardEdit, exportImage, importImage, insertSticker, openTool, removeBackground } from '../editor/actions';

function useCanvasMode(): InteractionMode {
  const tool = useUiStore(s => s.tool), picking = useUiStore(s => s.pickingColor), comparing = useUiStore(s => s.comparing);
  const cutoutBrush = useUiStore(s => s.cutoutBrush);
  const pushWarp = useEditorStore(s => { const l = s.document?.layers.find(v => v.id === s.document?.selectedId); return l?.type === 'image' && l.warp?.mode === 'push'; });
  if (comparing) return 'view'; // mientras se compara, el lienzo solo se puede mover y acercar
  if (tool === 'cutout') return cutoutBrush === 'view' ? 'view' : 'mask';
  if (picking) return 'eyedropper';
  if (tool === 'brush') return 'brush';
  if (tool === 'mask') return 'mask';
  if (tool === 'wand') return 'wand';
  if (tool === 'warp' && pushWarp) return 'warp';
  if (tool === 'liquify') return 'liquify';
  return 'layer';
}

function useBrushOptions(): BrushOptions {
  const tool = useUiStore(s => s.tool), brush = useUiStore(s => s.brush), mask = useUiStore(s => s.mask), cutoutBrush = useUiStore(s => s.cutoutBrush);
  return useMemo(() => tool === 'mask' || tool === 'cutout'
    ? { color: '#ffffff', size: mask.size, eraser: false, opacity: mask.opacity / 100, hardness: mask.hardness / 100, spread: mask.spread, restore: tool === 'cutout' ? cutoutBrush === 'restore' : mask.mode === 'restore' }
    : { color: brush.color, size: brush.size, eraser: brush.eraser, opacity: brush.opacity / 100, hardness: brush.hardness / 100, spread: brush.spread },
  [tool, brush, mask, cutoutBrush]);
}

function useCropPreview(): CropPreview | null {
  const tool = useUiStore(s => s.tool), crop = useUiStore(s => s.crop);
  const layer = useEditorStore(s => s.document?.layers.find(l => l.id === s.document?.selectedId));
  return useMemo(() => tool === 'crop' && layer?.type === 'image'
    ? { layerId: layer.id, rect: cropRect(crop, layer.width, layer.height, !!layer.flipX), angle: cropLocalAngle(crop, !!layer.flipX) }
    : null, [tool, crop, layer]);
}

export function EditorScreen({ onBack }: { onBack: () => void }) {
  const document = useEditorStore(s => s.document);
  const selectedId = useEditorStore(s => s.document?.selectedId ?? null);
  const selectedType = useEditorStore(s => s.document?.layers.find(l => l.id === s.document?.selectedId)?.type);
  const selectedIsSlot = useEditorStore(s => { const l = s.document?.layers.find(v => v.id === s.document?.selectedId); return l?.type === 'shape' && !!l.placeholder; });
  const baseline = useEditorStore(s => s.editBaseline);
  const origin = useEditorStore(s => s.origin);
  const undo = useEditorStore(s => s.undo), redo = useEditorStore(s => s.redo);
  const canUndo = useEditorStore(s => (s.editBaseline ? s.sessionPast.length : s.past.length) > 0);
  const canRedo = useEditorStore(s => (s.editBaseline ? s.sessionFuture.length : s.future.length) > 0);
  const sessionUndo = useEditorStore(s => s.sessionUndo), sessionRedo = useEditorStore(s => s.sessionRedo);
  const editing = useEditorStore(s => !!s.editBaseline);

  const tool = useUiStore(s => s.tool), layersOpen = useUiStore(s => s.layersOpen), stickersOpen = useUiStore(s => s.stickersOpen);
  const busy = useUiStore(s => s.busy), imageLoading = useUiStore(s => s.imageLoading), bgWorking = useUiStore(s => s.bgWorking);
  const picking = useUiStore(s => s.pickingColor), gpuWand = useUiStore(s => s.gpuWand), toast = useUiStore(s => s.toast);
  const templatesOpen = useUiStore(s => s.templatesOpen), comparing = useUiStore(s => s.comparing);
  const liquify = useUiStore(s => s.liquify), textEditing = useUiStore(s => s.textEditing), cutoutBrush = useUiStore(s => s.cutoutBrush);
  const stickerSave = useUiStore(s => s.stickerSave), stickerPick = useUiStore(s => s.stickerPick);
  const stickerLayerName = document?.layers.find(l => l.id === stickerSave?.layerId)?.name ?? 'Sticker';
  const set = useUiStore(s => s.set), setBrush = useUiStore(s => s.setBrush), hideToast = useUiStore(s => s.hideToast);

  const mode = useCanvasMode();
  const brush = useBrushOptions();
  const cropPreview = useCropPreview();
  const editingTextLayer = (() => { const l = textEditing ? document?.layers.find(v => v.id === textEditing.layerId) : undefined; return l?.type === 'text' ? l : undefined; })();
  const insets = useSafeAreaInsets();
  // Altura del área de trabajo (constante: cabecera y barra no cambian). Los paneles se SUPERPONEN abajo, en una
  // franja reservada; el documento siempre se encaja por encima de ella, así abrir/cerrar paneles o aplicar
  // efectos nunca mueve la cámara.
  const [workHeight, setWorkHeight] = useState(0);
  const [toolbarH, setToolbarH] = useState(76);
  const headerTotal = insets.top + 6 + HEADER_H;
  const toolbarTotal = document ? toolbarH + insets.bottom : 0;
  const panelReserve = Math.round(Math.min(360, Math.max(220, workHeight * .44)));
  // El lienzo ocupa toda la pantalla: el documento se encaja ENTRE la cabecera y la franja de paneles sobre la barra.
  const frame = useMemo(() => ({ top: headerTotal + 10, bottom: toolbarTotal + panelReserve + 8 }), [headerTotal, toolbarTotal, panelReserve]);

  // Cambiar de capa invalida el toque de la varita y el rectángulo de recorte.
  useEffect(() => { wand.forget(); set({ crop: initialCrop }); }, [selectedId, set]);

  const onLayerRemoved = useCallback((name: string, before: EditorDocument) => {
    useUiStore.getState().showToast({
      message: `«${name}» eliminada`, actionLabel: 'Deshacer',
      action: () => {
        const st = useEditorStore.getState();
        if (st.editBaseline) useEditorStore.setState({ document: before }); // dentro de una sesión: aún no hay paso de historial
        else if (st.past[st.past.length - 1] === before) st.undo();     // solo si el borrado sigue siendo el último cambio
      },
    });
  }, []);

  // Antes / después, SIEMPRE sobre el lienzo completo. Con una herramienta abierta, «antes» es el lienzo al abrirla
  // (el efecto que estás probando); sin herramienta, es el lienzo tal como estaba al abrir o crear el proyecto.
  const canCompare = editing ? !!baseline && baseline !== document : !!origin && origin !== document;
  const shown = useMemo(() => {
    const base = !comparing || !document ? document : editing && baseline ? baseline : origin ?? document;
    // Quitar fondo: la imagen se ve SOLA sobre la cuadrícula de transparencia para juzgar la selección.
    if (base && tool === 'cutout' && selectedId) return { ...base, background: 'transparent', layers: base.layers.filter(l => l.id === selectedId) };
    return base;
  }, [comparing, document, editing, baseline, origin, tool, selectedId]);
  const compare = document ? {
    label: editing ? 'Ver antes del efecto' : 'Ver original',
    active: comparing, disabled: !canCompare,
    onStart: () => set({ comparing: true }), onEnd: () => set({ comparing: false }),
  } : undefined;

  const panel = tool ? TOOL_PANELS[tool] : undefined;
  // Botones de la capa seleccionada, al principio de la barra inferior (siempre a la vista).
  const contextual = selectedIsSlot ? [{ id: 'photo' as const, icon: 'image' as const, label: 'Poner foto' }]
    : selectedType === 'shape' ? [{ id: 'shape' as const, icon: 'square' as const, label: 'Forma' }]
    : selectedType === 'image' ? [{ id: 'cutout' as const, icon: 'scissors' as const, label: 'Quitar fondo' }] : [];
  const onSelectTool = (t: Tool) => {
    if (t === 'photo') { if (selectedId) void fillPlaceholder(selectedId); return; }
    if (t === 'cutout') { if (tool !== 'cutout' && !bgWorking) void removeBackground(); return; }
    if (t === 'collage') { set({ layersOpen: false }); if (tool === 'collage') { acceptEdit(); return; } startCollage(); return; }
    chooseTool(t);
  };

  const pickerOpen = stickersOpen || !!stickerPick;
  const onStickerChosen = (a: StickerAsset) => {
    const pick = stickerPick;
    set({ stickerPick: null, stickersOpen: false });
    if (pick?.purpose === 'collage') void addCollageSticker(a);
    else if (pick?.purpose === 'replace') void replaceLayerWithSticker(pick.layerId, a);
    else void insertSticker(a);
  };

  return <View style={s.root}>
    {/* El lienzo ocupa TODA la pantalla y pasa por debajo de la cabecera y la barra translúcidas. */}
    <View style={StyleSheet.absoluteFill}>
      {document && shown && <PhotoCanvas ref={canvasRef} document={shown} mode={mode} brush={brush} frame={frame} liquify={liquify}
        gpuWand={tool === 'wand' ? gpuWand : null} cropPreview={cropPreview} onLayerRemoved={onLayerRemoved}
        onWandPick={(x, y) => wand.pick(x, y)} onEditText={editTextLayer}
        onPickColor={color => { setBrush({ color, eraser: false }); set({ pickingColor: false }); }} />}
    </View>

    {/* Zona entre la cabecera y la barra: paneles, cajón de capas, avisos. Deja pasar los toques al lienzo. */}
    <View pointerEvents="box-none" style={[s.middle, { top: headerTotal, bottom: toolbarTotal, left: insets.left, right: insets.right }]}
      onLayout={e => { const h = e.nativeEvent.layout.height; if (!textEditing && Math.abs(h - workHeight) > 1) setWorkHeight(h); }}>
      {!document && <View style={s.empty}>
        <Feather name="image" size={48} color="#aaa" />
        <Text style={s.emptyTitle}>Comienza a crear</Text>
        <MiniButton label="Elegir imagen" active onPress={() => void importImage(true)} />
        <MiniButton label="Usar una plantilla" onPress={() => set({ templatesOpen: true })} />
        <MiniButton label="Lienzo en blanco 1080×1080" onPress={() => useEditorStore.getState().replaceDocument(blankDocument(1080, 1080))} />
      </View>}
      {comparing && <View pointerEvents="none" style={s.compareBadge}><Text style={s.compareText}>{editing ? 'ANTES' : 'ORIGINAL'}</Text></View>}
      {picking && <Pressable style={s.pickerBanner} onPress={() => set({ pickingColor: false })}>
        <Text style={{ color: 'white', textAlign: 'center' }}>Mantén pulsado y arrastra el cuentagotas · Toca aquí para cancelar</Text>
      </Pressable>}
      {document && panel && <View style={[s.sheetOverlay, { maxHeight: panelReserve }]}>
        <Sheet title={panel.title} onClose={closeTool}>
          <ScrollView style={{ flexGrow: 0 }} keyboardShouldPersistTaps="handled" nestedScrollEnabled showsVerticalScrollIndicator={false}>
            <View style={{ paddingHorizontal: 12 }}><panel.Panel /></View>
          </ScrollView>
        </Sheet>
      </View>}
      {document && !layersOpen && tool !== 'cutout' && <Pressable accessibilityLabel="Capas" onPress={() => set({ layersOpen: true, pickingColor: false })} style={s.layersFabWrap}>
        <Glass style={s.layersFab}><Feather name="layers" size={24} color="#fff" /></Glass>
      </Pressable>}
      {document && layersOpen && <LayersDrawer document={document} onClose={() => set({ layersOpen: false })} />}
      {(busy || imageLoading || bgWorking) && <ActivityIndicator color={theme.accent} style={s.busy} />}
      {toast && <ToastBar key={toast.id} message={toast.message} actionLabel={toast.actionLabel} onAction={toast.action} onHide={hideToast} />}
    </View>

    <Glass style={[s.headerBar, { paddingTop: insets.top + 6, paddingLeft: insets.left, paddingRight: insets.right }]}>
    <EditorHeader editing={editing} applyEdit={tool === 'crop' ? () => void applyCrop() : tool === 'cutout' ? acceptCutout : acceptEdit}
      cancelEdit={() => { discardEdit(); cancelStickerFlow(); }} back={onBack}
      undo={editing ? sessionUndo : undo} redo={editing ? sessionRedo : redo} canUndo={canUndo} canRedo={canRedo} exportImage={() => void exportImage()} busy={busy}
      eraseImage={document && selectedId ? () => {
        set({ layersOpen: false });
        // En la revisión de quitar fondo, la goma corrige la selección sin salir de ella.
        if (tool === 'cutout') { set({ cutoutBrush: 'erase' }); return; }
        acceptEdit(); useUiStore.getState().setMask({ mode: 'erase' }); openTool('mask');
      } : undefined}
      eraseActive={tool === 'mask' || (tool === 'cutout' && cutoutBrush === 'erase')} eraseInEdit={tool === 'cutout'}
      compare={compare} />
    </Glass>
    {document && <View style={s.footerBar} onLayout={e => { const h = e.nativeEvent.layout.height - insets.bottom; if (Math.abs(h - toolbarH) > 1) setToolbarH(h); }}>
      <Glass style={{ paddingBottom: insets.bottom, paddingLeft: insets.left, paddingRight: insets.right }}>
        <EditorToolbar active={layersOpen ? 'layers' : templatesOpen ? 'templates' : tool} onSelect={onSelectTool} contextual={contextual} />
      </Glass>
    </View>}

    {/* Pantallas completas: empiezan debajo de la barra de estado / isla dinámica. */}
    {document && pickerOpen && <View style={[StyleSheet.absoluteFill, { top: insets.top }]}>
      <StickerLibrary key={stickerPick ? `pick-${stickerPick.purpose}` : 'library'} onInsert={onStickerChosen}
        onClose={() => set({ stickersOpen: false, stickerPick: null })} onCreate={() => { set({ stickerPick: null }); void createStickerFromGallery(); }}
        title={stickerPick?.purpose === 'collage' ? 'Elige un sticker para el collage' : stickerPick?.purpose === 'replace' ? `Sustituir «${stickerPick.query || 'componente'}»` : undefined}
        initialQuery={stickerPick?.purpose === 'replace' ? stickerPick.query : undefined} />
    </View>}
    {templatesOpen && <View style={[StyleSheet.absoluteFill, { top: insets.top }]}><TemplateLibrary onClose={() => set({ templatesOpen: false })} /></View>}
    <StickerSaveModal visible={!!stickerSave} title="¿Guardar como sticker?" initialName={stickerLayerName.replace(/\.(jpe?g|png|webp|heic)$/i, '')}
      busy={busy} onCancel={() => set({ stickerSave: null })}
      onConfirm={(name, tags) => { const id = stickerSave?.layerId; set({ stickerSave: null }); if (id) void saveLayerAsSticker(id, name, tags); }} />
    {textEditing && editingTextLayer && <TextEditOverlay key={textEditing.layerId} initialText={editingTextLayer.text} initialAlign={editingTextLayer.align}
      isNew={textEditing.isNew} onCancel={() => cancelTextEditing()} onDone={finishTextEditing} />}
  </View>;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  middle: { position: 'absolute' },
  headerBar: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20 },
  footerBar: { position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20 },
  emptyTitle: { color: '#fff', fontSize: 22, fontWeight: '600' },
  sheetOverlay: { position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 10, overflow: 'hidden', borderTopLeftRadius: 18, borderTopRightRadius: 18 },
  busy: { position: 'absolute', top: 40, alignSelf: 'center', zIndex: 30 },
  pickerBanner: { position: 'absolute', top: 8, left: 12, right: 12, zIndex: 20, backgroundColor: '#342137', padding: 12, borderRadius: 12, alignItems: 'center' },
  layersFabWrap: { position: 'absolute', right: 0, top: 10, zIndex: 12 },
  layersFab: { width: 54, height: 50, alignItems: 'center', justifyContent: 'center', borderTopLeftRadius: 14, borderBottomLeftRadius: 14 },
  compareBadge: { position: 'absolute', top: 12, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,.7)', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 6 },
  compareText: { color: '#fff', fontWeight: '800', letterSpacing: 1.5, fontSize: 12 },
});
