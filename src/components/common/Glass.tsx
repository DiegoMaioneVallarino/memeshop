/**
 * Fondo de menú: gris oscuro translúcido con desenfoque de lo que hay detrás (backdrop blur).
 * iOS usa el desenfoque nativo; en Android, el método «dimezisBlurView» de expo-blur.
 * Si un dispositivo no puede desenfocar, queda el gris translúcido, que sigue siendo legible.
 */
import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';

export function Glass({ style, children, intensity = 45, pointerEvents }: { style?: StyleProp<ViewStyle>; children?: React.ReactNode; intensity?: number; pointerEvents?: 'box-none' | 'none' | 'box-only' | 'auto' }) {
  return <View style={[s.root, style]} pointerEvents={pointerEvents}>
    <BlurView intensity={intensity} tint="dark" experimentalBlurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} />
    <View style={[StyleSheet.absoluteFill, s.tint]} pointerEvents="none" />
    {children}
  </View>;
}
const s = StyleSheet.create({
  root: { overflow: 'hidden', backgroundColor: 'transparent' },
  tint: { backgroundColor: 'rgba(22,22,22,0.58)' },
});
