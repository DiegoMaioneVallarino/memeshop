import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useEditorStore } from '../../store/useEditorStore';
function Action({ title, onPress, disabled }: { title: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable disabled={disabled} onPress={onPress} style={[styles.action, disabled && { opacity: .3 }]}><Text style={styles.actionText}>{title}</Text></Pressable>;
}
export function LayersPanel() {
  const doc = useEditorStore((s) => s.document);
  const select = useEditorStore((s) => s.select);
  const update = useEditorStore((s) => s.update);
  const move = useEditorStore((s) => s.move);
  const duplicate = useEditorStore((s) => s.duplicate);
  const remove = useEditorStore((s) => s.remove);
  if (!doc) return null;
  const selected = doc.layers.find((l) => l.id === doc.selectedId);
  return <View style={styles.root}>
    <Text style={styles.heading}>CAPAS ({doc.layers.length}) · arriba = frente</Text>
    <ScrollView style={styles.list} nestedScrollEnabled>
      {[...doc.layers].reverse().map((layer) => <Pressable key={layer.id} onPress={() => select(layer.id)}
        style={[styles.layer, layer.id === doc.selectedId && styles.selected]}>
        <Text style={styles.layerName} numberOfLines={1}>{layer.type === 'image' ? '▧' : layer.type === 'paint' ? '✎' : '▣'}  {layer.name}</Text>
        <Text style={styles.meta}>{Math.round(layer.opacity * 100)}%</Text>
        <Action title={layer.visible ? '◉' : '○'} onPress={() => update(layer.id, { visible: !layer.visible })} />
      </Pressable>)}
    </ScrollView>
    {selected && selected.type === 'image' && <View style={styles.inspector}>
      <Text style={styles.heading}>AJUSTES DE IMAGEN</Text>
      {(['brightness','contrast','saturation'] as const).map(k => <View key={k} style={styles.controls}>
        <Text style={styles.meta}>{k === 'brightness' ? 'Brillo' : k === 'contrast' ? 'Contraste' : 'Saturación'}</Text>
        <Action title="−" onPress={() => update(selected.id, { adjustments: { brightness: 0, contrast: 0, saturation: 0, ...selected.adjustments, [k]: Math.max(-1, (selected.adjustments?.[k] ?? 0) - .1) } } as any)} />
        <Text style={styles.meta}>{(selected.adjustments?.[k] ?? 0).toFixed(1)}</Text>
        <Action title="+" onPress={() => update(selected.id, { adjustments: { brightness: 0, contrast: 0, saturation: 0, ...selected.adjustments, [k]: Math.min(1, (selected.adjustments?.[k] ?? 0) + .1) } } as any)} />
      </View>)}
    </View>}
    {selected && <View style={styles.inspector}>
      <Text style={styles.heading}>TRANSFORMAR · {selected.name}</Text>
      <View style={styles.controls}>
        <Action title="←" onPress={() => update(selected.id, { x: selected.x - doc.width * .025 })} />
        <Action title="→" onPress={() => update(selected.id, { x: selected.x + doc.width * .025 })} />
        <Action title="↑" onPress={() => update(selected.id, { y: selected.y - doc.height * .025 })} />
        <Action title="↓" onPress={() => update(selected.id, { y: selected.y + doc.height * .025 })} />
        <Action title="− tamaño" onPress={() => update(selected.id, { width: selected.width * .9, height: selected.height * .9 })} />
        <Action title="+ tamaño" onPress={() => update(selected.id, { width: selected.width * 1.1, height: selected.height * 1.1 })} />
        <Action title="↺ 15°" onPress={() => update(selected.id, { rotation: selected.rotation - Math.PI / 12 })} />
        <Action title="↻ 15°" onPress={() => update(selected.id, { rotation: selected.rotation + Math.PI / 12 })} />
      </View>
      <View style={styles.controls}>
        <Text style={styles.meta}>Opacidad</Text>
        <Action title="− 10%" onPress={() => update(selected.id, { opacity: selected.opacity - .1 })} />
        <Text style={styles.meta}>{Math.round(selected.opacity * 100)}%</Text>
        <Action title="+ 10%" onPress={() => update(selected.id, { opacity: selected.opacity + .1 })} />
      </View>
      <View style={styles.controls}>
        <Action title="Subir" onPress={() => move(selected.id, 1)} />
        <Action title="Bajar" onPress={() => move(selected.id, -1)} />
        <Action title="Duplicar" onPress={() => duplicate(selected.id)} />
        <Action title="Eliminar" onPress={() => remove(selected.id)} />
      </View>
    </View>}
  </View>;
}
const styles = StyleSheet.create({ root: { backgroundColor: '#1c1c27', padding: 10, maxHeight: 330, gap: 6 }, heading: { color: '#b9a8d8', fontSize: 11, fontWeight: '800' }, list: { maxHeight: 100 }, layer: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }, selected: { backgroundColor: '#44345d' }, layerName: { color: 'white', fontSize: 12, flex: 1 }, meta: { color: '#c4c1cd', fontSize: 11 }, inspector: { gap: 6 }, controls: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 5 }, action: { paddingHorizontal: 10, paddingVertical: 7, backgroundColor: '#343047', borderRadius: 7 }, actionText: { color: '#f0eaff', fontSize: 11, fontWeight: '700' } });
