import React from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { EditorDocument } from '../../types/editor';
import { useEditorStore } from '../../store/useEditorStore';
export function LayersDrawer({document,onClose}:{document:EditorDocument;onClose:()=>void}){
 const select=useEditorStore(s=>s.select),update=useEditorStore(s=>s.update),move=useEditorStore(s=>s.move);
 return <View style={s.drawer}><View style={s.header}><Feather name="layers" size={20} color="white"/><Text style={s.title}>Capas</Text><Pressable onPress={onClose}><Feather name="x" color="white" size={20}/></Pressable></View><ScrollView contentContainerStyle={s.list}>{[...document.layers].reverse().map(l=><Pressable key={l.id} onPress={()=>select(l.id)} style={[s.item,l.id===document.selectedId&&s.active]}>
 {l.type==='image'?<Image source={{uri:l.uri}} resizeMode="contain" style={s.thumb}/>:<View style={[s.thumb,{alignItems:'center',justifyContent:'center'}]}><Feather name={l.type==='paint'?'edit-3':'square'} color="#ddd" size={24}/></View>}
 <Text numberOfLines={1} style={s.name}>{l.name}</Text>
 <Pressable onPress={()=>update(l.id,{visible:!l.visible})}><Feather name={l.visible?'eye':'eye-off'} color="white" size={18}/></Pressable>
 <View style={s.reorder}><Pressable onPress={()=>move(l.id,1)}><Feather name="chevron-up" size={19} color="white"/></Pressable><Pressable onPress={()=>move(l.id,-1)}><Feather name="chevron-down" size={19} color="white"/></Pressable></View>
 </Pressable>)}</ScrollView></View>
}
const s=StyleSheet.create({drawer:{position:'absolute',right:8,top:12,width:218,maxHeight:'82%',backgroundColor:'#111',borderRadius:15,borderWidth:1,borderColor:'#333',overflow:'hidden',elevation:10},header:{height:54,flexDirection:'row',alignItems:'center',paddingHorizontal:12,gap:10,borderBottomWidth:1,borderBottomColor:'#333'},title:{color:'white',fontSize:16,flex:1},list:{padding:7,gap:7},item:{backgroundColor:'#242424',borderRadius:10,borderWidth:1,borderColor:'#333',padding:6,flexDirection:'row',alignItems:'center',gap:6},active:{borderColor:'#db44ce',borderWidth:2},thumb:{height:58,width:55,backgroundColor:'#3a3a3a',borderRadius:6},name:{color:'#ddd',fontSize:10,flex:1},reorder:{gap:4}});
