/**
 * Varita mágica: cálculo diferido de la máscara mientras se mueven los sliders.
 * Antes vivía en EditorScreen como 6 useRef + 5 useState. Es estado de una sola sesión de varita,
 * así que basta con variables de módulo + useUiStore para lo que la interfaz necesita ver.
 */
import { Alert } from 'react-native';
import { createMagicMask } from '../../services/magicWand';
import { releaseMask } from '../../services/maskStore';
import { useEditorStore } from '../../store/useEditorStore';
import { useUiStore } from '../../store/useUiStore';

let sessionKey: string | null = null; // máscara creada en la sesión actual (se reemplaza en cada recálculo)
let sequence = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
let point: { x: number; y: number } | null = null;
let layerId: string | null = null;

const ui = () => useUiStore.getState();
const stopPending = () => { sequence++; if (timer) clearTimeout(timer); timer = null; };

async function calculate(x: number, y: number, targetId: string, seq: number) {
  const layer = useEditorStore.getState().document?.layers.find(l => l.id === targetId);
  if (!layer || layer.type !== 'image') return;
  ui().setWandSession({ working: true });
  try {
    const uri = await createMagicMask(layer.uri, x, y, ui().wand);
    if (seq !== sequence || layerId !== targetId) { releaseMask(uri); return; }
    // Dentro de la sesión los recálculos intermedios no entran al historial, así que se liberan.
    const previous = sessionKey;
    useEditorStore.getState().update(targetId, { magicMaskUri: uri });
    sessionKey = uri;
    if (previous) releaseMask(previous);
  } catch (e) { if (seq === sequence) Alert.alert('Varita mágica', String(e)); }
  finally { if (seq === sequence) ui().setWandSession({ working: false }); }
}

function schedule(x: number, y: number, targetId: string, delay = 40) {
  ui().set({ gpuWand: null });
  point = { x, y }; layerId = targetId;
  ui().setWandSession({ point: { x, y }, layerId: targetId });
  const seq = ++sequence;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { void calculate(x, y, targetId, seq); }, delay);
}

export const wand = {
  /** Toque en el lienzo (coordenadas 0..1 de la capa seleccionada). */
  pick(x: number, y: number) {
    const doc = useEditorStore.getState().document;
    const layer = doc?.layers.find(l => l.id === doc.selectedId);
    if (layer?.type === 'image') schedule(x, y, layer.id, 0);
  },
  /** Cambió tolerancia, suavizado o modo: recalcula sobre el último toque. */
  settingsChanged() {
    if (point && layerId && ui().tool === 'wand') schedule(point.x, point.y, layerId, 60);
  },
  /** Aplicar: la máscara actual pasa a ser definitiva (ya está en el documento). */
  commit() { sessionKey = null; ui().set({ gpuWand: null }); },
  /** Cancelar: el documento vuelve atrás, así que la máscara de la sesión ya no se usa. */
  discard() { stopPending(); releaseMask(sessionKey); sessionKey = null; ui().set({ gpuWand: null }); this.forget(); },
  /** Olvida el toque (al cambiar de capa seleccionada). */
  forget() {
    stopPending(); sessionKey = null; point = null; layerId = null;
    ui().set({ gpuWand: null }); ui().setWandSession({ point: null, layerId: null, working: false });
  },
  reset() {
    stopPending();
    const doc = useEditorStore.getState().document;
    const selected = doc?.layers.find(l => l.id === doc.selectedId);
    if (selected?.type === 'image') useEditorStore.getState().update(selected.id, { magicMaskUri: undefined });
    releaseMask(sessionKey); sessionKey = null; point = null; layerId = null;
    ui().set({ gpuWand: null }); ui().setWandSession({ point: null, layerId: null, working: false });
  },
  async saveAsSticker() {
    const layer = useEditorStore.getState().document?.layers.find(l => l.id === layerId);
    const gpu = ui().gpuWand;
    if (!layer || layer.type !== 'image' || (!layer.magicMaskUri && !gpu)) return;
    if (ui().wandSession.working) { Alert.alert('Un momento', 'Espera a que termine la previsualización.'); return; }
    ui().set({ busy: true });
    try {
      if (gpu) {
        const uri = await createMagicMask(layer.uri, gpu.x, gpu.y, { tolerance: gpu.tolerance, feather: gpu.feather, contiguous: false });
        useEditorStore.getState().update(layer.id, { magicMaskUri: uri });
        ui().set({ gpuWand: null });
        Alert.alert('Máscara aplicada', 'La selección se guardó en la capa. Ahora puedes guardarla como sticker.');
        return;
      }
      // Se pregunta nombre y etiquetas antes de guardar (ventana «Guardar sticker»).
      ui().set({ stickerSave: { layerId: layer.id } });
    } catch (e) { Alert.alert('No se pudo guardar el sticker', String(e)); }
    finally { ui().set({ busy: false }); }
  },
};
