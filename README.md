# Memeshop

Editor de fotos y memes por capas para Android e iOS (Expo + React Native Skia + Zustand).

## Instalación

```bash
npm install
npx expo install expo-sharing react-native-safe-area-context   # ajusta las versiones exactas a tu SDK
npx expo run:android                                           # o: npx expo run:ios
```

Requiere un build de desarrollo (`expo-dev-client`), no Expo Go: lo necesitan Skia y el módulo nativo `modules/subject-segmentation`.

| Comando | Qué hace |
|---|---|
| `npm test` | Pruebas unitarias con el ejecutor integrado de Node (requiere Node ≥ 22.6) |
| `npm run lint` | ESLint con la configuración de Expo |
| `npm run typecheck` | `tsc --noEmit` |

## Estructura

```
App.tsx                      Proveedores (gestos, zonas seguras) + Root
src/screens/
  Root.tsx                   Arranque, inicio, ciclo de vida del proyecto (autoguardado, miniatura, limpieza)
  HomeScreen.tsx             Portal de inicio: recientes, herramientas rápidas, plantillas, tamaños para redes
  ProjectsHome.tsx           «Mis proyectos»: búsqueda, pestañas, renombrar / duplicar / eliminar
  EditorScreen.tsx           Solo compone la interfaz del editor
src/store/
  useEditorStore.ts          Documento + historial (deshacer/rehacer, sesiones de edición)
  useUiStore.ts              Estado de la interfaz: herramienta abierta, pincel, varita, recorte, avisos
src/editor/
  actions.ts                 Abrir/aplicar/cancelar herramienta, importar, exportar, compartir, recortar, quitar fondo
  templateActions.ts         Usar/guardar plantillas, rellenar huecos de foto, tamaño y fondo del lienzo
src/templates/builtin.ts     Plantillas incluidas (generadas en código)
src/tools/
  registry.tsx               Herramienta → título + panel
  <herramienta>/…Panel.tsx   Un panel por herramienta (adjust, brush, canvas, crop, effects, shape, text, transform, wand, warp…)
  wand/wandController.ts     Lógica de la varita mágica
src/components/
  common/controls.tsx        ValueSlider, MiniButton, Swatches, Segmented: los únicos controles de la app
  common/overlays.tsx        PromptModal, ActionSheet y ToastBar (funcionan igual en Android e iOS)
  editor/                    Lienzo Skia, cabecera, barra, cajón de capas, biblioteca de stickers
src/services/                Proyectos, fuentes, importación, máscaras, segmentación
src/utils/                   Funciones puras (recorte, límites, lienzo, licuar, plantillas): probadas en tests/
tests/                       wandCore, recorte y límites, lienzo, comparar, plantillas, licuar, store del editor
```

**Añadir una herramienta:** crea `src/tools/<nombre>/<Nombre>Panel.tsx`, regístrala en `tools/registry.tsx` y añade su id al tipo `Tool` en `useUiStore.ts`. Si debe tener Aplicar/Cancelar, inclúyela en `EDIT_SESSION_TOOLS`.

**Cambiar una capa:** `update(id, patch)` está tipado. Si el cambio no corresponde a ningún tipo de capa (por ejemplo `fontSize` en una imagen), TypeScript lo marca. Ya no queda ningún `as any` en el proyecto.

## Cambios de la v0.10

- **Antes / después sobre el lienzo completo.** Sin herramienta abierta, el ojo muestra el lienzo entero tal como estaba al abrir o crear el proyecto. Con una herramienta abierta, el lienzo entero como estaba al abrirla.
- **Botón de capas flotante,** pegado a la derecha del lienzo (ya no está en la barra inferior).
- **Cajón de capas con Añadir** (imagen, texto, forma, pintura, sticker), **Duplicar** y **Eliminar**. Eliminar ofrece «Deshacer».
- **Filtros sin nada seleccionado:** las capas se combinan en una sola imagen y el filtro se aplica a todo el lienzo. Dentro de Efectos es parte de la sesión, así que «Cancelar» devuelve las capas separadas. Con un texto o una forma seleccionados, el panel indica que toques un espacio vacío.
- **Quitar fondo con revisión.** Tras detectar el sujeto, la imagen se ve sola sobre la cuadrícula de transparencia. Con Mover, Borrar y Restaurar (o la Goma de la cabecera) se corrige la selección antes de pulsar «Aplicar». «Cancelar» deja la imagen como estaba.
- **Error corregido:** en las imágenes, «Borrar» de la goma no borraba (pintaba alfa opaca sobre una máscara alfa). Ahora resta opacidad de verdad, y «Restaurar» la devuelve.
- **Aparición píxel a píxel:** cada foto aparece en bloques que se van afinando hasta quedar nítida, solo la primera vez que se carga en la sesión. No se repite al recortar ni al combinar capas.
- **Logo del inicio más grande.**

## Cambios de la v0.9

**Portal de inicio**
- Logo de Memeshop y «Crear», con el botón fijo «Comienza con una foto».
- **Proyectos recientes**, con «Ver todos» para abrir la lista completa (búsqueda, pestañas, renombrar, duplicar, eliminar).
- **Empieza con una herramienta:** Quitar fondo, Añadir texto, Licuar, Ajustes y Efectos. Eliges la foto y abre directo en esa herramienta.
- **Plantillas de memes** (las tuyas primero) y **Tamaños para redes**, que crean un proyecto nuevo con esa plantilla o ese lienzo.

**Márgenes seguros**
- La cabecera queda debajo de la barra de estado o la isla dinámica, con margen extra, y la barra inferior respeta el indicador de inicio. Las pantallas completas (plantillas, stickers, texto) también empiezan debajo.

**La cámara nunca se mueve sola**
- El lienzo tiene un tamaño fijo. Los paneles se superponen en una franja reservada abajo, y la imagen siempre se encaja por encima de ella.
- Abrir o cerrar paneles, aplicar efectos o cambiar de herramienta ya no mueve ni escala la imagen. El zoom y el desplazamiento que hagas con dos dedos se conservan.

**Licuar (Herramientas → Licuar)**
- Pinceles: Deformar (arrastrar), Girar ↻, Girar ↺, Reducir, Ampliar y Restaurar. Los cinco últimos actúan mientras mantienes el dedo.
- Tamaño (en pantalla: el mismo a cualquier zoom) e Intensidad. El círculo verde muestra el pincel bajo el dedo.
- Funciona con un campo de desplazamiento en GPU, sin límite de trazos: cada trazo encadena con el anterior. Cada trazo es un paso que se deshace con Cancelar, y se guarda en el proyecto.
- La máscara de quitar fondo se deforma junto con la imagen, y recortar conserva la deformación en su sitio.
- La antigua «Deformar · Liquify» pasó a llamarse **Distorsión** (remolino, inflar, ondas, malla).

**Ajustes de foto (pestañas Luz, Color y Detalle)**
- Luz: Exposición, Brillo, Contraste, Luces y Sombras.
- Color: Saturación, Intensidad, Temperatura y Tono.
- Detalle: Claridad, Nitidez, Viñeta, Grano y Desvanecer.
- Sliders de −100 a +100 y «Reiniciar» por pestaña. Los ajustes trabajan sin premultiplicar, así que los bordes transparentes no se oscurecen.

**Texto sin choques con el teclado**
- El teclado solo aparece al escribir. Al añadir un texto, o al tocar uno que ya está seleccionado, se abre el editor a pantalla completa: el texto queda centrado sobre el teclado, con ✕, alineación y ✓.
- El panel de texto (fuente, trazo, color, resaltador, sombra) ya no tiene campo de escritura, así que el teclado nunca lo tapa.
- Al confirmar, la caja se ajusta al texto nuevo y conserva su centro. Cancelar un texto recién creado lo quita sin dejar rastro.

**Arreglos**
- Antes, cada trazo de pincel, goma o deformación cerraba la sesión de la herramienta, así que «Cancelar» no revertía los trazos anteriores. Ahora todos los trazos forman parte de la sesión.

## Cambios de la v0.8

**Antes / después (botón de ojo en la cabecera)**
- Mantén pulsado el ojo. **Con una herramienta abierta** (efectos, ajustes, deformar, lienzo…) ves el lienzo como estaba al abrirla, es decir, sin el efecto que estás probando. **Sin herramienta abierta** ves la foto original: sin ajustes, filtros, glitch, sustituir color, deformación ni perspectiva. La composición, los recortes, las máscaras y los textos se mantienen.
- Al soltar vuelves al resultado. Mientras comparas aparece la etiqueta ANTES u ORIGINAL y el lienzo solo se puede mover y acercar.
- El botón se desactiva cuando no hay nada que comparar.

**Plantillas (botón «Plantillas» en la barra inferior)**
- **Incluidas:** 8 estructuras originales, sin imágenes de memes con derechos de autor. Son *Clásico arriba y abajo*, *Subtítulo de película*, *Título + foto*, *Esto no / Esto sí*, *Escalada en 4 pasos*, *Antes / Después*, *Expectativa vs realidad* y *Desmotivador*.
- **Dos tipos.** «Diseño» reemplaza el lienzo y se puede deshacer. «Sobre tu foto» añade textos encima de tu imagen, escalados a su tamaño.
- **Huecos de foto:** las plantillas de diseño traen marcos grises. Al tocar uno aparece «Poner foto» en la barra, y la foto elegida se recorta al centro para cubrir el hueco sin deformarse.
- **Mis plantillas:** «Guardar mi diseño como plantilla» guarda el lienzo como *Diseño completo* o *Sin la foto de fondo* (todo menos la capa de abajo). Cada plantilla se puede usar, renombrar y eliminar.
- **Almacenamiento:** las plantillas viven en `memeshop-templates/`, con sus imágenes aparte. Borrar un proyecto no las afecta, y borrar una plantilla no rompe los proyectos que la usaron, porque sus imágenes se copian al proyecto.
- Un proyecto nuevo puede empezar con «Usar una plantilla» o «Lienzo en blanco».

**Tamaño del lienzo (botón «Lienzo» en la barra inferior)**
- Tamaños de Instagram (1:1 y 4:5), Historias/Reels/TikTok, estado de WhatsApp, X/Twitter, Facebook, miniatura de YouTube, Pinterest y Reddit, más «Foto original».
- **Ajustar** deja todo visible con márgenes; **Rellenar** cubre el lienzo y puede recortar los lados. Textos, contornos, sombras, trazos de pintura y máscaras escalan con el contenido.
- Probar varios tamaños seguidos no deforma nada: cada cambio parte del lienzo que había al abrir el panel. «Cancelar» lo deshace todo.
- **Fondo del lienzo:** varios colores o transparente. Con transparente, el editor muestra una cuadrícula y la exportación es un PNG con transparencia.

**Código**
- `utils/canvas.ts` (tamaños y redimensionado), `utils/compare.ts` (vista original), `utils/templates.ts` (ids nuevos, recorte de huecos): son funciones puras, con pruebas.
- `templates/builtin.ts` (plantillas incluidas), `services/templates.ts` (biblioteca del usuario), `editor/templateActions.ts`.
- Store: `replaceDocument`, `replaceLayer` y `appendLayers`, cada una un paso de historial. `EditorDocument.background` y `ShapeLayer.placeholder`.
- 26 pruebas (antes 15).

## Cambios de la v0.7

**Para el usuario**
- **Miniaturas reales** en el inicio: se generan al volver al inicio y cuando la app pasa a segundo plano, solo si el documento cambió.
- **Pestañas que funcionan:** Recientes, Esta semana, A–Z, más una búsqueda por nombre.
- **Menú de proyecto** (botón ··· o mantener pulsado): Abrir, Renombrar, Duplicar, Eliminar con confirmación.
- **Formas editables:** color (incluidos los colores de la imagen), tipo (rectángulo, redondeado, elipse) y opacidad. Al seleccionar una forma aparece el botón «Forma» en la barra.
- Importar una imagen ya no abre una hoja «Imágenes» vacía, y avisa si la foto se redujo.
- **La ✕ de la capa** borra al soltar el dedo (no al tocar), se cancela si arrastras fuera y muestra «Deshacer» durante 4 segundos.
- Cerrar un panel con la ✕ ahora aplica el cambio. Antes dejaba el editor en modo Aplicar/Cancelar.
- En Recortar, el botón «Aplicar» de la cabecera ahora sí recorta.
- Ajustes, opacidad, rotación y los demás valores usan sliders en lugar de botones +/−.

**Código**
- `EditorScreen` pasó de 474 líneas y 39 `useState` a 141 líneas y ninguno. Cada herramienta tiene su panel en `src/tools/`.
- De 41 `as any` a 0, gracias a `LayerPatch` / `patchFor<T>()` en `types/editor.ts`.
- Una sola interfaz de capas (el cajón). Se eliminaron `LayersPanel.tsx`, `BrushControls.tsx` y `CropPanel.tsx`.
- Un solo slider: `ValueSlider`.
- El autoguardado escucha el store fuera de React: `Root` ya no se vuelve a renderizar con cada trazo.
- 15 pruebas unitarias, ESLint y `typecheck`.
- `react-native-safe-area-context` en lugar del `SafeAreaView` obsoleto de React Native.
- `app.json`: nombre «Memeshop», `userInterfaceStyle: dark` y fondo oscuro.

## Cambios de la v0.6
- Proyectos en archivos (un JSON por proyecto + índice), con migración automática desde AsyncStorage.
- Límite de 4096 px por imagen; las fotos opacas se guardan en JPEG.
- La cámara del lienzo usa valores compartidos de Reanimated; las capas están memorizadas.
- Texto con Skia Paragraph y 7 fuentes OFL incluidas (`src/assets/fonts/licenses`).
- Compartir con `expo-sharing` (funciona en Android).

## Pendiente conocido
- Este paquete no se ha compilado en un dispositivo. Pruébalo en Android e iOS reales.
- Los filtros muestran un ícono, no una vista previa de la foto.
- Exportación JPG/WebP con calidad ajustable.
- Redimensionar una imagen con los tiradores no escala sus trazos de goma (el cambio de lienzo sí lo hace). Esto ya pasaba antes de la v0.8.
