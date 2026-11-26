import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { Tool } from '../../store/useUiStore';
import { Glass } from '../common/Glass';
export type { Tool };
const palette = { bg: '#101010', panel: '#191919', text: '#f5f5f5', muted: '#a9a9a9', accent: '#24e500' };
export function IconAction({ icon, label, onPress, active, disabled }: { icon: React.ComponentProps<typeof Feather>['name']; label?: string; onPress: () => void; active?: boolean; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label || icon} onPress={onPress} disabled={disabled} style={[styles.action, active && styles.active, disabled && {opacity: .3}]}><Feather name={icon} size={23} color={active ? palette.accent : palette.text}/>{label ? <Text numberOfLines={1} style={[styles.label, active && {color:palette.accent}]}>{label}</Text> : null}</Pressable>;
}
/**
 * Mantener pulsado para comparar. onPressIn/onPressOut (no onPress): suelta el dedo y vuelve al resultado.
 * Si el dedo se sale del botón, Pressable también dispara onPressOut, así que nunca se queda "pegado".
 */
export function CompareButton({ onStart, onEnd, active, disabled, label }: { onStart: () => void; onEnd: () => void; active: boolean; disabled?: boolean; label: string }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint="Mantén pulsado para ver el antes" disabled={disabled}
    onPressIn={onStart} onPressOut={onEnd} hitSlop={6} style={[styles.action, active && styles.active, disabled && { opacity: .3 }]}>
    <Feather name="eye" size={23} color={active ? palette.accent : palette.text} />
  </Pressable>;
}
export type CompareProps = { onStart: () => void; onEnd: () => void; active: boolean; disabled?: boolean; label: string };
export function EditorHeader({ undo, redo, canUndo, canRedo, exportImage, back, busy, eraseImage, eraseActive, editing, applyEdit, cancelEdit, removeBackground, removeBackgroundBusy, compare, eraseInEdit }: { compare?: CompareProps; eraseInEdit?: boolean; removeBackground?:()=>void; removeBackgroundBusy?:boolean; eraseImage?:()=>void; eraseActive?:boolean; undo:()=>void; redo:()=>void; canUndo:boolean; canRedo:boolean; exportImage:()=>void; back:()=>void; busy:boolean; editing?:boolean; applyEdit?:()=>void; cancelEdit?:()=>void }) {
  return <View style={styles.header}>
    <IconAction icon={editing?'x':'arrow-left'} onPress={editing ? ()=>cancelEdit?.() : back} label={editing?'Cancelar':'Atrás'}/>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={styles.headerCenter}>
      {/* Deshacer/rehacer también dentro de una herramienta: ahí actúan sobre el historial de la sesión. */}
      <IconAction icon="corner-up-left" onPress={undo} disabled={!canUndo}/><IconAction icon="corner-up-right" onPress={redo} disabled={!canRedo}/>
      {compare && <CompareButton {...compare} />}
      {eraseImage && (!editing || eraseInEdit) && <IconAction icon="delete" label="Goma" onPress={eraseImage} active={eraseActive}/>}
    </ScrollView>
    <Pressable onPress={editing ? applyEdit : exportImage} disabled={busy} style={{paddingHorizontal:12,paddingVertical:10,backgroundColor:editing?'#1b7e27':'transparent',borderRadius:10}}>
      <Text style={styles.export}>{busy?'Procesando…':editing?'✓ Aplicar':'Exportar'}</Text>
    </Pressable>
  </View>;
}

const tools: { id: Tool; icon: React.ComponentProps<typeof Feather>['name']; label:string }[] = [
  {id:'tools',icon:'crop',label:'Herramientas'}, {id:'effects',icon:'zap',label:'Efectos'},
  {id:'templates',icon:'grid',label:'Plantillas'}, {id:'collage',icon:'hexagon',label:'Collage'}, {id:'scene',icon:'map',label:'Escena'},
  {id:'canvas',icon:'maximize',label:'Lienzo'},
  {id:'text',icon:'type',label:'Texto'},
  {id:'stickers',icon:'smile',label:'Stickers'}, {id:'images',icon:'image',label:'Imágenes'},
  // «Capas» ya no está aquí: es el botón flotante a la derecha del lienzo.
];
type ToolButton = { id: Tool; icon: React.ComponentProps<typeof Feather>['name']; label:string };
/** `contextual`: botón extra para la capa seleccionada (p. ej. «Forma» cuando hay una forma seleccionada). */
export function EditorToolbar({ active, onSelect, contextual = [] }: { active:Tool|null; onSelect:(tool:Tool)=>void; contextual?: ToolButton[] }) {
  return <View style={styles.toolbar}><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.toolbarInner}>{[...contextual, ...tools].map(t=><IconAction key={t.id} icon={t.icon} label={t.label} onPress={()=>onSelect(t.id)} active={active===t.id}/>)}</ScrollView></View>;
}
export function Sheet({ title, onClose, children }: { title:string; onClose:()=>void; children:React.ReactNode }) {
  return <Glass style={styles.sheet}><View style={styles.sheetHead}><Text style={styles.sheetTitle}>{title}</Text><IconAction icon="x" onPress={onClose}/></View>{children}</Glass>;
}
const styles=StyleSheet.create({header:{height:64,flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:12},headerCenter:{flexGrow:1,flexDirection:'row',gap:2,alignItems:'center',justifyContent:'center'},export:{color:'#fff',fontSize:16,fontWeight:'600',paddingHorizontal:10},action:{minWidth:50,alignItems:'center',justifyContent:'center',paddingVertical:8,paddingHorizontal:8,gap:6,borderRadius:9},active:{backgroundColor:'#173017'},label:{color:palette.text,fontSize:11},toolbar:{borderTopColor:'rgba(255,255,255,.08)',borderTopWidth:1},toolbarInner:{alignItems:'center',paddingHorizontal:8,paddingVertical:7,gap:9},sheet:{paddingHorizontal:12,paddingBottom:14,borderTopLeftRadius:18,borderTopRightRadius:18},sheetHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',minHeight:36},sheetTitle:{color:'#fff',fontSize:15,fontWeight:'700'},sheetButton:{width:'25%',minHeight:80,alignItems:'center',justifyContent:'center',gap:9,padding:5},sheetButtonText:{color:'#eee',fontSize:11,textAlign:'center'}});
