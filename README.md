# Photo Studio v0.2 — motor de capas

Este ZIP contiene `App.tsx` y `src/` para reemplazar la v0.1 dentro del proyecto Expo blank-typescript.

## Instalación

```bash
npx create-expo-app@latest photo-studio --template blank-typescript
cd photo-studio
npx expo install @shopify/react-native-skia react-native-gesture-handler react-native-reanimated react-native-worklets expo-image-picker expo-media-library expo-file-system expo-dev-client
npm install zustand
npx expo run:android
```

Copia `App.tsx` y `src/` del ZIP a la raíz del proyecto. Si ya tienes v0.1, sustituye esos archivos.

## Funciones

- Documento con dimensiones basadas en la primera imagen.
- Capas de imagen y rectángulo con orden de apilamiento.
- Seleccionar, ocultar, duplicar, eliminar y subir/bajar capas.
- Posición, tamaño, rotación y opacidad independientes mediante botones del inspector.
- Zoom, desplazamiento y rotación de la vista mediante gestos.
- Exportación PNG de la vista del canvas a la galería.

## Limitaciones

- La exportación sigue siendo una captura de pantalla del canvas, no exportación de documento a resolución original.
- Las transformaciones de capas se hacen desde el inspector; el canvas todavía no tiene manipulación directa por gestos de cada capa.
- No hay historial de deshacer/rehacer, texto, máscaras ni persistencia de proyectos.
- Los archivos importados se referencian por URI local; pueden dejar de estar disponibles después de limpiar la caché.
- No se ejecutaron compilaciones Android/iOS aquí. Podrían requerirse ajustes según las versiones de Expo/Skia.
- "Vista 1:1" restablece las transformaciones de vista a su ajuste inicial; no representa píxeles 1:1.

## Commit sugerido

`feat(editor): add layer stack and independent layer transforms`
