import React, { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';
import { PhotoCanvas, type PhotoCanvasHandle } from '../components/editor/PhotoCanvas';
import { EditorHeader, EditorToolbar, Sheet, SheetButton, type Tool } from '../components/editor/EditorChrome';
import { useEditorStore } from '../store/useEditorStore';
const colors = ['#ff508e','#ffffff','#111111','#25c5ff','#ffe05a','#65e89b'];
function MiniButton({ label, onPress }: {label:string;onPress:()=>void}) { return <Pressable onPress={onPress} style={styles.mini}><Text style={styles.miniText}>{label}</Text></Pressable>; }
export function EditorScreen() {
  const document = useEditorStore(s=>s.document);
  const setPhoto = useEditorStore(s=>s.setPhoto), addImage=useEditorStore(s=>s.addImage), addShape=useEditorStore(s=>s.addShape), addPaint=useEditorStore(s=>s.addPaint);
  const select=useEditorStore(s=>s.select), update=useEditorStore(s=>s.update), move=useEditorStore(s=>s.move), duplicate=useEditorStore(s=>s.duplicate), remove=useEditorStore(s=>s.remove);
  const undo=useEditorStore(s=>s.undo),redo=useEditorStore(s=>s.redo);
  const canUndo=useEditorStore(s=>s.past.length>0),canRedo=useEditorStore(s=>s.future.length>0);
  const [tool,setTool]=useState<Tool|null>(null);
  const [brushColor,setBrushColor]=useState('#ff508e'),[brushSize,setBrushSize]=useState(20),[eraser,setEraser]=useState(false);
  const [busy,setBusy]=useState(false);
  const canvas=useRef<PhotoCanvasHandle>(null);
  const selected=document?.layers.find(l=>l.id===document.selectedId);
  async function importImage(replace=false) {
    try { const result=await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],allowsEditing:false,quality:1});
      if(result.canceled||!result.assets.length)return;
      const a=result.assets[0];if(!a.width||!a.height)throw new Error('Imagen sin dimensiones');
      const photo={uri:a.uri,width:a.width,height:a.height,name:a.fileName??undefined};
      if(replace){setPhoto(photo);setTool(null);}else{addImage(photo);setTool('layers');}
    }catch(e){Alert.alert('Error al importar',String(e));}
  }
  async function exportPreview(){if(!document||busy)return;setBusy(true);try{
    const permission=await MediaLibrary.requestPermissionsAsync(true);
    if(!permission.granted){Alert.alert('Permiso requerido','Permite guardar imágenes en la galería.');return;}
    const base64=canvas.current?.snapshotBase64();if(!base64)throw new Error('Canvas no disponible');
    const file=`${FileSystem.cacheDirectory}photo-studio-${Date.now()}.png`;
    await FileSystem.writeAsStringAsync(file,base64,{encoding:FileSystem.EncodingType.Base64});
    await MediaLibrary.saveToLibraryAsync(file);Alert.alert('Exportado','Vista del canvas guardada en tu galería.');
  }catch(e){Alert.alert('Error al exportar',String(e));}finally{setBusy(false);}}
  const choose=(next:Tool)=>setTool(t=>t===next?null:next);
  const adjust=(key:'brightness'|'contrast'|'saturation',value:number)=>{
    if(!selected||selected.type!=='image')return;
    update(selected.id,{adjustments:{brightness:0,contrast:0,saturation:0,...selected.adjustments,[key]:Math.max(-1,Math.min(1,(selected.adjustments?.[key]??0)+value))}} as any);
  };
  return <SafeAreaView style={styles.root}>
    <EditorHeader back={()=>{setTool(null);Alert.alert('Photo Studio','Para iniciar otro proyecto, selecciona una imagen nueva.',[{text:'Cancelar'},{text:'Nueva imagen',onPress:()=>importImage(true)}]);}} undo={undo} redo={redo} canUndo={canUndo} canRedo={canRedo} exportImage={exportPreview} busy={busy}/>
    <View style={styles.workspace}>{document?<PhotoCanvas key={`${document.width}-${document.height}`} ref={canvas} document={document} mode={tool==='brush'?'brush':'layer'} brush={{color:brushColor,size:brushSize,eraser}}/>:<View style={styles.empty}><Feather name="image" size={48} color="#aaa"/><Text style={styles.emptyTitle}>Comienza a crear</Text><MiniButton label="Elegir imagen" onPress={()=>importImage(true)}/></View>}</View>
    {document && tool && <View style={styles.sheetContainer}><Sheet title={{tools:'Herramientas',adjust:'Ajustes de imagen',brush:'Pincel',layers:'Capas',add:'Añadir elemento',transform:'Transformar capa'}[tool]} onClose={()=>setTool(null)}>
      {tool==='tools' && <View style={styles.grid}><SheetButton icon="crop" title="Recortar" onPress={()=>Alert.alert('Próximamente','Recorte interactivo pendiente')}/><SheetButton icon="sliders" title="Ajustar" onPress={()=>setTool('adjust')}/><SheetButton icon="move" title="Transformar" onPress={()=>setTool('transform')}/><SheetButton icon="layers" title="Capas" onPress={()=>setTool('layers')}/><SheetButton icon="edit-3" title="Dibujar" onPress={()=>{if(!selected||selected.type!=='paint')addPaint();setTool('brush');}}/><SheetButton icon="plus-square" title="Añadir" onPress={()=>setTool('add')}/></View>}
      {tool==='add' && <View style={styles.grid}><SheetButton icon="image" title="Imagen" onPress={()=>importImage(false)}/><SheetButton icon="edit-3" title="Pintura" onPress={()=>{addPaint();setTool('brush');}}/><SheetButton icon="square" title="Forma" onPress={()=>{addShape();setTool('layers');}}/><SheetButton icon="refresh-cw" title="Nueva foto" onPress={()=>importImage(true)}/></View>}
      {tool==='brush' && <View style={styles.panel}><Text style={styles.help}>Un dedo dibuja · Dos dedos mueven o acercan el lienzo</Text><View style={styles.row}>{colors.map(color=><Pressable key={color} onPress={()=>{setBrushColor(color);setEraser(false);}} style={[styles.swatch,{backgroundColor:color,borderColor:brushColor===color&&!eraser?'#e746d3':'#777'}]}/>)}</View><View style={styles.row}><MiniButton label={eraser?'✓ Borrador':'Borrador'} onPress={()=>setEraser(!eraser)}/><MiniButton label="−" onPress={()=>setBrushSize(v=>Math.max(2,v/1.5))}/><Text style={styles.value}>{Math.round(brushSize)} px</Text><MiniButton label="+" onPress={()=>setBrushSize(v=>Math.min(300,v*1.5))}/></View></View>}
      {tool==='layers' && <ScrollView style={styles.layers}>{[...document.layers].reverse().map(l=><Pressable key={l.id} onPress={()=>select(l.id)} style={[styles.layer,l.id===document.selectedId&&styles.layerActive]}><Feather name={l.type==='image'?'image':l.type==='paint'?'edit-3':'square'} size={18} color="#ddd"/><Text style={styles.layerName} numberOfLines={1}>{l.name}</Text><Text style={styles.value}>{Math.round(l.opacity*100)}%</Text><MiniButton label={l.visible?'◉':'○'} onPress={()=>update(l.id,{visible:!l.visible})}/></Pressable>)}</ScrollView>}
      {tool==='adjust' && <View style={styles.panel}>{selected?.type==='image'?(['brightness','contrast','saturation'] as const).map(k=><View key={k} style={styles.row}><Text style={styles.field}>{k==='brightness'?'Brillo':k==='contrast'?'Contraste':'Saturación'}</Text><MiniButton label="−" onPress={()=>adjust(k,-.1)}/><Text style={styles.value}>{(selected.adjustments?.[k]??0).toFixed(1)}</Text><MiniButton label="+" onPress={()=>adjust(k,.1)}/></View>):<Text style={styles.help}>Selecciona una capa de imagen para ajustar.</Text>}</View>}
      {tool==='transform' && <View style={styles.panel}>{selected?<><View style={styles.row}><MiniButton label="←" onPress={()=>update(selected.id,{x:selected.x-document.width*.025})}/><MiniButton label="→" onPress={()=>update(selected.id,{x:selected.x+document.width*.025})}/><MiniButton label="↑" onPress={()=>update(selected.id,{y:selected.y-document.height*.025})}/><MiniButton label="↓" onPress={()=>update(selected.id,{y:selected.y+document.height*.025})}/><MiniButton label="↺" onPress={()=>update(selected.id,{rotation:selected.rotation-Math.PI/12})}/><MiniButton label="↻" onPress={()=>update(selected.id,{rotation:selected.rotation+Math.PI/12})}/></View><View style={styles.row}><Text style={styles.field}>Tamaño</Text><MiniButton label="−" onPress={()=>update(selected.id,{width:selected.width*.9,height:selected.height*.9})}/><MiniButton label="+" onPress={()=>update(selected.id,{width:selected.width*1.1,height:selected.height*1.1})}/><Text style={styles.field}>Opacidad</Text><MiniButton label="−" onPress={()=>update(selected.id,{opacity:selected.opacity-.1})}/><Text style={styles.value}>{Math.round(selected.opacity*100)}%</Text><MiniButton label="+" onPress={()=>update(selected.id,{opacity:selected.opacity+.1})}/></View><View style={styles.row}><MiniButton label="Subir" onPress={()=>move(selected.id,1)}/><MiniButton label="Bajar" onPress={()=>move(selected.id,-1)}/><MiniButton label="Duplicar" onPress={()=>duplicate(selected.id)}/><MiniButton label="Eliminar" onPress={()=>remove(selected.id)}/></View></>:<Text style={styles.help}>Selecciona una capa para transformarla.</Text>}</View>}
    </Sheet></View>}
    {document && <EditorToolbar active={tool} onSelect={choose}/>}
    {busy&&<ActivityIndicator color="#e746d3" style={styles.busy}/>}
  </SafeAreaView>;
}
const styles=StyleSheet.create({root:{flex:1,backgroundColor:'#101010'},workspace:{flex:1,backgroundColor:'#1a1a1a'},empty:{flex:1,alignItems:'center',justifyContent:'center',gap:20},emptyTitle:{color:'#fff',fontSize:22,fontWeight:'600'},sheetContainer:{maxHeight:'49%'},grid:{flexDirection:'row',flexWrap:'wrap'},panel:{gap:12,paddingBottom:8},row:{flexDirection:'row',alignItems:'center',flexWrap:'wrap',gap:9},mini:{backgroundColor:'#303030',paddingHorizontal:13,paddingVertical:10,borderRadius:9},miniText:{color:'#fff',fontSize:12,fontWeight:'600'},field:{color:'#ddd',fontSize:13,minWidth:75},value:{color:'#ccc',fontSize:12},help:{color:'#aaa',fontSize:12},swatch:{height:30,width:30,borderRadius:15,borderWidth:3},layers:{maxHeight:260},layer:{flexDirection:'row',alignItems:'center',gap:10,padding:8,borderRadius:10},layerActive:{backgroundColor:'#42303e'},layerName:{flex:1,color:'#fff',fontSize:13},busy:{position:'absolute',top:80,alignSelf:'center'}});
