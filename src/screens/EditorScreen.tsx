import React, { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';
import { PhotoCanvas, type PhotoCanvasHandle } from '../components/editor/PhotoCanvas';
import { useEditorStore } from '../store/useEditorStore';

function ToolButton({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable disabled={disabled} onPress={onPress} style={[styles.button, disabled && styles.disabled]}>
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

export function EditorScreen() {
  const photo = useEditorStore((s) => s.photo);
  const setPhoto = useEditorStore((s) => s.setPhoto);
  const canvas = useRef<PhotoCanvasHandle>(null);
  const [busy, setBusy] = useState(false);

  async function importImage() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 1,
      });
      if (result.canceled || !result.assets.length) return;
      const asset = result.assets[0];
      if (!asset.width || !asset.height) throw new Error('La imagen no tiene dimensiones válidas.');
      setPhoto({ uri: asset.uri, width: asset.width, height: asset.height, name: asset.fileName ?? undefined });
    } catch (error) {
      Alert.alert('Error al importar', String(error));
    }
  }

  async function exportPreview() {
    if (!photo || busy) return;
    setBusy(true);
    try {
      const permission = await MediaLibrary.requestPermissionsAsync(true);
      if (!permission.granted) {
        Alert.alert('Permiso requerido', 'Permite guardar imágenes en la galería.');
        return;
      }
      const base64 = canvas.current?.snapshotBase64();
      if (!base64) throw new Error('El canvas aún no está listo.');
      const file = `${FileSystem.cacheDirectory}photo-studio-${Date.now()}.png`;
      await FileSystem.writeAsStringAsync(file, base64, { encoding: FileSystem.EncodingType.Base64 });
      await MediaLibrary.saveToLibraryAsync(file);
      Alert.alert('Exportación completada', 'Vista previa guardada en tu galería.');
    } catch (error) {
      Alert.alert('Error al exportar', String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.brand}>PHOTO STUDIO</Text>
        <ToolButton label="Importar" onPress={importImage} />
      </View>
      <View style={styles.workspace}>
        {photo ? (
          <PhotoCanvas key={photo.uri} ref={canvas} photo={photo} />
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Tu lienzo te espera</Text>
            <Text style={styles.hint}>Importa una imagen para comenzar.</Text>
            <ToolButton label="Elegir imagen" onPress={importImage} />
          </View>
        )}
      </View>
      <View style={styles.footer}>
        <Text style={styles.hint}>Arrastra · Pellizca · Gira</Text>
        <View style={styles.actions}>
          <ToolButton label="Restablecer" onPress={() => canvas.current?.reset()} disabled={!photo || busy} />
          <ToolButton label={busy ? 'Guardando...' : 'Exportar vista'} onPress={exportPreview} disabled={!photo || busy} />
        </View>
        {busy && <ActivityIndicator color="#c6a6ff" />}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#101116' },
  header: { height: 66, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { color: '#fff', fontSize: 17, fontWeight: '800', letterSpacing: 2 },
  workspace: { flex: 1, marginHorizontal: 10, borderRadius: 12, overflow: 'hidden', backgroundColor: '#17191f' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  emptyTitle: { color: '#fff', fontSize: 22, fontWeight: '700' },
  hint: { color: '#a6a7b3', fontSize: 12 },
  footer: { padding: 14, gap: 12, alignItems: 'center' },
  actions: { flexDirection: 'row', gap: 10 },
  button: { backgroundColor: '#30273f', paddingVertical: 11, paddingHorizontal: 17, borderRadius: 10 },
  buttonText: { color: '#eee1ff', fontWeight: '700' },
  disabled: { opacity: 0.4 },
});
