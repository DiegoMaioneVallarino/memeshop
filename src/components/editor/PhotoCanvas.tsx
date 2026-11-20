import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Canvas, Group, Image as SkiaImage, Rect, useImage } from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSharedValue } from 'react-native-reanimated';
import type { EditorDocument, EditorLayer, ImageLayer } from '../../types/editor';

export type PhotoCanvasHandle = { snapshotBase64: () => string | null; reset: () => void };
function ImageContent({ layer }: { layer: ImageLayer }) {
  const image = useImage(layer.uri);
  if (!image) return null;
  return <SkiaImage image={image} x={0} y={0} width={layer.width} height={layer.height} fit="fill" />;
}
function LayerContent({ layer }: { layer: EditorLayer }) {
  if (!layer.visible) return null;
  return (
    <Group opacity={layer.opacity} transform={[{ translateX: layer.x }, { translateY: layer.y },
      { translateX: layer.width / 2 }, { translateY: layer.height / 2 },
      { rotate: layer.rotation }, { translateX: -layer.width / 2 }, { translateY: -layer.height / 2 }]}>
      {layer.type === 'image' ? <ImageContent layer={layer} /> : <Rect x={0} y={0} width={layer.width} height={layer.height} color={layer.color} />}
    </Group>
  );
}
type Props = { document: EditorDocument };
export const PhotoCanvas = forwardRef<PhotoCanvasHandle, Props>(function PhotoCanvas({ document }, ref) {
  const canvas = useRef<React.ElementRef<typeof Canvas>>(null);
  const [size, setSize] = useState({ width: 1, height: 1 });
  const scale = useSharedValue(1), savedScale = useSharedValue(1);
  const translateX = useSharedValue(0), translateY = useSharedValue(0);
  const savedX = useSharedValue(0), savedY = useSharedValue(0);
  const rotation = useSharedValue(0), savedRotation = useSharedValue(0);
  const reset = () => {
    scale.value = savedScale.value = 1;
    translateX.value = savedX.value = 0;
    translateY.value = savedY.value = 0;
    rotation.value = savedRotation.value = 0;
  };
  useImperativeHandle(ref, () => ({ snapshotBase64: () => canvas.current?.makeImageSnapshot()?.encodeToBase64() ?? null, reset }));
  const pan = Gesture.Pan().onUpdate((e) => { translateX.value = savedX.value + e.translationX; translateY.value = savedY.value + e.translationY; })
    .onEnd(() => { savedX.value = translateX.value; savedY.value = translateY.value; });
  const pinch = Gesture.Pinch().onUpdate((e) => { scale.value = Math.max(.2, Math.min(12, savedScale.value * e.scale)); })
    .onEnd(() => { savedScale.value = scale.value; });
  const rotate = Gesture.Rotation().onUpdate((e) => { rotation.value = savedRotation.value + e.rotation; })
    .onEnd(() => { savedRotation.value = rotation.value; });
  const fit = Math.min(size.width / document.width, size.height / document.height);
  const x = (size.width - document.width * fit) / 2;
  const y = (size.height - document.height * fit) / 2;
  return <GestureDetector gesture={Gesture.Simultaneous(pan, pinch, rotate)}>
    <View style={styles.root} onLayout={(e) => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}>
      <Canvas ref={canvas} style={StyleSheet.absoluteFill}>
        <Group origin={{ x: size.width / 2, y: size.height / 2 }} transform={[{ translateX }, { translateY }, { scale }, { rotate: rotation }]}>
          <Group transform={[{ translateX: x }, { translateY: y }, { scale: fit }]}>
            <Rect x={0} y={0} width={document.width} height={document.height} color="#ffffff" />
            {document.layers.map((layer) => <LayerContent key={layer.id} layer={layer} />)}
          </Group>
        </Group>
      </Canvas>
    </View>
  </GestureDetector>;
});
const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: '#17191f', overflow: 'hidden' } });
