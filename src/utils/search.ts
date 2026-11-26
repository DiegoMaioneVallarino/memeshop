/** Búsqueda local tolerante: sin distinguir mayúsculas ni acentos, por nombre y etiquetas. Módulo puro. */
export const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Convierte "gato, Reacción  #risa" en ['gato', 'reaccion', 'risa'] (sin repetidos ni vacíos). */
export function parseTags(input: string): string[] {
  const out: string[] = [];
  for (const raw of input.split(/[,#\n]+/)) {
    const t = normalize(raw).replace(/\s+/g, ' ');
    if (t && !out.includes(t)) out.push(t);
  }
  return out.slice(0, 20);
}

/** Todas las palabras de la búsqueda deben aparecer en el nombre o en alguna etiqueta. */
export function matchesQuery(item: { name: string; tags?: string[] }, query: string): boolean {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = [normalize(item.name), ...(item.tags ?? []).map(normalize)].join(' ');
  return words.every(w => hay.includes(w));
}
