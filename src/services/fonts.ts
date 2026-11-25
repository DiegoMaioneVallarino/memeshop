/**
 * Fuentes incluidas en la app (licencia SIL OFL, ver src/assets/fonts/licenses).
 *
 * Antes el texto pedía 'Impact', 'Helvetica' o 'Georgia' al sistema. En Android esas fuentes no existen
 * y Skia ponía otra en silencio, así que un meme se veía distinto en cada teléfono. Ahora las fuentes viajan
 * con la app y se registran una sola vez en un TypefaceFontProvider que comparten el lienzo y la exportación.
 *
 * Los emojis y los alfabetos que estas fuentes no cubren los resuelve el sistema (fallback de Skia Paragraph).
 */
import { Image, Platform } from 'react-native';
import { Skia } from '@shopify/react-native-skia';
import type { SkTypefaceFontProvider } from '@shopify/react-native-skia';

export type FontOption = { id: string; label: string };

/** Lo que ve el usuario en el panel de texto. 'System' = fuente del sistema (Roboto / San Francisco). */
export const FONT_OPTIONS: FontOption[] = [
  { id: 'System', label: 'Sistema' },
  { id: 'Anton', label: 'Anton' },
  { id: 'Archivo Black', label: 'Archivo Black' },
  { id: 'Montserrat', label: 'Montserrat' },
  { id: 'Gelasio', label: 'Gelasio' },
  { id: 'Crimson Text', label: 'Crimson' },
  { id: 'Anonymous Pro', label: 'Mono' },
  { id: 'Comic Relief', label: 'Comic' },
];

const BUNDLED: Record<string, number> = {
  'Anton': require('../assets/fonts/Anton-Regular.ttf'),
  'Archivo Black': require('../assets/fonts/ArchivoBlack-Regular.ttf'),
  'Montserrat': require('../assets/fonts/Montserrat-Variable.ttf'),
  'Gelasio': require('../assets/fonts/Gelasio-Variable.ttf'),
  'Crimson Text': require('../assets/fonts/CrimsonText-Regular.ttf'),
  'Anonymous Pro': require('../assets/fonts/AnonymousPro-Regular.ttf'),
  'Comic Relief': require('../assets/fonts/ComicRelief-Regular.ttf'),
};

/** Proyectos guardados con los nombres de fuente anteriores siguen abriendo con un equivalente incluido. */
const LEGACY: Record<string, string> = {
  Impact: 'Anton',
  Helvetica: 'Montserrat',
  Arial: 'Montserrat',
  Georgia: 'Gelasio',
  Times: 'Crimson Text',
  Courier: 'Anonymous Pro',
};

const SYSTEM_FAMILIES = Platform.select({ ios: ['Helvetica Neue'], default: ['sans-serif'] }) as string[];

/** Familias para Skia Paragraph. Siempre termina en la del sistema para que el fallback tenga un punto de partida. */
export function fontFamiliesFor(id?: string): string[] {
  const resolved = id ? LEGACY[id] ?? id : 'System';
  if (resolved === 'System' || !BUNDLED[resolved]) return SYSTEM_FAMILIES;
  return [resolved, ...SYSTEM_FAMILIES];
}

let provider: SkTypefaceFontProvider | null = null;
let loading: Promise<SkTypefaceFontProvider | null> | null = null;
let version = 0;
const listeners = new Set<() => void>();

export const getFontProvider = () => provider;
export const getFontVersion = () => version;
export function subscribeFonts(cb: () => void) { listeners.add(cb); return () => { listeners.delete(cb); }; }

/** Carga y registra todas las fuentes. Es idempotente: se puede llamar en el arranque y antes de exportar. */
export function ensureFonts(): Promise<SkTypefaceFontProvider | null> {
  if (provider) return Promise.resolve(provider);
  if (loading) return loading;
  loading = (async () => {
    const next = Skia.TypefaceFontProvider.Make();
    let count = 0;
    await Promise.all(Object.entries(BUNDLED).map(async ([family, asset]) => {
      try {
        const uri = Image.resolveAssetSource(asset).uri;
        const data = await Skia.Data.fromURI(uri);
        const face = Skia.Typeface.MakeFreeTypeFaceFromData(data);
        if (!face) throw new Error('fuente ilegible');
        next.registerFont(face, family);
        count++;
      } catch (e) { console.warn(`Fuente "${family}" no cargada:`, e); }
    }));
    if (!count) { loading = null; return null; } // se reintenta en la próxima llamada
    provider = next;
    version++;
    listeners.forEach(l => l());
    return provider;
  })();
  return loading;
}
