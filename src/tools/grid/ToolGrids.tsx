import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useEditorStore } from '../../store/useEditorStore';
import { useUiStore, type Tool } from '../../store/useUiStore';
import { acceptEdit, chooseTool, importImage, openTool } from '../../editor/actions';
import { initialCrop } from '../../utils/crop';

type Icon = React.ComponentProps<typeof Feather>['name'];
function GridButton({ icon, title, onPress }: { icon: Icon; title: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" style={s.button} onPress={onPress}><Feather name={icon} color="#fff" size={24} /><Text style={s.text}>{title}</Text></Pressable>;
}
/** Cambia de una herramienta a otra cerrando la sesión actual. */
const go = (tool: Tool) => { acceptEdit(); openTool(tool); };

export function ToolsGrid() {
  return <View style={s.grid}>
    <GridButton icon="crop" title="Recortar" onPress={() => { useUiStore.getState().set({ crop: initialCrop }); go('crop'); }} />
    <GridButton icon="aperture" title="Deformar" onPress={() => go('warp')} />
    <GridButton icon="target" title="Varita mágica" onPress={() => go('wand')} />
    <GridButton icon="sliders" title="Ajustar" onPress={() => go('adjust')} />
    <GridButton icon="move" title="Transformar" onPress={() => go('transform')} />
    <GridButton icon="layers" title="Capas" onPress={() => { acceptEdit(); useUiStore.getState().set({ layersOpen: true }); }} />
    <GridButton icon="edit-3" title="Dibujar" onPress={() => { acceptEdit(); chooseTool('brush'); }} />
    <GridButton icon="plus-square" title="Añadir" onPress={() => go('add')} />
  </View>;
}

export function AddPanel() {
  const addPaint = useEditorStore(s => s.addPaint), addText = useEditorStore(s => s.addText), addShape = useEditorStore(s => s.addShape);
  // Cada elemento nuevo es su propio paso de historial: se cierra la sesión de "Añadir" antes de crearlo.
  const add = (create: () => void, tool: Tool | null) => { acceptEdit(); create(); if (tool) openTool(tool); };
  return <View style={s.grid}>
    <GridButton icon="image" title="Imagen" onPress={() => { acceptEdit(); void importImage(false); }} />
    <GridButton icon="edit-3" title="Pintura" onPress={() => add(addPaint, 'brush')} />
    <GridButton icon="type" title="Texto" onPress={() => add(addText, 'text')} />
    <GridButton icon="square" title="Forma" onPress={() => add(addShape, 'shape')} />
    <GridButton icon="refresh-cw" title="Nueva foto" onPress={() => { acceptEdit(); void importImage(true); }} />
  </View>;
}
const s = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  button: { width: '25%', alignItems: 'center', paddingVertical: 14, gap: 7 },
  text: { color: '#fff', fontSize: 12, textAlign: 'center' },
});
