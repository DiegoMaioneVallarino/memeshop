# Photo Studio v0.1 — React Native + Skia

Este paquete contiene `src/` y `App.tsx` para un proyecto Expo **blank-typescript**.

## Crear y configurar

```bash
npx create-expo-app@latest photo-studio --template blank-typescript
cd photo-studio
npx expo install @shopify/react-native-skia react-native-gesture-handler react-native-reanimated react-native-worklets expo-image-picker expo-media-library expo-file-system expo-dev-client
npm install zustand
```

Copia `src/` y `App.tsx` a la raíz del proyecto, sustituyendo el `App.tsx` inicial.

Para desarrollo nativo:

```bash
npx expo run:android
```

Para iOS se requiere macOS o EAS Build.

## Funciones

- Importar imágenes de la galería.
- Canvas Skia con zoom, arrastre y rotación multitáctil.
- Restablecer vista.
- Exportar una **captura de la vista del canvas** a la galería.

## Límites explícitos de esta versión

- La exportación es a resolución del canvas en pantalla, **no** a resolución original.
- No incluye capas, máscaras, historial ni persistencia de proyectos todavía.
- El zoom se centra en el lienzo, no en el punto exacto entre los dedos.
- No se han ejecutado compilaciones Android/iOS en este entorno: puede requerir ajustes según la versión de Expo/Skia instalada.
