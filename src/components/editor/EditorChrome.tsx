import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { Tool } from '../../store/useUiStore';
export type { Tool };
const palette = { bg: '#101010', panel: '#191919', text: '#f5f5f5', muted: '#a9a9a9', accent: '#24e500' };
export function IconAction({ icon, label, onPress, active, disabled }: { icon: React.ComponentProps<typeof Feather>['name']; label?: string; onPress: () => void; active?: boolean; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label || icon} onPress={onPress} disabled={disabled} style={[styles.action, active && styles.active, disabled && {opacity: .3}]}><Feather name={icon} size={23} color={active ? palette.accent : palette.text}/>{label ? <Text numberOfLines={1} style={[styles.label, active && {color:palette.accent}]}>{label}</Text> : null}</Pressable>;
}
export function EditorHeader({ undo, redo, canUndo, canRedo, exportImage, back, busy, eraseImage, eraseActive, editing, applyEdit, cancelEdit, removeBackground, removeBackgroundBusy }: { removeBackground?:()=>void; removeBackgroundBusy?:boolean; eraseImage?:()=>void; eraseActive?:boolean; undo:()=>void; redo:()=>void; canUndo:boolean; canRedo:boolean; exportImage:()=>void; back:()=>void; busy:boolean; editing?:boolean; applyEdit?:()=>void; cancelEdit?:()=>void }) {
  return <View style={styles.header}>
    <IconAction icon={editing?'x':'arrow-left'} onPress={editing ? ()=>cancelEdit?.() : back} label={editing?'Cancelar':'Atrás'}/>
    <View style={styles.headerCenter}>
      {!editing && <><IconAction icon="corner-up-left" onPress={undo} disabled={!canUndo}/><IconAction icon="corner-up-right" onPress={redo} disabled={!canRedo}/></>}
      {eraseImage && !editing && <IconAction icon="delete" label="Goma" onPress={eraseImage} active={eraseActive}/>}
      {removeBackground && !editing && <IconAction icon="scissors" label="Quitar fondo" onPress={removeBackground} disabled={removeBackgroundBusy}/>}
    </View>
    <Pressable onPress={editing ? applyEdit : exportImage} disabled={busy} style={{paddingHorizontal:12,paddingVertical:10,backgroundColor:editing?'#1b7e27':'transparent',borderRadius:10}}>
      <Text style={styles.export}>{busy?'Procesando…':editing?'✓ Aplicar':'Exportar'}</Text>
    </Pressable>
  </View>;
}

const tools: { id: Tool; icon: React.ComponentProps<typeof Feather>['name']; label:string }[] = [
  {id:'tools',icon:'crop',label:'Herramientas'}, {id:'effects',icon:'zap',label:'Efectos'},
  {id:'text',icon:'type',label:'Texto'},
  {id:'stickers',icon:'smile',label:'Stickers'}, {id:'images',icon:'image',label:'Imágenes'},
  {id:'layers',icon:'layers',label:'Capas'}
];
type ToolButton = { id: Tool; icon: React.ComponentProps<typeof Feather>['name']; label:string };
/** `contextual`: botón extra para la capa seleccionada (p. ej. «Forma» cuando hay una forma seleccionada). */
export function EditorToolbar({ active, onSelect, contextual }: { active:Tool|null; onSelect:(tool:Tool)=>void; contextual?: ToolButton | null }) {
  return <View style={styles.toolbar}><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.toolbarInner}>{[...(contextual ? [contextual] : []), ...tools].map(t=><IconAction key={t.id} icon={t.icon} label={t.label} onPress={()=>onSelect(t.id)} active={active===t.id}/>)}</ScrollView></View>;
}
export function Sheet({ title, onClose, children }: { title:string; onClose:()=>void; children:React.ReactNode }) {
  return <View style={styles.sheet}><View style={styles.sheetHead}><Text style={styles.sheetTitle}>{title}</Text><IconAction icon="x" onPress={onClose}/></View>{children}</View>;
}
const styles=StyleSheet.create({header:{height:64,backgroundColor:palette.bg,flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:12},headerCenter:{flexDirection:'row',gap:5},export:{color:'#fff',fontSize:16,fontWeight:'600',paddingHorizontal:10},action:{minWidth:50,alignItems:'center',justifyContent:'center',paddingVertical:8,paddingHorizontal:8,gap:6,borderRadius:9},active:{backgroundColor:'#173017'},label:{color:palette.text,fontSize:11},toolbar:{backgroundColor:palette.bg,borderTopColor:'#272727',borderTopWidth:1},toolbarInner:{alignItems:'center',paddingHorizontal:8,paddingVertical:7,gap:9},sheet:{backgroundColor:palette.panel,paddingHorizontal:12,paddingBottom:14,borderTopLeftRadius:18,borderTopRightRadius:18},sheetHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',minHeight:36},sheetTitle:{color:'#fff',fontSize:15,fontWeight:'700'},sheetButton:{width:'25%',minHeight:80,alignItems:'center',justifyContent:'center',gap:9,padding:5},sheetButtonText:{color:'#eee',fontSize:11,textAlign:'center'}});
