# Photo Studio v0.3 — edición directa de capas

Actualización incremental sobre v0.2. Copia `App.tsx` y `src/` a tu proyecto Expo.

## Dependencias

```bash
npx expo install @shopify/react-native-skia react-native-gesture-handler react-native-reanimated react-native-worklets expo-image-picker expo-media-library expo-file-system expo-dev-client
npm install zustand
npx expo run:android
```

## Novedades

- Modo **Editar capa**: tocar para seleccionar la capa superior bajo el dedo, arrastrar para moverla, pellizcar para escalarla y gesto de rotación para girarla.
- Modo **Mover vista**: pan, zoom y rotación del lienzo sin modificar las capas.
- Marco de selección con esquinas visibles.
- Hit testing de rectángulos rotados, respetando el orden y la visibilidad de las capas.
- Coordenadas de gestos convertidas a unidades del documento incluso cuando la vista está ampliada o girada.
- Deshacer/rehacer para las operaciones gestuales confirmadas (hasta 40 estados anteriores).
- Se mantienen panel de capas, importación, formas, inspector y exportación de previsualización de v0.2.

## Limitaciones conocidas

- Los gestos multitáctiles simultáneos de pellizco y rotación pueden competir entre sí; se recomienda hacerlos por separado.
- El historial registra transformaciones gestuales, pero todavía no registra todas las operaciones del inspector, creación y eliminación de capas.
- No se incluyen aún tiradores interactivos de escala/rotación, máscaras, pinceles ni guardado de proyectos.
- La exportación sigue siendo una captura de la vista, no un render a resolución original.
- No se ha compilado en dispositivos Android/iOS en este entorno. Las APIs exactas pueden variar según las versiones instaladas.

## Commit

```bash
git add .
git commit -m "feat(editor): enable direct layer gestures and undo redo"
```
