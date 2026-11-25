import React from 'react';
import { View } from 'react-native';
import { Help, MiniButton, Row, ValueSlider } from '../../components/common/controls';
import { useEditorStore } from '../../store/useEditorStore';
import { useSelectedLayer } from '../useSelected';

export function TransformPanel() {
  const layer = useSelectedLayer();
  const doc = useEditorStore(s => s.document);
  const update = useEditorStore(s => s.update), move = useEditorStore(s => s.move);
  const duplicate = useEditorStore(s => s.duplicate), remove = useEditorStore(s => s.remove);
  if (!layer || !doc) return <Help>Selecciona una capa para transformarla.</Help>;
  const nudge = (dx: number, dy: number) => update(layer.id, { x: layer.x + doc.width * .025 * dx, y: layer.y + doc.height * .025 * dy });
  const scale = (k: number) => update(layer.id, {
    width: layer.width * k, height: layer.height * k,
    x: layer.x + layer.width * (1 - k) / 2, y: layer.y + layer.height * (1 - k) / 2, // escala desde el centro
  });
  return <View style={{ gap: 10, paddingBottom: 8 }}>
    <Row>
      <MiniButton label="←" onPress={() => nudge(-1, 0)} /><MiniButton label="→" onPress={() => nudge(1, 0)} />
      <MiniButton label="↑" onPress={() => nudge(0, -1)} /><MiniButton label="↓" onPress={() => nudge(0, 1)} />
      <MiniButton label="− tamaño" onPress={() => scale(.9)} /><MiniButton label="+ tamaño" onPress={() => scale(1.1)} />
    </Row>
    <ValueSlider label="Rotación" value={Math.round(layer.rotation * 180 / Math.PI)} min={-180} max={180}
      onChange={v => update(layer.id, { rotation: v * Math.PI / 180 })} format={v => `${Math.round(v)}°`} />
    <ValueSlider label="Opacidad" value={Math.round(layer.opacity * 100)} min={0} max={100}
      onChange={v => update(layer.id, { opacity: v / 100 })} format={v => `${Math.round(v)}%`} />
    <Row>
      <MiniButton label="Subir" onPress={() => move(layer.id, 1)} /><MiniButton label="Bajar" onPress={() => move(layer.id, -1)} />
      <MiniButton label="Duplicar" onPress={() => duplicate(layer.id)} /><MiniButton label="Eliminar" danger onPress={() => remove(layer.id)} />
    </Row>
  </View>;
}
