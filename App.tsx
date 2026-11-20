import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { EditorScreen } from './src/screens/EditorScreen';

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <EditorScreen />
    </GestureHandlerRootView>
  );
}
