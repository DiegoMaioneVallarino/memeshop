import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Canvas, Group, Image as SkiaImage, useImage, type SkCanvas } from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSharedValue } from 'react-native-reanimated';
import type { PhotoAsset } from '../../types/editor';

export type PhotoCanvasHandle = {
  snapshotBase64: () => string | null;
  reset: () => void;
};

type Props = { photo: PhotoAsset };

export const PhotoCanvas = forwardRef<PhotoCanvasHandle, Props>(function PhotoCanvas({ photo }, ref) {
  const canvas = useRef<SkCanvas>(null);
  const image = useImage(photo.uri);
  const [size, setSize] = useState({ width: 1, height: 1 });
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);
  const rotation = useSharedValue(0);
  const savedRotation = useSharedValue(0);

  const reset = () => {
    scale.value = 1;
    savedScale.value = 1;
    translateX.value = 0;
    translateY.value = 0;
    savedX.value = 0;
    savedY.value = 0;
    rotation.value = 0;
    savedRotation.value = 0;
  };

  useImperativeHandle(ref, () => ({
    snapshotBase64: () => canvas.current?.makeImageSnapshot()?.encodeToBase64() ?? null,
    reset,
  }));

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      translateX.value = savedX.value + e.translationX;
      translateY.value = savedY.value + e.translationY;
    })
    .onEnd(() => {
      savedX.value = translateX.value;
      savedY.value = translateY.value;
    });

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.max(0.2, Math.min(12, savedScale.value * e.scale));
    })
    .onEnd(() => {
      savedScale.value = scale.value;
    });

  const rotate = Gesture.Rotation()
    .onUpdate((e) => {
      rotation.value = savedRotation.value + e.rotation;
    })
    .onEnd(() => {
      savedRotation.value = rotation.value;
    });

  const gesture = Gesture.Simultaneous(pan, pinch, rotate);
  const fit = Math.min(size.width / photo.width, size.height / photo.height);
  const width = photo.width * fit;
  const height = photo.height * fit;
  const x = (size.width - width) / 2;
  const y = (size.height - height) / 2;

  return (
    <GestureDetector gesture={gesture}>
      <View
        style={styles.root}
        onLayout={(e) => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
      >
        <Canvas ref={canvas} style={StyleSheet.absoluteFill}>
          {image && (
            <Group
              origin={{ x: size.width / 2, y: size.height / 2 }}
              transform={[
                { translateX },
                { translateY },
                { scale },
                { rotate: rotation },
              ]}
            >
              <SkiaImage image={image} x={x} y={y} width={width} height={height} fit="fill" />
            </Group>
          )}
        </Canvas>
      </View>
    </GestureDetector>
  );
});

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: '#17191f', overflow: 'hidden' } });
