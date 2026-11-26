import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
export type StickerAsset={id:string;name:string;uri:string;width:number;height:number;createdAt:number;tags:string[]};
const KEY='photo-studio/stickers/v1';
const ROOT=FileSystem.documentDirectory+'stickers/';
export async function getStickers():Promise<StickerAsset[]>{const raw=await AsyncStorage.getItem(KEY);return raw?JSON.parse(raw):[];}
export async function saveSticker(input:{uri:string;width:number;height:number;name?:string;tags?:string[]}):Promise<StickerAsset>{
 await FileSystem.makeDirectoryAsync(ROOT,{intermediates:true});
 const id=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
 const ext=(input.uri.split('?')[0].match(/\.(png|webp|jpe?g)$/i)?.[1]||'png').toLowerCase();
 const uri=ROOT+id+'.'+ext;
 await FileSystem.copyAsync({from:input.uri,to:uri});
 const asset={id,name:input.name||'Sticker',uri,width:input.width,height:input.height,createdAt:Date.now(),tags:input.tags??[]};
 const items=await getStickers();await AsyncStorage.setItem(KEY,JSON.stringify([asset,...items]));return asset;
}
export async function deleteSticker(id:string){const items=await getStickers();const item=items.find(a=>a.id===id);if(item){await FileSystem.deleteAsync(item.uri,{idempotent:true});await AsyncStorage.setItem(KEY,JSON.stringify(items.filter(a=>a.id!==id)));}}

/** Cambia nombre y etiquetas de un sticker de la biblioteca. */
export async function updateSticker(id:string,patch:{name?:string;tags?:string[]}):Promise<void>{
 const items=await getStickers();
 await AsyncStorage.setItem(KEY,JSON.stringify(items.map(a=>a.id===id?{...a,...patch,tags:patch.tags??a.tags??[]}:a)));
}
