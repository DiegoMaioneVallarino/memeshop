/**
 * Pantalla del editor: solo compone la interfaz.
 * - Estado del documento: useEditorStore (con historial).
 * - Estado de la interfaz: useUiStore (herramienta abierta, pincel, varita…).
 * - Lógica: editor/actions.ts y tools/<herramienta>/.
 * - Paneles: tools/registry.tsx.
 */
import React, { useCallback, useEffect, useMemo } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
import { useKeyboardVisible } from '../editor/useKeyboardVisible';
import { cropRect, cropLocalAngle, initialCrop } from '../utils/crop';
import { hasEffects, withoutEffects } from '../utils/compare';
import { blankDocument, fillPlaceholder } from '../editor/templateActions';
import type { Tool } from '../store/useUiStore';
import { acceptEdit, applyCrop, canvasRef, chooseTool, closeTool, discardEdit, exportImage, importImage, insertSticker, openTool, removeBackground } from '../editor/actions';

function useCanvasMode(): InteractionMode {
  const tool = useUiStore(s => s.tool), picking = useUiStore(s => s.pickingColor), comparing = useUiStore(s => s.comparing);
  const pushWarp = useEditorStore(s => { const l = s.document?.layers.find(v => v.id === s.document?.selectedId); return l?.type === 'image' && l.warp?.mode === 'push'; });
  if (comparing) return 'view'; // mientras se compara, el lienzo solo se puede mover y acercar
  if (picking) return 'eyedropper';
  if (tool === 'brush') return 'brush';
  if (tool === 'mask') return 'mask';
  if (tool === 'wand') return 'wand';
  if (tool === 'warp' && pushWarp) return 'warp';
  return 'layer';
}

function useBrushOptions(): BrushOptions {
  const tool = useUiStore(s => s.tool), brush = useUiStore(s => s.brush), mask = useUiStore(s => s.mask);
  return useMemo(() => tool === 'mask'
    ? { color: '#ffffff', size: mask.size, eraser: false, opacity: mask.opacity / 100, hardness: mask.hardness / 100, spread: mask.spread, restore: mask.mode === 'restore' }
    : { color: brush.color, size: brush.size, eraser: brush.eraser, opacity: brush.opacity / 100, hardness: brush.hardness / 100, spread: brush.spread },
  [tool, brush, mask]);
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
  const undo = useEditorStore(s => s.undo), redo = useEditorStore(s => s.redo);
  const canUndo = useEditorStore(s => s.past.length > 0), canRedo = useEditorStore(s => s.future.length > 0);
  const editing = useEditorStore(s => !!s.editBaseline);

  const tool = useUiStore(s => s.tool), layersOpen = useUiStore(s => s.layersOpen), stickersOpen = useUiStore(s => s.stickersOpen);
  const busy = useUiStore(s => s.busy), imageLoading = useUiStore(s => s.imageLoading), bgWorking = useUiStore(s => s.bgWorking);
  const picking = useUiStore(s => s.pickingColor), gpuWand = useUiStore(s => s.gpuWand), toast = useUiStore(s => s.toast);
  const templatesOpen = useUiStore(s => s.templatesOpen), comparing = useUiStore(s => s.comparing);
  const set = useUiStore(s => s.set), setBrush = useUiStore(s => s.setBrush), hideToast = useUiStore(s => s.hideToast);

  const mode = useCanvasMode();
  const brush = useBrushOptions();
  const cropPreview = useCropPreview();
  const keyboardOpen = useKeyboardVisible();

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

  // Antes / después. Con una herramienta abierta, «antes» es el documento al abrirla (el efecto que estás probando);
  // sin herramienta, es la foto sin ningún efecto de imagen. Solo se calcula mientras el botón está pulsado.
  const canCompare = editing ? !!baseline && baseline !== document : hasEffects(document);
  const shown = useMemo(() => (!comparing || !document ? document : editing && baseline ? baseline : withoutEffects(document)),
    [comparing, document, editing, baseline]);
  const compare = document ? {
    label: editing ? 'Ver antes del efecto' : 'Ver original',
    active: comparing, disabled: !canCompare,
    onStart: () => set({ comparing: true }), onEnd: () => set({ comparing: false }),
  } : undefined;

  const panel = tool ? TOOL_PANELS[tool] : undefined;
  const contextual = selectedIsSlot ? { id: 'photo' as const, icon: 'image' as const, label: 'Poner foto' }
    : selectedType === 'shape' ? { id: 'shape' as const, icon: 'square' as const, label: 'Forma' } : null;
  const onSelectTool = (t: Tool) => { if (t === 'photo') { if (selectedId) void fillPlaceholder(selectedId); return; } chooseTool(t); };
  const isText = tool === 'text';

  return <SafeAreaView style={s.root} edges={['top', 'bottom', 'left', 'right']}>
    <EditorHeader editing={editing} applyEdit={tool === 'crop' ? () => void applyCrop() : acceptEdit} cancelEdit={discardEdit} back={onBack}
      undo={undo} redo={redo} canUndo={canUndo} canRedo={canRedo} exportImage={() => void exportImage()} busy={busy}
      eraseImage={document && selectedId ? () => { set({ layersOpen: false }); acceptEdit(); useUiStore.getState().setMask({ mode: 'erase' }); openTool('mask'); } : undefined}
      eraseActive={tool === 'mask'}
      removeBackground={document && selectedType === 'image' ? () => { void removeBackground(); } : undefined} removeBackgroundBusy={bgWorking} compare={compare} />

    <View style={s.workspace}>
      {document && shown
        ? <PhotoCanvas key={`${shown.width}-${shown.height}`} ref={canvasRef} document={shown} mode={mode} brush={brush}
            gpuWand={tool === 'wand' ? gpuWand : null} cropPreview={cropPreview} onLayerRemoved={onLayerRemoved}
            onWandPick={(x, y) => wand.pick(x, y)}
            onPickColor={color => { setBrush({ color, eraser: false }); set({ pickingColor: false }); }} />
        : <View style={s.empty}>
            <Feather name="image" size={48} color="#aaa" />
            <Text style={s.emptyTitle}>Comienza a crear</Text>
            <MiniButton label="Elegir imagen" active onPress={() => void importImage(true)} />
            <MiniButton label="Usar una plantilla" onPress={() => set({ templatesOpen: true })} />
            <MiniButton label="Lienzo en blanco 1080×1080" onPress={() => useEditorStore.getState().replaceDocument(blankDocument(1080, 1080))} />
          </View>}
      {comparing && <View pointerEvents="none" style={s.compareBadge}><Text style={s.compareText}>{editing ? 'ANTES' : 'ORIGINAL'}</Text></View>}
      {document && layersOpen && <LayersDrawer document={document} onClose={() => set({ layersOpen: false })} />}
    </View>

    {document && panel && <View style={[s.sheetContainer, isText && s.textFloating, isText && keyboardOpen && s.textFloatingKeyboard]}>
      <Sheet title={panel.title} onClose={closeTool}>
        <ScrollView style={{ flexGrow: 0 }} keyboardShouldPersistTaps="handled" nestedScrollEnabled showsVerticalScrollIndicator={false}>
          <View style={{ paddingHorizontal: 12 }}><panel.Panel /></View>
        </ScrollView>
      </Sheet>
    </View>}

    {picking && <Pressable style={s.pickerBanner} onPress={() => set({ pickingColor: false })}>
      <Text style={{ color: 'white' }}>Mantén pulsado y arrastra el cuentagotas · Toca aquí para cancelar</Text>
    </Pressable>}
    {document && <View style={keyboardOpen && isText ? { opacity: 0 } : undefined}>
      <EditorToolbar active={layersOpen ? 'layers' : templatesOpen ? 'templates' : tool} onSelect={onSelectTool} contextual={contextual} />
    </View>}
    {document && stickersOpen && <StickerLibrary onInsert={a => void insertSticker(a)} onClose={() => set({ stickersOpen: false })} />}
    {templatesOpen && <TemplateLibrary onClose={() => set({ templatesOpen: false })} />}
    {(busy || imageLoading || bgWorking) && <ActivityIndicator color={theme.accent} style={s.busy} />}
    {toast && <ToastBar key={toast.id} message={toast.message} actionLabel={toast.actionLabel} onAction={toast.action} onHide={hideToast} />}
  </SafeAreaView>;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  workspace: { flex: 1, backgroundColor: '#1a1a1a' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20 },
  emptyTitle: { color: '#fff', fontSize: 22, fontWeight: '600' },
  sheetContainer: { maxHeight: '49%' },
  textFloating: { position: 'absolute', bottom: 67, left: 0, right: 0, zIndex: 10, maxHeight: 264, backgroundColor: theme.panel, borderTopLeftRadius: 14, borderTopRightRadius: 14, overflow: 'hidden' },
  textFloatingKeyboard: { bottom: undefined, top: 0, maxHeight: 110 },
  busy: { position: 'absolute', top: 80, alignSelf: 'center' },
  pickerBanner: { backgroundColor: '#342137', padding: 12, alignItems: 'center' },
  compareBadge: { position: 'absolute', top: 12, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,.7)', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 6 },
  compareText: { color: '#fff', fontWeight: '800', letterSpacing: 1.5, fontSize: 12 },
});
