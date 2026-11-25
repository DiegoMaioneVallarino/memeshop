import React, { useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { EditorDocument, LayerBlendMode } from '../../types/editor';
import { useEditorStore } from '../../store/useEditorStore';
import { ValueSlider } from '../common/controls';
const BLENDS: { key: LayerBlendMode; label: string }[] = [
  {key:'srcOver',label:'Normal'}, {key:'multiply',label:'Multiplicar'}, {key:'screen',label:'Trama'},
  {key:'overlay',label:'Superponer'}, {key:'darken',label:'Oscurecer'}, {key:'lighten',label:'Aclarar'}, {key:'difference',label:'Diferencia'}
];
function Tiny({label,onPress,active=false}:{label:string;onPress:()=>void;active?:boolean}) {
  return <Pressable onPress={onPress} style={[s.chip,active&&s.chipActive]}><Text style={s.chipText}>{label}</Text></Pressable>;
}
export function LayersDrawer({document,onClose}:{document:EditorDocument;onClose:()=>void}) {
  const select=useEditorStore(st=>st.select),update=useEditorStore(st=>st.update),move=useEditorStore(st=>st.move);
  const groupLayers=useEditorStore(st=>st.groupLayers),ungroup=useEditorStore(st=>st.ungroupLayers);
  const setGroupVisibility=useEditorStore(st=>st.setGroupVisibility),setGroupLocked=useEditorStore(st=>st.setGroupLocked);
  const [multi,setMulti]=useState(false);
  const [checked,setChecked]=useState<string[]>([]);
  const [blendOpen,setBlendOpen]=useState(false);
  const current=document.layers.find(l=>l.id===document.selectedId);
  const groups=useMemo(()=>Array.from(new Set(document.layers.map(l=>l.groupId).filter((v):v is string=>!!v))),[document.layers]);
  const toggle=(id:string)=>setChecked(a=>a.includes(id)?a.filter(v=>v!==id):[...a,id]);
  return <View style={s.drawer}>
    <View style={s.header}><Feather name="layers" size={18} color="#1ae520"/><Text style={s.title}>Capas</Text>
      <Tiny label={multi?'Listo':'Agrupar'} onPress={()=>{setMulti(v=>!v);setChecked([]);}}/>
      <Pressable onPress={onClose} hitSlop={12}><Feather name="x" color="white" size={20}/></Pressable>
    </View>
    {multi&&<View style={s.toolbar}><Text style={s.hint}>{checked.length} seleccionadas</Text><Tiny label="Crear grupo" active onPress={()=>{groupLayers(checked);setChecked([]);setMulti(false);}}/></View>}
    <ScrollView style={s.scroll} contentContainerStyle={s.list} nestedScrollEnabled>
      {groups.map((id,i)=>{
        const members=document.layers.filter(l=>l.groupId===id);
        return <View key={id} style={s.group}><View style={s.groupRow}><Feather name="folder" color="#1ae520" size={15}/><Text style={s.groupText}>Grupo {i+1} · {members.length}</Text>
          <Tiny label={members.every(l=>l.visible)?'◉':'○'} onPress={()=>setGroupVisibility(id,!members.every(l=>l.visible))}/>
          <Tiny label={members.every(l=>l.locked)?'🔒':'🔓'} onPress={()=>setGroupLocked(id,!members.every(l=>l.locked))}/>
          <Tiny label="Separar" onPress={()=>ungroup(id)}/></View></View>;
      })}
      {[...document.layers].reverse().map(l=><Pressable key={l.id} onPress={()=>multi?toggle(l.id):select(l.id)} style={[s.item,l.id===document.selectedId&&!multi&&s.active,checked.includes(l.id)&&s.active]}>
        {multi&&<Feather name={checked.includes(l.id)?'check-square':'square'} size={18} color="#1ae520"/>}
        {l.type==='image'?<Image source={{uri:l.uri}} resizeMode="contain" style={s.thumb}/>:<View style={[s.thumb,s.placeholder]}><Feather name={l.type==='paint'?'edit-3':l.type==='text'?'type':'square'} color="#ddd" size={18}/></View>}
        <View style={s.nameBox}><Text numberOfLines={1} style={s.name}>{l.name}</Text><Text style={s.sub}>{l.groupId?'● Grupo · ':''}{Math.round(l.opacity*100)}% · {BLENDS.find(b=>b.key===(l.blendMode??'srcOver'))?.label}</Text></View>
        <Pressable onPress={()=>update(l.id,{visible:!l.visible})} hitSlop={8}><Feather name={l.visible?'eye':'eye-off'} color="#ddd" size={17}/></Pressable>
        <Pressable onPress={()=>update(l.id,{locked:!l.locked})} hitSlop={8}><Feather name={l.locked?'lock':'unlock'} color={l.locked?'#1ae520':'#aaa'} size={16}/></Pressable>
        <View style={s.reorder}><Pressable disabled={!!l.locked} onPress={()=>move(l.id,1)}><Feather name="chevron-up" size={17} color={l.locked?'#555':'white'}/></Pressable><Pressable disabled={!!l.locked} onPress={()=>move(l.id,-1)}><Feather name="chevron-down" size={17} color={l.locked?'#555':'white'}/></Pressable></View>
      </Pressable>)}
      {current&&!multi&&<View style={s.inspector}>
        <Text style={s.section}>Fusión · {current.name}</Text>
        <Tiny label={BLENDS.find(b=>b.key===(current.blendMode??'srcOver'))?.label+' ▾'} onPress={()=>setBlendOpen(v=>!v)}/>
        {blendOpen&&<View style={s.blends}>{BLENDS.map(b=><Tiny key={b.key} label={b.label} active={(current.blendMode??'srcOver')===b.key} onPress={()=>{update(current.id,{blendMode:b.key});setBlendOpen(false);}}/>)}</View>}
        <View style={s.groupRow}><Text style={s.section}>Máscara</Text><Text style={s.hint}>{current.maskStrokes?.length ?? 0} trazos</Text>{!!current.maskStrokes?.length && <Tiny label="Limpiar" onPress={()=>update(current.id,{maskStrokes:[]})}/>}</View>
        <ValueSlider compact label="Opacidad" value={Math.round(current.opacity*100)} min={0} max={100} onChange={v=>update(current.id,{opacity:v/100})} format={v=>`${Math.round(v)}%`}/>
        {current.locked&&<Text style={s.hint}>Capa bloqueada: desbloquéala para editar.</Text>}
      </View>}
    </ScrollView>
  </View>;
}
const s=StyleSheet.create({
  drawer:{position:'absolute',right:8,top:12,width:292,maxHeight:'82%',backgroundColor:'#111',borderRadius:15,borderWidth:1,borderColor:'#333',overflow:'hidden',elevation:10},
  header:{height:49,flexDirection:'row',alignItems:'center',paddingHorizontal:10,gap:8,borderBottomWidth:1,borderBottomColor:'#333'},
  title:{color:'white',fontSize:15,fontWeight:'700',flex:1},scroll:{flexGrow:0},list:{padding:7,gap:6},
  item:{backgroundColor:'#242424',borderRadius:9,borderWidth:1,borderColor:'#333',padding:6,flexDirection:'row',alignItems:'center',gap:5},
  active:{borderColor:'#1ae520',borderWidth:1},thumb:{height:40,width:40,backgroundColor:'#3a3a3a',borderRadius:5},placeholder:{alignItems:'center',justifyContent:'center'},
  nameBox:{flex:1,minWidth:0},name:{color:'#eee',fontSize:11,fontWeight:'600'},sub:{color:'#aaa',fontSize:9},reorder:{gap:1},
  chip:{paddingHorizontal:7,paddingVertical:6,backgroundColor:'#333',borderRadius:7},chipActive:{backgroundColor:'#167923'},chipText:{color:'white',fontSize:10,fontWeight:'700'},
  toolbar:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:10,paddingVertical:6},hint:{color:'#aaa',fontSize:10},
  group:{backgroundColor:'#18251a',borderRadius:7,padding:5},groupRow:{flexDirection:'row',alignItems:'center',gap:5,flexWrap:'wrap'},groupText:{color:'#caffca',fontSize:10,flex:1},
  inspector:{padding:8,backgroundColor:'#202020',borderRadius:9,gap:7},section:{color:'#ddd',fontSize:11,fontWeight:'700'},blends:{flexDirection:'row',gap:5,flexWrap:'wrap'}
});
