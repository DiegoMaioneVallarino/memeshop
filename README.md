# Photo Studio v0.5 — código fuente incremental

Partiendo de la v0.3, incorpora las funcionalidades de v0.4 (capas de pintura, pinceles y borrador) y v0.5 (ajustes no destructivos de brillo, contraste y saturación en capas de imagen).

## Instalación

Crea una app Expo blank-typescript, instala @shopify/react-native-skia, react-native-gesture-handler, react-native-reanimated, react-native-worklets, expo-image-picker, expo-media-library, expo-file-system, expo-dev-client y zustand. Sustituye `App.tsx` y `src/` con los archivos de este ZIP. Ejecuta `npx expo run:android`.

## Alcance y límites

- Pincel con puntos interpolados mediante segmentos lineales, color y tamaño; borrador con composición dstOut en capa aislada.
- Capas de pintura transformables y con historial de trazos (deshacer/rehacer).
- Ajustes de color por capa de imagen, sin modificar el archivo original.
- La exportación sigue siendo una captura de la vista, no una exportación a resolución original.
- No incluye persistencia de proyectos, suavizado avanzado, presión, máscaras de selección ni exportación profesional.
- La interacción simultánea de gestos, la compatibilidad de filtros y la compilación nativa requieren pruebas en dispositivos reales. Este paquete no se ha compilado en Android ni iOS.
