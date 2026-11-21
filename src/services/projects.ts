import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import type { EditorDocument } from '../types/editor';
const KEY='memeshop.projects.v1';
const ASSETS_DIR='memeshop-assets/';
export type SavedProject={id:string;name:string;updatedAt:number;thumbnail?:string;document:EditorDocument};
export async function listProjects():Promise<SavedProject[]> {try {return JSON.parse(await AsyncStorage.getItem(KEY)||'[]');}catch{return [];}}
export async function persistProject(project:SavedProject){const projects=await listProjects();const next=[project,...projects.filter(p=>p.id!==project.id)].sort((a,b)=>b.updatedAt-a.updatedAt);await AsyncStorage.setItem(KEY,JSON.stringify(next));}
export async function deleteProject(id:string){await AsyncStorage.setItem(KEY,JSON.stringify((await listProjects()).filter(p=>p.id!==id)));}
// Keeps the original extension (png/webp/jpg) instead of forcing .png on everything.
export async function durableImage(uri:string):Promise<string>{
 const root=FileSystem.documentDirectory+ASSETS_DIR;
 await FileSystem.makeDirectoryAsync(root,{intermediates:true});
 const ext=(uri.split('?')[0].match(/\.(png|webp|jpe?g)$/i)?.[1]||'png').toLowerCase();
 const path=root+Date.now()+'-'+Math.random().toString(36).slice(2)+'.'+ext;
 await FileSystem.copyAsync({from:uri,to:path});return path;
}
const baseName=(uri:string)=>uri.split('?')[0].split('/').pop()||uri;
/**
 * Deletes files in memeshop-assets that no saved project references (old pre-crop images, deleted projects).
 * Safety rules: compares by file name (the absolute path can change on iOS), aborts if the project list can't be
 * read (otherwise an AsyncStorage hiccup would delete everything), and never touches files younger than `graceSeconds`.
 * Call it only when the editor's undo history is no longer reachable (going home / deleting a project).
 */
export async function pruneAssets(graceSeconds=30):Promise<number>{
 try{
  const raw=await AsyncStorage.getItem(KEY);
  const projects:SavedProject[]=raw?JSON.parse(raw):[];
  const dir=FileSystem.documentDirectory+ASSETS_DIR;
  if(!(await FileSystem.getInfoAsync(dir)).exists)return 0;
  const keep=new Set<string>();
  for(const p of projects)for(const l of p.document.layers)if(l.type==='image'){keep.add(baseName(l.uri));if(l.magicMaskUri)keep.add(baseName(l.magicMaskUri));}
  let removed=0;
  for(const name of await FileSystem.readDirectoryAsync(dir)){
   if(keep.has(name))continue;
   const info=await FileSystem.getInfoAsync(dir+name);
   const modified=(info as any).modificationTime as number|undefined;
   if(!info.exists||modified===undefined||Date.now()/1000-modified<graceSeconds)continue;
   await FileSystem.deleteAsync(dir+name,{idempotent:true});removed++;
  }
  return removed;
 }catch(e){console.warn('pruneAssets',e);return 0;}
}
/**
 * Projects created before stickers were copied into the project still point at the sticker library file.
 * Copy those files into the project's own assets so deleting the sticker from the library can't break them.
 */
export async function detachLibraryAssets(doc:EditorDocument):Promise<{document:EditorDocument;changed:boolean}>{
 const copies=new Map<string,string>();let changed=false;
 const layers=[];
 for(const l of doc.layers){
  if(l.type==='image'&&l.uri.includes('/stickers/')){
   try{
    let next=copies.get(l.uri);
    if(!next){
     if(!(await FileSystem.getInfoAsync(l.uri)).exists){layers.push(l);continue;}
     next=await durableImage(l.uri);copies.set(l.uri,next);
    }
    layers.push({...l,uri:next});changed=true;continue;
   }catch(e){console.warn('detachLibraryAssets',e);}
  }
  layers.push(l);
 }
 return {document:changed?{...doc,layers}:doc,changed};
}
