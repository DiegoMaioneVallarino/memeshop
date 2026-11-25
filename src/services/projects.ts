/**
 * Proyectos en disco: UN archivo JSON por proyecto + un índice pequeño.
 *
 *   documentDirectory/memeshop-projects/index.json      [{id,name,updatedAt,thumbnail}]  (unos pocos KB)
 *   documentDirectory/memeshop-projects/<id>.json       {id,name,updatedAt,thumbnail,document}
 *
 * Antes todos los proyectos (con todos sus trazos) vivían en una sola clave de AsyncStorage. En Android cada
 * registro de AsyncStorage tiene un límite de ~2 MB: al pasarlo, la lectura fallaba y desaparecían TODOS los
 * proyectos a la vez. Ahora cada proyecto se lee y escribe por separado y un proyecto dañado no afecta a los demás.
 *
 * Escrituras atómicas: se escribe en <archivo>.tmp y luego se mueve encima del original, para que un cierre
 * a mitad de un guardado no deje un JSON cortado. Todas las escrituras pasan por una cola (sin carreras entre
 * el autoguardado y "volver al inicio").
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import type { EditorDocument } from '../types/editor';
import { materializeMasks } from './maskStore';

const LEGACY_KEY = 'memeshop.projects.v1';
const ASSETS_DIR = 'memeshop-assets/';
const PROJECTS_DIR = 'memeshop-projects/';

export type ProjectMeta = { id: string; name: string; updatedAt: number; thumbnail?: string };
export type SavedProject = ProjectMeta & { document: EditorDocument };

const projectsRoot = () => FileSystem.documentDirectory + PROJECTS_DIR;
const indexPath = () => projectsRoot() + 'index.json';
const safeId = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, '_');
const projectPath = (id: string) => projectsRoot() + safeId(id) + '.json';
const metaOf = (p: ProjectMeta): ProjectMeta => ({ id: p.id, name: p.name, updatedAt: p.updatedAt, thumbnail: p.thumbnail });
const byRecent = (a: ProjectMeta, b: ProjectMeta) => b.updatedAt - a.updatedAt;

// ---- cola de escritura -------------------------------------------------------------------------------------
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job, job);
  queue = run.catch(() => undefined);
  return run;
}

async function ensureDir() {
  const dir = projectsRoot();
  if (!(await FileSystem.getInfoAsync(dir)).exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
}
async function writeAtomic(path: string, content: string) {
  const tmp = path + '.tmp';
  await FileSystem.writeAsStringAsync(tmp, content);
  await FileSystem.deleteAsync(path, { idempotent: true });
  await FileSystem.moveAsync({ from: tmp, to: path });
}
async function readJson<T>(path: string): Promise<T | null> {
  let target = path;
  if (!(await FileSystem.getInfoAsync(path)).exists) {
    // La app se cerró entre borrar el original y mover el .tmp: el .tmp ya está completo.
    if (!(await FileSystem.getInfoAsync(path + '.tmp')).exists) return null;
    target = path + '.tmp';
  }
  return JSON.parse(await FileSystem.readAsStringAsync(target)) as T;
}

// ---- índice -----------------------------------------------------------------------------------------------
async function readIndex(): Promise<ProjectMeta[] | null> {
  try { const v = await readJson<ProjectMeta[]>(indexPath()); return Array.isArray(v) ? v : null; }
  catch { return null; }
}
async function writeIndex(items: ProjectMeta[]) {
  await ensureDir();
  await writeAtomic(indexPath(), JSON.stringify([...items].sort(byRecent)));
}
/** Si el índice falta o está dañado se reconstruye leyendo los archivos de proyecto. */
async function rebuildIndex(): Promise<ProjectMeta[]> {
  await ensureDir();
  const items: ProjectMeta[] = [];
  for (const name of await FileSystem.readDirectoryAsync(projectsRoot())) {
    if (!name.endsWith('.json') || name === 'index.json') continue;
    try { const p = await readJson<SavedProject>(projectsRoot() + name); if (p?.id) items.push(metaOf(p)); }
    catch (e) { console.warn('Proyecto ilegible, se omite del índice:', name, e); }
  }
  await writeIndex(items);
  return items.sort(byRecent);
}

// ---- API pública --------------------------------------------------------------------------------------------
/** Solo metadatos (rápido): la pantalla de inicio no necesita cargar los documentos. */
export async function listProjects(): Promise<ProjectMeta[]> {
  try {
    const index = await readIndex();
    return index ? index.sort(byRecent) : await serial(rebuildIndex);
  } catch (e) { console.warn('listProjects', e); return []; }
}

export async function loadProject(id: string): Promise<SavedProject | null> {
  try { return await readJson<SavedProject>(projectPath(id)); }
  catch (e) { console.warn('loadProject', id, e); return null; }
}

export function persistProject(input: SavedProject): Promise<void> {
  return serial(async () => {
    // Las máscaras que solo viven en memoria se escriben aquí (una vez) dentro de memeshop-assets/.
    const project: SavedProject = { ...input, document: await materializeMasks(input.document) };
    await ensureDir();
    await writeAtomic(projectPath(project.id), JSON.stringify(project));
    const index = (await readIndex()) ?? (await rebuildIndex());
    await writeIndex([metaOf(project), ...index.filter(p => p.id !== project.id)]);
  });
}

export function deleteProject(id: string): Promise<void> {
  return serial(async () => {
    await FileSystem.deleteAsync(projectPath(id), { idempotent: true });
    const index = (await readIndex()) ?? (await rebuildIndex());
    await writeIndex(index.filter(p => p.id !== id));
  });
}

/** Recorre todos los proyectos. Si alguno no se puede leer, lanza: quien llama decide no borrar nada. */
async function allProjectsStrict(): Promise<SavedProject[]> {
  await ensureDir();
  const out: SavedProject[] = [];
  for (const name of await FileSystem.readDirectoryAsync(projectsRoot())) {
    if (!name.endsWith('.json') || name === 'index.json') continue;
    const p = await readJson<SavedProject>(projectsRoot() + name);
    if (p) out.push(p);
  }
  return out;
}

/**
 * Pasa los proyectos de la clave antigua de AsyncStorage a archivos. Se ejecuta en cada arranque; si no hay
 * clave antigua no hace nada. La clave solo se borra cuando TODOS los proyectos quedaron escritos en disco.
 * Si la clave ya superaba el límite de Android y no se puede leer, se deja intacta (no hay nada que perder).
 */
export function migrateLegacyProjects(): Promise<number> {
  return serial(async () => {
    let raw: string | null;
    try { raw = await AsyncStorage.getItem(LEGACY_KEY); }
    catch (e) { console.warn('No se pudo leer la clave antigua de proyectos:', e); return 0; }
    if (!raw) return 0;
    let legacy: SavedProject[];
    try { legacy = JSON.parse(raw); } catch (e) { console.warn('Clave antigua dañada; se conserva sin tocar.', e); return 0; }
    if (!Array.isArray(legacy)) return 0;
    await ensureDir();
    const index = (await readIndex()) ?? [];
    const metas = new Map(index.map(m => [m.id, m]));
    for (const p of legacy) {
      if (!p?.id || !p.document) continue;
      const existing = metas.get(p.id);
      if (existing && existing.updatedAt >= p.updatedAt) continue; // la versión en disco es más nueva
      await writeAtomic(projectPath(p.id), JSON.stringify(p));
      metas.set(p.id, metaOf(p));
    }
    await writeIndex([...metas.values()]);
    await AsyncStorage.removeItem(LEGACY_KEY);
    return legacy.length;
  });
}

// Keeps the original extension (png/webp/jpg) instead of forcing .png on everything.
export async function durableImage(uri: string): Promise<string> {
  const root = FileSystem.documentDirectory + ASSETS_DIR;
  await FileSystem.makeDirectoryAsync(root, { intermediates: true });
  const ext = (uri.split('?')[0].match(/\.(png|webp|jpe?g)$/i)?.[1] || 'png').toLowerCase();
  const path = root + Date.now() + '-' + Math.random().toString(36).slice(2) + '.' + ext;
  await FileSystem.copyAsync({ from: uri, to: path });
  return path;
}
const baseName = (uri: string) => uri.split('?')[0].split('/').pop() || uri;

/**
 * Deletes files in memeshop-assets that no saved project references (old pre-crop images, deleted projects).
 * Safety rules: compares by file name (the absolute path can change on iOS), aborts if ANY project can't be
 * read (otherwise a damaged file would make us delete its images), and never touches files younger than `graceSeconds`.
 * Call it only when the editor's undo history is no longer reachable (going home / deleting a project).
 */
export function pruneAssets(graceSeconds = 30): Promise<number> {
  return serial(async () => {
    try {
      const dir = FileSystem.documentDirectory + ASSETS_DIR;
      if (!(await FileSystem.getInfoAsync(dir)).exists) return 0;
      const projects = await allProjectsStrict();
      const keep = new Set<string>();
      for (const p of projects) {
        if (p.thumbnail) keep.add(baseName(p.thumbnail));
        for (const l of p.document.layers) if (l.type === 'image') { keep.add(baseName(l.uri)); if (l.magicMaskUri) keep.add(baseName(l.magicMaskUri)); }
      }
      let removed = 0;
      for (const name of await FileSystem.readDirectoryAsync(dir)) {
        if (keep.has(name)) continue;
        const info = await FileSystem.getInfoAsync(dir + name);
        const modified = 'modificationTime' in info ? (info.modificationTime as number | undefined) : undefined;
        if (!info.exists || modified === undefined || Date.now() / 1000 - modified < graceSeconds) continue;
        await FileSystem.deleteAsync(dir + name, { idempotent: true }); removed++;
      }
      return removed;
    } catch (e) { console.warn('pruneAssets (no se borró nada)', e); return 0; }
  });
}

/**
 * Projects created before stickers were copied into the project still point at the sticker library file.
 * Copy those files into the project's own assets so deleting the sticker from the library can't break them.
 */
export async function detachLibraryAssets(doc: EditorDocument): Promise<{ document: EditorDocument; changed: boolean }> {
  const copies = new Map<string, string>(); let changed = false;
  const layers: EditorDocument['layers'] = [];
  for (const l of doc.layers) {
    if (l.type === 'image' && l.uri.includes('/stickers/')) {
      try {
        let next = copies.get(l.uri);
        if (!next) {
          if (!(await FileSystem.getInfoAsync(l.uri)).exists) { layers.push(l); continue; }
          next = await durableImage(l.uri); copies.set(l.uri, next);
        }
        layers.push({ ...l, uri: next }); changed = true; continue;
      } catch (e) { console.warn('detachLibraryAssets', e); }
    }
    layers.push(l);
  }
  return { document: changed ? { ...doc, layers } : doc, changed };
}

/**
 * Versiones anteriores escribían cada máscara de la varita en la RAÍZ de documentDirectory (memeshop-wand-*.png)
 * y pruneAssets() nunca las veía. Las que un proyecto todavía usa se copian a memeshop-assets/; el resto se borra.
 * Se ejecuta al arrancar, DESPUÉS de migrateLegacyProjects(). Si algo falla no borra nada.
 */
export function migrateLegacyMasks(): Promise<void> {
  return serial(async () => {
    try {
      const root = FileSystem.documentDirectory; if (!root) return;
      const legacy = (await FileSystem.readDirectoryAsync(root)).filter(n => /^memeshop-wand-.*\.png$/.test(n));
      if (!legacy.length) return;
      const names = new Set(legacy);
      for (const p of await allProjectsStrict()) { // si un proyecto no se puede leer, lanza y no se borra nada
        let changed = false;
        for (const l of p.document.layers) {
          if (l.type !== 'image' || !l.magicMaskUri) continue;
          const name = baseName(l.magicMaskUri);
          if (!names.has(name)) continue;
          l.magicMaskUri = await durableImage(root + name); changed = true;
        }
        if (changed) await writeAtomic(projectPath(p.id), JSON.stringify(p));
      }
      for (const n of legacy) await FileSystem.deleteAsync(root + n, { idempotent: true });
    } catch (e) { console.warn('migrateLegacyMasks', e); }
  });
}

// ---- miniaturas, renombrar, duplicar -------------------------------------------------------------------------
/** Guarda una miniatura JPEG (base64) en memeshop-assets/. pruneAssets() borra las que ya no usa ningún proyecto. */
export async function writeThumbnail(base64: string): Promise<string> {
  const root = FileSystem.documentDirectory + ASSETS_DIR;
  await FileSystem.makeDirectoryAsync(root, { intermediates: true });
  const path = `${root}thumb-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
  await FileSystem.writeAsStringAsync(path, base64, { encoding: FileSystem.EncodingType.Base64 });
  return path;
}

export async function renameProject(id: string, name: string): Promise<void> {
  const p = await loadProject(id);
  if (!p) throw new Error('No se encontró el proyecto.');
  await persistProject({ ...p, name: name.trim() || p.name, updatedAt: Date.now() });
}

/** Copia el documento con otro id. Las imágenes se comparten: pruneAssets solo borra lo que nadie referencia. */
export async function duplicateProject(id: string): Promise<ProjectMeta> {
  const p = await loadProject(id);
  if (!p) throw new Error('No se encontró el proyecto.');
  const copy: SavedProject = { ...p, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: `${p.name} (copia)`, updatedAt: Date.now() };
  await persistProject(copy);
  return metaOf(copy);
}
