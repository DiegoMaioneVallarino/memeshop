import React, { useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, PanResponder, LayoutChangeEvent } from 'react-native';
import { Feather } from '@expo/vector-icons';

type Setter = React.Dispatch<React.SetStateAction<number>>;
type Props = {
  kind:'mask'|'paint'; mode?:'erase'|'restore'; setMode?:(mode:'erase'|'restore')=>void;
  size:number;setSize:Setter;spread?:number;setSpread?:Setter;
  opacity:number;setOpacity:Setter;hardness:number;setHardness:Setter;
  color?:string;setColor?:(color:string)=>void;eraser?:boolean;setEraser?:(value:boolean)=>void;
  palette?:string[]; onEyedropper?:()=>void; onRefreshPalette?:()=>void;
};
const accent='#ed42d7';
function Control({label,value,onChange,min=1,max=100}:{label:string;value:number;onChange:Setter;min?:number;max?:number}) {
  const width = useRef(1);
  const current = useRef(value); current.current=value;
  const update = useRef(onChange); update.current=onChange;
  const setFromX = useRef((x:number)=>{});
  setFromX.current = x => update.current(Math.round(Math.max(min,Math.min(max,min+(x/width.current)*(max-min)))));
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder:()=>true,
    onMoveShouldSetPanResponder:()=>true,
    onPanResponderGrant:e=>setFromX.current(e.nativeEvent.locationX),
    onPanResponderMove:e=>setFromX.current(e.nativeEvent.locationX),
  })).current;
  const percent=Math.max(0,Math.min(100,(value-min)/(max-min)*100));
  return <View style={s.control}><View style={s.controlTitle}><Text style={s.title}>{label}</Text><Text style={s.number}>{Math.round(value)}</Text></View>
    <View style={s.controlRow}>
      <Pressable onPress={()=>onChange(v=>Math.max(min,v-1))} hitSlop={8}><Feather name="minus" size={23} color="white"/></Pressable>
      <View style={s.touchTrack} onLayout={(e:LayoutChangeEvent)=>{width.current=e.nativeEvent.layout.width}} {...pan.panHandlers}>
        <View style={s.track}><View style={[s.fill,{width:`${percent}%`}]}/></View>
        <View pointerEvents="none" style={[s.thumb,{left:`${percent}%`}]}/>
      </View>
      <Pressable onPress={()=>onChange(v=>Math.min(max,v+1))} hitSlop={8}><Feather name="plus" size={23} color="white"/></Pressable>
    </View></View>;
}
export function BrushControls(p:Props) {
  const isMask=p.kind==='mask';
  return <ScrollView style={s.scroll} contentContainerStyle={s.root} nestedScrollEnabled>
    <View style={s.modeRow}>{isMask ? <>
      <Pressable onPress={()=>p.setMode?.('erase')} style={[s.mode,p.mode==='erase'&&s.selected]}><Feather name="delete" size={19} color="white"/><Text style={s.modeText}>Borrar</Text></Pressable>
      <Pressable onPress={()=>p.setMode?.('restore')} style={[s.mode,p.mode==='restore'&&s.selected]}><Feather name="refresh-ccw" size={19} color="white"/><Text style={s.modeText}>Restaurar</Text></Pressable>
    </> : <>
      <Pressable onPress={()=>p.setEraser?.(false)} style={[s.mode,!p.eraser&&s.selected]}><Feather name="edit-3" size={19} color="white"/><Text style={s.modeText}>Dibujar</Text></Pressable>
      <Pressable onPress={()=>p.setEraser?.(true)} style={[s.mode,p.eraser&&s.selected]}><Feather name="delete" size={19} color="white"/><Text style={s.modeText}>Borrar trazo</Text></Pressable>
    </>}</View>
    <View style={s.preview}><View style={[s.dot,{width:Math.max(5,Math.min(65,p.size/3)),height:Math.max(5,Math.min(65,p.size/3)),borderRadius:99,backgroundColor:isMask?'#fff':p.color??'#fff',opacity:p.opacity/100}]}/></View>
    <Control label="Radio" value={p.size} onChange={p.setSize} min={2} max={250}/>
    {p.setSpread&&<Control label="Spread · suavidad del borde" value={p.spread??35} onChange={p.setSpread} min={0} max={100}/>}
    <Control label="Opacidad" value={p.opacity} onChange={p.setOpacity}/>
    <Control label="Dureza" value={p.hardness} onChange={p.setHardness}/>
    {!isMask&&<><View style={s.paletteHeader}><Text style={s.section}>Colores del lienzo</Text><Pressable onPress={p.onRefreshPalette}><Feather name="refresh-cw" size={18} color="white"/></Pressable><Pressable onPress={p.onEyedropper} style={s.pipette}><Feather name="droplet" size={18} color="white"/><Text style={s.modeText}>Cuentagotas</Text></Pressable></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.colors}>
        {(p.palette??[]).map((c,i)=><Pressable key={`${c}-${i}`} onPress={()=>p.setColor?.(c)} style={[s.swatch,{backgroundColor:c},p.color===c&&{borderColor:accent,borderWidth:3}]}/>)}
      </ScrollView></>}
    <Text style={s.hint}>{isMask?'Borrar oculta la imagen y Restaurar recupera sus áreas.':'Dibuja con un dedo. Dos dedos controlan la cámara.'}</Text>
  </ScrollView>;
}
const s=StyleSheet.create({scroll:{maxHeight:340},root:{paddingBottom:20,gap:10},modeRow:{flexDirection:'row',gap:10},mode:{flex:1,flexDirection:'row',justifyContent:'center',alignItems:'center',gap:9,backgroundColor:'#282828',borderRadius:12,paddingVertical:12,borderWidth:1,borderColor:'#363636'},selected:{borderColor:accent,backgroundColor:'#3b223a'},modeText:{color:'white',fontSize:13,fontWeight:'600'},preview:{height:70,backgroundColor:'#292929',borderRadius:12,alignItems:'center',justifyContent:'center'},dot:{borderWidth:1,borderColor:'#aaa'},control:{gap:4},controlTitle:{flexDirection:'row',justifyContent:'space-between'},title:{color:'#eee',fontSize:13},number:{color:'#aaa'},controlRow:{flexDirection:'row',alignItems:'center',gap:16},touchTrack:{flex:1,height:36,justifyContent:'center',marginHorizontal:4},track:{height:3,backgroundColor:'#555',borderRadius:3},fill:{height:3,backgroundColor:accent},thumb:{position:'absolute',width:19,height:19,borderRadius:10,backgroundColor:'#fff',marginLeft:-9.5,borderWidth:2,borderColor:accent},section:{color:'#ddd',fontSize:13,fontWeight:'600'},paletteHeader:{flexDirection:'row',alignItems:'center',gap:15},pipette:{marginLeft:'auto',flexDirection:'row',gap:6,alignItems:'center'},colors:{gap:12,paddingVertical:6},swatch:{width:34,height:34,borderRadius:18,borderColor:'#777',borderWidth:1},hint:{color:'#999',fontSize:11}});
