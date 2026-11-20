import React, { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';
import { PhotoCanvas, type PhotoCanvasHandle, type InteractionMode } from '../components/editor/PhotoCanvas';
import { LayersPanel } from '../components/editor/LayersPanel';
import { useEditorStore } from '../store/useEditorStore';
function ToolButton({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable disabled={disabled} onPress={onPress} style={[styles.button, disabled && styles.disabled]}><Text style={styles.buttonText}>{label}</Text></Pressable>;
}
export function EditorScreen() {
  const document = useEditorStore((s) => s.document);
  const setPhoto = useEditorStore((s) => s.setPhoto);
  const addImage = useEditorStore((s) => s.addImage);
  const addShape = useEditorStore((s) => s.addShape);
  const addPaint = useEditorStore(s => s.addPaint);
  const [brushColor, setBrushColor] = useState('#ff508e');
  const [brushSize, setBrushSize] = useState(20);
  const [eraser, setEraser] = useState(false);
  const canvas = useRef<PhotoCanvasHandle>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<InteractionMode>('layer');
  const undo = useEditorStore(s => s.undo);
  const redo = useEditorStore(s => s.redo);
  const canUndo = useEditorStore(s => s.past.length > 0);
  const canRedo = useEditorStore(s => s.future.length > 0);
  async function importImage(replace = false) {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 1 });
      if (result.canceled || !result.assets.length) return;
      const asset = result.assets[0];
      if (!asset.width || !asset.height) throw new Error('La imagen no tiene dimensiones válidas.');
      const photo = { uri: asset.uri, width: asset.width, height: asset.height, name: asset.fileName ?? undefined };
      if (replace) setPhoto(photo); else addImage(photo);
    } catch (error) { Alert.alert('Error al importar', String(error)); }
  }
  async function exportPreview() {
    if (!document || busy) return;
    setBusy(true);
    try {
      const permission = await MediaLibrary.requestPermissionsAsync(true);
      if (!permission.granted) { Alert.alert('Permiso requerido', 'Permite guardar imágenes en la galería.'); return; }
      const base64 = canvas.current?.snapshotBase64();
      if (!base64) throw new Error('El canvas aún no está listo.');
      const file = `${FileSystem.cacheDirectory}photo-studio-${Date.now()}.png`;
      await FileSystem.writeAsStringAsync(file, base64, { encoding: FileSystem.EncodingType.Base64 });
      await MediaLibrary.saveToLibraryAsync(file);
      Alert.alert('Exportación completada', 'Vista del canvas guardada en tu galería.');
    } catch (error) { Alert.alert('Error al exportar', String(error)); }
    finally { setBusy(false); }
  }
  return <SafeAreaView style={styles.screen}>
    <View style={styles.header}><Text style={styles.brand}>PHOTO STUDIO <Text style={styles.version}>v0.5</Text></Text>
      <ToolButton label="Nuevo" onPress={() => importImage(true)} /></View>
    <View style={styles.workspace}>{document ? <PhotoCanvas key={`${document.width}-${document.height}`} ref={canvas} document={document} mode={mode} brush={{ color: brushColor, size: brushSize, eraser }} /> :
      <View style={styles.empty}><Text style={styles.emptyTitle}>Tu lienzo te espera</Text><Text style={styles.hint}>Importa una imagen para comenzar.</Text><ToolButton label="Elegir imagen" onPress={() => importImage(true)} /></View>}</View>
    {document && <View style={styles.modeRow}>
      <ToolButton label={mode === 'layer' ? '✓ Editar capa' : 'Editar capa'} onPress={() => setMode('layer')} />
      <ToolButton label={mode === 'view' ? '✓ Mover vista' : 'Mover vista'} onPress={() => setMode('view')} />
      <ToolButton label={mode === 'brush' ? '✓ Pincel' : 'Pincel'} onPress={() => { if (!document.layers.some(l => l.id === document.selectedId && l.type === 'paint')) addPaint(); setMode('brush'); }} />
      <ToolButton label="↶ Deshacer" onPress={undo} disabled={!canUndo} />
      <ToolButton label="↷ Rehacer" onPress={redo} disabled={!canRedo} />
    </View>}
    {document && mode === 'brush' && <View style={styles.modeRow}>
      {['#ff508e','#ffffff','#111111','#25c5ff','#ffe05a','#65e89b'].map(color => <Pressable key={color} onPress={() => {setBrushColor(color);setEraser(false);}} style={{ width: 28, height: 28, backgroundColor: color, borderRadius: 14, borderWidth: brushColor === color && !eraser ? 3 : 1, borderColor: '#a78bfa' }} />)}
      <ToolButton label={eraser ? '✓ Borrador' : 'Borrador'} onPress={() => setEraser(!eraser)} />
      <ToolButton label="−" onPress={() => setBrushSize(v => Math.max(2, v / 1.5))} />
      <Text style={styles.hint}>{Math.round(brushSize)} px</Text>
      <ToolButton label="+" onPress={() => setBrushSize(v => Math.min(300, v * 1.5))} />
    </View>}
    {document && <LayersPanel />}
    <View style={styles.footer}>
      <View style={styles.actions}><ToolButton label="+ Imagen" onPress={() => importImage(false)} disabled={!document || busy} /><ToolButton label="+ Pintura" onPress={() => { addPaint(); setMode('brush'); }} disabled={!document || busy} /><ToolButton label="+ Forma" onPress={addShape} disabled={!document || busy} /><ToolButton label="Vista 1:1" onPress={() => canvas.current?.reset()} disabled={!document || busy} /><ToolButton label={busy ? 'Guardando...' : 'Exportar'} onPress={exportPreview} disabled={!document || busy} /></View>
      <Text style={styles.hint}>Pincel: dibujar en una capa de pintura · Vista: navegar · Capa: transformar</Text>
      {busy && <ActivityIndicator color="#c6a6ff" />}
    </View>
  </SafeAreaView>;
}
const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: '#101116' }, header: { height: 58, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, brand: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 1 }, version: { fontSize: 11, color: '#c6a6ff' }, workspace: { flex: 1, marginHorizontal: 8, borderRadius: 10, overflow: 'hidden', backgroundColor: '#17191f' }, empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 }, emptyTitle: { color: '#fff', fontSize: 22, fontWeight: '700' }, hint: { color: '#a6a7b3', fontSize: 11, textAlign: 'center' }, modeRow: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 5, paddingVertical: 5 }, footer: { padding: 9, gap: 7, alignItems: 'center' }, actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 5 }, button: { backgroundColor: '#30273f', paddingVertical: 10, paddingHorizontal: 11, borderRadius: 8 }, buttonText: { color: '#eee1ff', fontWeight: '700', fontSize: 12 }, disabled: { opacity: .4 } });
