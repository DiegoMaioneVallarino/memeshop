/**
 * Biblioteca de plantillas del usuario.
 *
 *   documentDirectory/memeshop-templates/index.json        [{id,name,kind,thumbnail,…}]
 *   documentDirectory/memeshop-templates/<id>.json         plantilla completa (con documento)
 *   documentDirectory/memeshop-templates/assets/           imágenes, máscaras y miniaturas de las plantillas
 *
 * Las imágenes viven en una carpeta PROPIA: pruneAssets() solo limpia memeshop-assets/, así que borrar un proyecto
 * nunca rompe una plantilla. Al usar una plantilla sus imágenes se copian al proyecto, así que borrar la plantilla
 * tampoco rompe los proyectos que la usaron.
 */
import * as FileSystem from 'expo-file-system/legacy';
import type { EditorDocument, EditorLayer } from '../types/editor';
import { materializeMasks } from './maskStore';

export type TemplateKind = 'layout' | 'overlay';
export type TemplateMeta = { id: string; name: string; kind: TemplateKind; createdAt: number; updatedAt: number; thumbnail?: string; builtIn?: boolean };
export type MemeTemplate = TemplateMeta & { document: EditorDocument };

const root = () => FileSystem.documentDirectory + 'memeshop-templates/';
const assetsDir = () => root() + 'assets/';
const indexPath = () => root() + 'index.json';
const pathOf = (id: string) => root() + id.replace(/[^a-zA-Z0-9_-]/g, '_') + '.json';
const metaOf = (t: TemplateMeta): TemplateMeta => ({ id: t.id, name: t.name, kind: t.kind, createdAt: t.createdAt, updatedAt: t.updatedAt, thumbnail: t.thumbnail });

let queue: Promise<unknown> = Promise.resolve();
function serial<T>(job: () => Promise<T>): Promise<T> { const run = queue.then(job, job); queue = run.catch(() => undefined); return run; }

async function ensureDirs() {
  for (const d of [root(), assetsDir()]) if (!(await FileSystem.getInfoAsync(d)).exists) await FileSystem.makeDirectoryAsync(d, { intermediates: true });
}
async function writeAtomic(path: string, content: string) {
  const tmp = path + '.tmp';
  await FileSystem.writeAsStringAsync(tmp, content);
  await FileSystem.deleteAsync(path, { idempotent: true });
  await FileSystem.moveAsync({ from: tmp, to: path });
}
async function readIndex(): Promise<TemplateMeta[]> {
  try {
    const p = indexPath();
    const target = (await FileSystem.getInfoAsync(p)).exists ? p : (await FileSystem.getInfoAsync(p + '.tmp')).exists ? p + '.tmp' : null;
    if (!target) return [];
    const v = JSON.parse(await FileSystem.readAsStringAsync(target));
    return Array.isArray(v) ? v : [];
  } catch (e) { console.warn('Índice de plantillas ilegible:', e); return []; }
}
async function writeIndex(items: TemplateMeta[]) { await ensureDirs(); await writeAtomic(indexPath(), JSON.stringify([...items].sort((a, b) => b.updatedAt - a.updatedAt))); }

async function copyIntoTemplate(uri: string): Promise<string> {
  const ext = (uri.split('?')[0].match(/\.(png|webp|jpe?g)$/i)?.[1] || 'png').toLowerCase();
  const to = `${assetsDir()}${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  await FileSystem.copyAsync({ from: uri, to });
  return to;
}

export const listTemplates = () => readIndex();

export async function loadTemplate(id: string): Promise<MemeTemplate | null> {
  try {
    const p = pathOf(id);
    const target = (await FileSystem.getInfoAsync(p)).exists ? p : (await FileSystem.getInfoAsync(p + '.tmp')).exists ? p + '.tmp' : null;
    return target ? JSON.parse(await FileSystem.readAsStringAsync(target)) : null;
  } catch (e) { console.warn('loadTemplate', id, e); return null; }
}

/**
 * Guarda el documento como plantilla.
 * - layout: el diseño completo (fotos incluidas).
 * - overlay: todo menos la capa de abajo, para ponerlo encima de cualquier foto (textos, stickers, marcos).
 * `thumbnailBase64` es un JPEG ya renderizado por el lienzo.
 */
export function saveTemplate(input: { name: string; kind: TemplateKind; document: EditorDocument; thumbnailBase64?: string }): Promise<TemplateMeta> {
  return serial(async () => {
    await ensureDirs();
    let doc = await materializeMasks(input.document);
    if (input.kind === 'overlay' && doc.layers.length > 1) doc = { ...doc, layers: doc.layers.slice(1) };
    const layers: EditorLayer[] = [];
    for (const l of doc.layers) {
      if (l.type !== 'image') { layers.push(l); continue; }
      const uri = await copyIntoTemplate(l.uri);
      const magicMaskUri = l.magicMaskUri ? await copyIntoTemplate(l.magicMaskUri) : undefined;
      layers.push({ ...l, uri, magicMaskUri });
    }
    let thumbnail: string | undefined;
    if (input.thumbnailBase64) {
      thumbnail = `${assetsDir()}thumb-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
      await FileSystem.writeAsStringAsync(thumbnail, input.thumbnailBase64, { encoding: FileSystem.EncodingType.Base64 });
    }
    const now = Date.now();
    const t: MemeTemplate = { id: `tpl-${now}-${Math.random().toString(36).slice(2, 8)}`, name: input.name.trim() || 'Mi plantilla', kind: input.kind,
      createdAt: now, updatedAt: now, thumbnail, document: { ...doc, layers, selectedId: null } };
    await writeAtomic(pathOf(t.id), JSON.stringify(t));
    await writeIndex([metaOf(t), ...(await readIndex()).filter(m => m.id !== t.id)]);
    return metaOf(t);
  });
}

export function renameTemplate(id: string, name: string): Promise<void> {
  return serial(async () => {
    const t = await loadTemplate(id);
    if (!t) throw new Error('No se encontró la plantilla.');
    const next = { ...t, name: name.trim() || t.name, updatedAt: Date.now() };
    await writeAtomic(pathOf(id), JSON.stringify(next));
    await writeIndex((await readIndex()).map(m => (m.id === id ? metaOf(next) : m)));
  });
}

/** Borra la plantilla y SUS archivos (los proyectos que la usaron tienen copias propias). */
export function deleteTemplate(id: string): Promise<void> {
  return serial(async () => {
    const t = await loadTemplate(id);
    const files = new Set<string>();
    if (t?.thumbnail) files.add(t.thumbnail);
    for (const l of t?.document.layers ?? []) if (l.type === 'image') { files.add(l.uri); if (l.magicMaskUri) files.add(l.magicMaskUri); }
    for (const f of files) if (f.startsWith(assetsDir())) await FileSystem.deleteAsync(f, { idempotent: true });
    await FileSystem.deleteAsync(pathOf(id), { idempotent: true });
    await writeIndex((await readIndex()).filter(m => m.id !== id));
  });
}
