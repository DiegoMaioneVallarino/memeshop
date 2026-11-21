import { createMagicMask } from '../services/magicWand';
import React, { useRef, useState, useEffect } from 'react';
import { ActivityIndicator, Alert, Share, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View, Image, useWindowDimensions, TextInput } from 'react-native';
import { ProjectsHome } from './ProjectsHome';
import { listProjects, persistProject, deleteProject, durableImage, pruneAssets, detachLibraryAssets, migrateLegacyMasks, type SavedProject } from '../services/projects';
import { clearMasks, loadMaskImage, registerMask, releaseMask } from '../services/maskStore';
import { removeBackgroundAuto } from '../services/subject';
import { cropAndStraighten, cropMaskImage } from '../services/imageCrop';
import { CropPanel } from '../components/editor/CropPanel';
import { cropRect, cropLocalAngle, croppedGeometry, initialCrop, isCropNoop, pixelRect, type CropState } from '../utils/crop';
import { BrushControls } from '../components/editor/BrushControls';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import Slider from '@react-native-community/slider';
import { LayersDrawer } from '../components/editor/LayersDrawer';
import { StickerLibrary } from '../components/editor/StickerLibrary';
import { saveSticker, type StickerAsset } from '../services/stickerLibrary';
import { PhotoCanvas, renderStickerBase64, type PhotoCanvasHandle } from '../components/editor/PhotoCanvas';
import { EditorHeader, EditorToolbar, Sheet, SheetButton, type Tool } from '../components/editor/EditorChrome';
import { useEditorStore } from '../store/useEditorStore';
const GLITCH_NAMES = ['Slice Repeat','Block Displacement','RGB Split','Pixel Sorting','VHS Tracking','Compression Corruption','Datamosh','Data Dropout','Bit Crush','Interlace Error'];
const FILTER_NAMES = ['Sustituir color','Ninguno','Vibrante','Vintage','Desaturado','Brillante','Dramático','Pastel','Frío','Cálido',...GLITCH_NAMES];
const colors = ['#18e500','#ffffff','#111111','#25c5ff','#ffe05a','#65e89b'];
function MiniButton({ label, onPress }: {label:string;onPress:()=>void}) { return <Pressable onPress={onPress} style={styles.mini}><Text style={styles.miniText}>{label}</Text></Pressable>; }
export function EditorScreen() {
  const document = useEditorStore(s=>s.document);
  const [home,setHome]=useState(true);
  const [booting,setBooting]=useState(true);
  const [projects,setProjects]=useState<SavedProject[]>([]);
  const [projectId,setProjectId]=useState<string|null>(null);
  const [projectName,setProjectName]=useState('Proyecto sin título');
  const [crop,setCrop]=useState<CropState>(initialCrop);
  const [wandTolerance,setWandTolerance]=useState(25);
  const [wandFeather,setWandFeather]=useState(12);
  const [wandContiguous,setWandContiguous]=useState(true);
  const [wandPoint,setWandPoint]=useState<{x:number;y:number}|null>(null);
  const [wandLayerId,setWandLayerId]=useState<string|null>(null);
  const [wandWorking,setWandWorking]=useState(false);
  const [gpuWand,setGpuWand]=useState<{layerId:string;x:number;y:number;tolerance:number;feather:number}|null>(null);
  const [bgWorking,setBgWorking]=useState(false);
  const wandSessionKey=useRef<string|null>(null); // máscara creada en la sesión de varita actual (se reemplaza en cada tick)
  const wandSequence=useRef(0);
  const wandTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const wandPointRef=useRef<{x:number;y:number}|null>(null);
  const wandLayerRef=useRef<string|null>(null);
  const wandSettingsRef=useRef({tolerance:25,feather:12,contiguous:true});
  const [filterCategory,setFilterCategory]=useState('TODOS');
  const [textTab,setTextTab]=useState<'Fuente'|'Trazo'|'Color'|'Resaltador'|'Sombra'>('Fuente');
  const [filterPreset,setFilterPreset]=useState('Ninguno');
  const [replacementSource,setReplacementSource]=useState('#18e500');
  const [replacementTarget,setReplacementTarget]=useState('#ff304f');
  useEffect(()=>{
    let alive=true;
    const start=Date.now();
    void migrateLegacyMasks().then(()=>listProjects()).then(items=>{if(alive)setProjects(items);}).catch(e=>console.warn('Proyectos:',e?.stack??e)).finally(()=>{
      const delay=Math.max(0,650-(Date.now()-start));
      setTimeout(()=>{if(alive)setBooting(false);},delay);
    });
    return ()=>{alive=false;};
  },[]);
  useEffect(()=>{
    if(home||!document||!projectId)return;
    const timeout=setTimeout(()=>{void persistProject({id:projectId,name:projectName,updatedAt:Date.now(),document}).then(()=>listProjects().then(setProjects)).catch(e=>console.warn('Autoguardado:',e?.stack??e));},1200);
    return ()=>clearTimeout(timeout);
  },[document,projectId,projectName,home]);
  const openProject=async(p:SavedProject)=>{let doc=p.document;try{doc=(await detachLibraryAssets(doc)).document;}catch(e){console.warn(e);}clearMasks();useEditorStore.setState({document:doc,past:[],future:[],editBaseline:null});setProjectId(p.id);setProjectName(p.name);setTool(null);setHome(false);};
  const newProject=()=>{clearMasks();useEditorStore.getState().resetDocument();setProjectId(String(Date.now()));setProjectName('Proyecto sin título');setHome(false);setTool(null);};
  const goHome=async()=>{if(document&&projectId){await persistProject({id:projectId,name:projectName,updatedAt:Date.now(),document});setProjects(await listProjects());void pruneAssets();}setTool(null);setHome(true);};

  const setPhoto = useEditorStore(s=>s.setPhoto), addImage=useEditorStore(s=>s.addImage), addShape=useEditorStore(s=>s.addShape), addPaint=useEditorStore(s=>s.addPaint), addText=useEditorStore(s=>s.addText);
  const select=useEditorStore(s=>s.select), update=useEditorStore(s=>s.update), move=useEditorStore(s=>s.move), duplicate=useEditorStore(s=>s.duplicate), remove=useEditorStore(s=>s.remove);
  const undo=useEditorStore(s=>s.undo),redo=useEditorStore(s=>s.redo);
  const canUndo=useEditorStore(s=>s.past.length>0),canRedo=useEditorStore(s=>s.future.length>0);
  const [tool,setTool]=useState<Tool|null>(null);
  const [layersOpen,setLayersOpen]=useState(false);
  const [stickersOpen,setStickersOpen]=useState(false);
  const [brushColor,setBrushColor]=useState('#18e500'),[brushSize,setBrushSize]=useState(20),[eraser,setEraser]=useState(false);
  const [busy,setBusy]=useState(false);
  const [exportError,setExportError]=useState<string|null>(null);
  const [imageLoading,setImageLoading]=useState(false);
  const [maskHardness,setMaskHardness]=useState(80);
  const [palette,setPalette]=useState<string[]>(colors);
  const [pickingColor,setPickingColor]=useState(false);
  const {width:screenWidth}=useWindowDimensions();
  const [maskMode,setMaskMode]=useState<'erase'|'restore'>('erase');
  const [maskSpread,setMaskSpread]=useState(35),[maskOpacity,setMaskOpacity]=useState(100);
  const [brushOpacity,setBrushOpacity]=useState(100),[brushHardness,setBrushHardness]=useState(100),[brushSpread,setBrushSpread]=useState(35);
  const canvas=useRef<PhotoCanvasHandle>(null);
  const editing=useEditorStore(s=>!!s.editBaseline);
  const beginEdit=useEditorStore(s=>s.beginEdit);
  const finishEdit=useEditorStore(s=>s.finishEdit);
  const cancelEdit=useEditorStore(s=>s.cancelEdit);
  const actionTools:Tool[]=['effects','adjust','crop','rotate','perspective','transform','wand','brush','mask','text','stickers','images','add'];
  useEffect(()=>{
    if (!home && document && tool && actionTools.includes(tool)) beginEdit();
  },[tool,home,!!document]);
  const acceptAction=()=>{finishEdit();wandSessionKey.current=null;setGpuWand(null);setTool(null);};
  const discardAction=()=>{wandSequence.current++;if(wandTimer.current)clearTimeout(wandTimer.current);cancelEdit();releaseMask(wandSessionKey.current);wandSessionKey.current=null;setGpuWand(null);setWandPoint(null);setTool(null);};
  const selected=document?.layers.find(l=>l.id===document.selectedId);
  useEffect(()=>{if(tool!=='crop'&&tool!=='rotate'&&tool!=='perspective')setCrop(initialCrop);},[tool]);
  useEffect(()=>{wandSessionKey.current=null;setCrop(initialCrop);wandSequence.current++;if(wandTimer.current)clearTimeout(wandTimer.current);wandPointRef.current=null;wandLayerRef.current=null;setWandPoint(null);setWandLayerId(null);setWandWorking(false);setGpuWand(null);},[document?.selectedId]);
  const cropImage=selected?.type==='image'?selected:null;
  const cropPreview=tool==='crop'&&cropImage?{layerId:cropImage.id,rect:cropRect(crop,cropImage.width,cropImage.height,!!cropImage.flipX),angle:cropLocalAngle(crop,!!cropImage.flipX)}:null;
  async function importImage(replace=false) {
    try { setImageLoading(true); const result=await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],allowsEditing:false,quality:1});
      if(result.canceled||!result.assets.length)return;
      const a=result.assets[0];if(!a.width||!a.height)throw new Error('Imagen sin dimensiones');
      // Normalize HEIC/HEIF and other iPhone formats to a decoder-friendly PNG.
      const normalized = await ImageManipulator.manipulateAsync(a.uri, [], { format: ImageManipulator.SaveFormat.PNG });
      const photo={uri:await durableImage(normalized.uri),width:normalized.width,height:normalized.height,name:a.fileName??undefined};
      beginEdit();
      if(replace){const before=useEditorStore.getState().editBaseline;setPhoto(photo);if(before)useEditorStore.setState({editBaseline:before});setTool('images');}else{addImage(photo);setTool('images');}
    }catch(e){Alert.alert('Error al importar',String(e));}finally{setImageLoading(false);}
  }
  async function exportPreview(){
    if(!document||busy)return;
    setBusy(true);setExportError(null);
    try {
      // Snapshot is PNG in base64; write an actual .png before passing it to Photos.
      const base64=await canvas.current?.snapshotBase64();
      if(!base64)throw new Error('Skia no pudo generar la imagen. Espera a que termine de cargar.');
      if(!FileSystem.cacheDirectory)throw new Error('No se encontró el directorio temporal.');
      const file=`${FileSystem.cacheDirectory}memeshop-${Date.now()}.png`;
      await FileSystem.writeAsStringAsync(file,base64,{encoding:FileSystem.EncodingType.Base64});
      const info=await FileSystem.getInfoAsync(file);
      if(!info.exists || !info.size)throw new Error('El archivo PNG quedó vacío.');
      // iOS can return limited photo access; addOnly/writeOnly is sufficient for export.
      const permission=await MediaLibrary.requestPermissionsAsync(true);
      if(!permission.granted) {
        Alert.alert('Guardar imagen','Sin permiso para añadir fotos. Puedes compartir el PNG.',[
          {text:'Cancelar'}, {text:'Compartir',onPress:()=>{void Share.share({url:file,message:'Memeshop PNG'});}}
        ]);
        return;
      }
      try {
        await MediaLibrary.saveToLibraryAsync(file);
        Alert.alert('Guardado','Imagen PNG guardada en Fotos.');
      } catch(saveError) {
        setExportError(String(saveError));
        Alert.alert('No se pudo guardar en Fotos','El PNG se generó. Puedes compartirlo o guardarlo desde el menú del sistema.',[
          {text:'Cerrar'}, {text:'Compartir PNG',onPress:()=>{void Share.share({url:file,message:'Memeshop PNG'});}}
        ]);
      }
    } catch(e) {setExportError(String(e));Alert.alert('Error al exportar',String(e));}
    finally {setBusy(false);}
  }
  // Recompute after a short pause while dragging sliders; ignore out-of-order results.
  const calculateWand=async(x:number,y:number,layerId:string,sequence:number)=>{
    const layer=useEditorStore.getState().document?.layers.find(l=>l.id===layerId);
    if(!layer||layer.type!=='image')return;
    setWandWorking(true);
    let uri:string|undefined;
    try{
      uri=await createMagicMask(layer.uri,x,y,wandSettingsRef.current);
      if(sequence!==wandSequence.current || wandLayerRef.current!==layerId){
        releaseMask(uri);return;
      }
      // Dentro de la edición los ticks intermedios no entran al historial (hay editBaseline), así que se liberan.
      const previous=wandSessionKey.current;
      useEditorStore.getState().update(layerId,{magicMaskUri:uri});
      wandSessionKey.current=uri;
      if(previous)releaseMask(previous);
    }catch(e){if(sequence===wandSequence.current)Alert.alert('Varita mágica',String(e));}
    finally{if(sequence===wandSequence.current)setWandWorking(false);}
  };
  const scheduleWand=(x:number,y:number,layerId:string,delay=40)=>{
    setGpuWand(null);
    wandPointRef.current={x,y};wandLayerRef.current=layerId;
    setWandPoint({x,y});setWandLayerId(layerId);
    const sequence=++wandSequence.current;
    if(wandTimer.current)clearTimeout(wandTimer.current);
    wandTimer.current=setTimeout(()=>{void calculateWand(x,y,layerId,sequence);},delay);
  };
  const applyWand=(x:number,y:number)=>{
    const layer=useEditorStore.getState().document?.layers.find(l=>l.id===useEditorStore.getState().document?.selectedId);
    if(layer?.type==='image')scheduleWand(x,y,layer.id,0);
  };
  useEffect(()=>{
    wandSettingsRef.current={tolerance:wandTolerance,feather:wandFeather,contiguous:wandContiguous};
    const point=wandPointRef.current,layerId=wandLayerRef.current;
    if(point&&layerId&&tool==='wand')scheduleWand(point.x,point.y,layerId,60);
  },[wandTolerance,wandFeather,wandContiguous]);
  useEffect(()=>()=>{wandSequence.current++;if(wandTimer.current)clearTimeout(wandTimer.current);},[]);
  const resetWand=()=>{
    wandSequence.current++;if(wandTimer.current)clearTimeout(wandTimer.current);
    if(selected?.type==='image')update(selected.id,{magicMaskUri:undefined});
    releaseMask(wandSessionKey.current);wandSessionKey.current=null;
    setGpuWand(null);
    wandPointRef.current=null;wandLayerRef.current=null;setWandPoint(null);setWandLayerId(null);setWandWorking(false);
  };
  const saveWandSticker=async()=>{
    const layer=useEditorStore.getState().document?.layers.find(l=>l.id===wandLayerRef.current);
    if(!layer||layer.type!=='image'||(!layer.magicMaskUri&&!gpuWand))return;
    if(wandWorking){Alert.alert('Un momento','Espera a que termine la previsualización.');return;}
    if(gpuWand){
      setBusy(true);
      try{
        const uri=await createMagicMask(layer.uri,gpuWand.x,gpuWand.y,{tolerance:gpuWand.tolerance,feather:gpuWand.feather,contiguous:false});
        useEditorStore.getState().update(layer.id,{magicMaskUri:uri});
        setGpuWand(null);
        // The PNG is persisted; press Save as sticker again after this step.
        Alert.alert('Máscara aplicada','La selección se guardó en la capa. Ahora puedes guardarla como sticker.');
      }catch(e){Alert.alert('Varita mágica',String(e));}
      finally{setBusy(false);}
      return;
    }
    setBusy(true);
    try{
      const {base64,width,height}=await renderStickerBase64(layer);
      const path=`${FileSystem.cacheDirectory}memeshop-sticker-${Date.now()}.png`;
      await FileSystem.writeAsStringAsync(path,base64,{encoding:FileSystem.EncodingType.Base64});
      await saveSticker({uri:path,width,height,name:`Recorte ${layer.name}`});
      Alert.alert('Sticker guardado','Ya está disponible en tu biblioteca de Stickers.',[
        {text:'Seguir editando'},
        {text:'Ver stickers',onPress:()=>{setTool(null);setStickersOpen(true);}}
      ]);
    }catch(e){Alert.alert('No se pudo guardar el sticker',String(e));}
    finally{setBusy(false);}
  };
  const refreshPalette=async()=>{try{const extracted=await canvas.current?.sampleColors();if(extracted?.length)setPalette(extracted);}catch(e){console.warn('No se pudo analizar el color',e);}};
  const choose=(next:Tool)=>{
    setPickingColor(false);
    if(next==='brush')void refreshPalette();
    if(next==='layers'){setLayersOpen(v=>!v);setTool(null);return;}
    if(next==='stickers'){setStickersOpen(true);setTool(null);return;}
    if(next==='images'){void importImage(false);return;}
    setLayersOpen(false);setTool(t=>t===next?null:next);
  };
  const insertSticker=async(asset:StickerAsset)=>{
    try{
      setImageLoading(true);
      // Copy into the project's own assets: deleting the sticker from the library must never break a project.
      const uri=await durableImage(asset.uri);
      addImage({uri,width:asset.width,height:asset.height,name:asset.name});setStickersOpen(false);
    }catch(e){Alert.alert('No se pudo insertar el sticker','El archivo del sticker no está disponible. Quizá fue eliminado o dañado.\n'+String(e));}
    finally{setImageLoading(false);}
  };
  const adjust=(key:'brightness'|'contrast'|'saturation',value:number)=>{
    if(!selected||selected.type!=='image')return;
    update(selected.id,{adjustments:{brightness:0,contrast:0,saturation:0,...selected.adjustments,[key]:Math.max(-1,Math.min(1,(selected.adjustments?.[key]??0)+value))}} as any);
  };
  const applyFilter=(name:string)=>{
    if(!selected||selected.type!=='image')return;
    if(name==='Sustituir color'){update(selected.id,{colorReplace:{source:replacementSource,target:replacementTarget,tolerance:0.15,softness:0.08,strength:1}} as any);setFilterPreset(name);return;}
    const presets:Record<string,[number,number,number]>={Ninguno:[0,0,0],Vibrante:[.03,.16,.48],Vintage:[.08,-.12,-.38],Desaturado:[0,.06,-1],Brillante:[.18,.08,.12],Dramático:[-.08,.4,-.3],Pastel:[.12,-.18,-.15],Frío:[-.03,.06,-.12],Cálido:[.09,.06,.22]};
    const [brightness,contrast,saturation]=presets[name]||[0,0,0];
    const glitchIndex=GLITCH_NAMES.indexOf(name);
    update(selected.id,{adjustments:{brightness,contrast,saturation},glitch:0,glitchSettings:glitchIndex<0?undefined:{mode:glitchIndex+1,intensity:0.65,density:0.55,seed:1337}} as any);
    setFilterPreset(name);
  };
  const normAngle=(a:number)=>Math.atan2(Math.sin(a),Math.cos(a));
  // A real mirror. Rendering is R(rotation)·F^flipX, so a mirror across the screen's vertical axis toggles flipX and negates
  // the rotation; across the horizontal axis it toggles flipX and maps rotation to π − rotation.
  const flip=(axis:'h'|'v')=>{
    if(!selected||selected.type!=='image'){Alert.alert('Voltear','Selecciona una capa de imagen para voltearla.');return;}
    update(selected.id,{flipX:!selected.flipX,rotation:normAngle(axis==='h'?-selected.rotation:Math.PI-selected.rotation)} as any);
  };
  const applyCrop=async()=>{
    if(!selected||selected.type!=='image'){Alert.alert('Recortar','Selecciona una capa de imagen para recortarla.');return;}
    const l=selected;
    const rect=cropRect(crop,l.width,l.height,!!l.flipX);
    if(isCropNoop(crop,rect)){setTool(null);return;}
    try{
      setBusy(true);
      const {px,frac}=pixelRect(rect,l.sourceWidth,l.sourceHeight);
      if(px.w<2||px.h<2)throw new Error('Recorte demasiado pequeño');
      const angle=cropLocalAngle(crop,!!l.flipX);
      let tmp:string,outW=px.w,outH=px.h;
      if(Math.abs(angle)<1e-4){
        const r=await ImageManipulator.manipulateAsync(l.uri,[{crop:{originX:px.x,originY:px.y,width:px.w,height:px.h}}],{format:ImageManipulator.SaveFormat.PNG});
        tmp=r.uri;outW=r.width;outH=r.height;
      }else{
        tmp=await cropAndStraighten(l.uri,l.width,l.height,frac,angle,px.w,px.h);
      }
      const uri=await durableImage(tmp);
      // Content stays in place; mask strokes are re-expressed in the new image's coordinates.
      const g=croppedGeometry(l,frac,angle);
      // La máscara de la varita/quitafondos cubre toda la imagen: se recorta con la misma transformación para que no se desalinee.
      let magicMaskUri=l.magicMaskUri;
      if(magicMaskUri){const m=await loadMaskImage(magicMaskUri);if(m)magicMaskUri=registerMask(await cropMaskImage(m,l.width,l.height,frac,angle));}
      update(l.id,{uri,sourceWidth:outW,sourceHeight:outH,x:g.x,y:g.y,width:g.width,height:g.height,maskStrokes:g.maskStrokes,magicMaskUri} as any);
      // The previous file is not deleted here: undo still needs it. pruneAssets() removes it once the project is closed.
      setTool(null);setCrop(initialCrop);
    }catch(e){Alert.alert('Error de recorte',String(e));}finally{setBusy(false);}
  };
  const removeBackground=async()=>{
    if(!selected||selected.type!=='image'){Alert.alert('Quitar fondo','Selecciona una capa de imagen.');return;}
    if(bgWorking)return;
    const layer=selected;
    setBgWorking(true);
    try{
      const r=await removeBackgroundAuto(layer.uri);
      if(!useEditorStore.getState().document?.layers.some(l=>l.id===layer.id)){releaseMask(r.key);return;}
      // Un solo paso de historial (no hay edición abierta): deshacer devuelve el fondo. Los trazos de goma anteriores se descartan.
      update(layer.id,{magicMaskUri:r.key,maskStrokes:undefined} as any);
    }catch(e){Alert.alert('Quitar fondo',e instanceof Error?e.message:String(e));}
    finally{setBgWorking(false);}
  };
  if(booting)return <View style={{flex:1,backgroundColor:'#071d08',alignItems:'center',justifyContent:'center'}}>
    <Image source={require('../assets/memeshop-logo.png')} style={{width:180,height:180,borderRadius:35}} resizeMode="contain" />
    <Text style={{color:'#fff',fontSize:24,fontWeight:'800',marginTop:18}}>MEMESHOP</Text>
    <ActivityIndicator color="#18e500" size="large" style={{marginTop:24}} />
  </View>;
  if(home)return <SafeAreaView style={{flex:1,backgroundColor:'white'}}><ProjectsHome projects={projects} onOpen={openProject} onCreate={newProject} onDelete={id=>{void deleteProject(id).then(()=>{void pruneAssets();return listProjects().then(setProjects);});}}/></SafeAreaView>;
  return <SafeAreaView style={styles.root}>
    <EditorHeader editing={editing} applyEdit={acceptAction} cancelEdit={discardAction} back={()=>{void goHome();}} undo={undo} redo={redo} canUndo={canUndo} canRedo={canRedo} exportImage={exportPreview} busy={busy} eraseImage={document && selected?.type==='image' ? ()=>{setMaskMode('erase');setTool('mask');setLayersOpen(false);} : undefined} eraseActive={tool==='mask'} removeBackground={document && selected?.type==='image' ? ()=>{void removeBackground();} : undefined} removeBackgroundBusy={bgWorking}/>
    <View style={styles.workspace}>{document?<PhotoCanvas key={`${document.width}-${document.height}`} ref={canvas} document={document} gpuWand={tool==='wand' ? gpuWand : null} mode={pickingColor?'eyedropper':tool==='brush'?'brush':tool==='mask'?'mask':tool==='wand'?'wand':'layer'} cropPreview={cropPreview} onWandPick={(x,y)=>void applyWand(x,y)} onPickColor={color=>{setBrushColor(color);setEraser(false);setPickingColor(false);setTool('brush');}} brush={{color:brushColor,size:brushSize,eraser,opacity:tool==='mask'?maskOpacity/100:brushOpacity/100,hardness:(tool==='mask'?maskHardness:brushHardness)/100,spread:tool==='mask'?maskSpread:brushSpread,restore:maskMode==='restore'}}/>:<View style={styles.empty}><Feather name="image" size={48} color="#aaa"/><Text style={styles.emptyTitle}>Comienza a crear</Text><MiniButton label="Elegir imagen" onPress={()=>importImage(true)}/></View>}{document && layersOpen && <LayersDrawer document={document} onClose={()=>setLayersOpen(false)}/>}</View>
    
    {document && tool && <View style={styles.sheetContainer}><Sheet title={{tools:'Herramientas',adjust:'Ajustes de imagen',brush:'Pincel',mask:'Borrar / restaurar',layers:'Capas',add:'Añadir elemento',transform:'Transformar capa',effects:'Efectos',crop:'Recortar',rotate:'Rotar',perspective:'Perspectiva',wand:'Varita mágica',text:'Texto',stickers:'Stickers',images:'Imágenes'}[tool]} onClose={()=>setTool(null)}>
      {tool==='wand' && <View style={{paddingHorizontal:12,paddingBottom:12,gap:6}}>
        <Text style={styles.help}>Toca el fondo. Global: quita todo lo que tenga ese color. Contiguo: solo la zona conectada al toque.</Text>
        <Text style={styles.field}>Tolerancia · {wandTolerance}%</Text>
        <Slider minimumValue={0} maximumValue={100} step={1} value={wandTolerance} onValueChange={setWandTolerance} minimumTrackTintColor="#18e500" thumbTintColor="#18e500"/>
        <Text style={styles.field}>Suavizado · {wandFeather}%</Text>
        <Slider minimumValue={0} maximumValue={100} step={1} value={wandFeather} onValueChange={setWandFeather} minimumTrackTintColor="#18e500" thumbTintColor="#18e500"/>
        <MiniButton label={wandContiguous?'Modo: Contiguo':'Modo: Global'} onPress={()=>setWandContiguous(v=>!v)}/>
        {wandWorking && <View style={{flexDirection:'row',alignItems:'center',gap:8}}><ActivityIndicator color="#18e500"/><Text style={styles.help}>Actualizando selección…</Text></View>}
        {wandPoint && wandLayerId===selected?.id && <Pressable disabled={wandWorking||busy} onPress={()=>void saveWandSticker()} style={{backgroundColor:wandWorking?'#315b32':'#18e500',padding:14,borderRadius:12,alignItems:'center'}}><Text style={{color:'#062208',fontWeight:'800'}}>{gpuWand?'Aplicar máscara GPU':'Guardar como sticker'}</Text></Pressable>}
        <MiniButton label="Restablecer fondo" onPress={resetWand}/>
      </View>}
      {tool==='text' && <View style={styles.panel}>
        {selected?.type !== 'text' ? <>
          <Text style={styles.help}>Añade una capa de texto independiente. Puedes moverla, girarla, duplicarla y editarla después.</Text>
          <Pressable onPress={addText} style={styles.textPrimary}><Feather name="type" size={18} color="#062208"/><Text style={styles.textPrimaryLabel}>Añadir texto</Text></Pressable>
        </> : <>
          <View style={styles.row}><Text style={styles.field}>Contenido</Text><MiniButton label="+ Otro texto" onPress={addText}/></View>
          <TextInput multiline value={selected.text} onChangeText={v=>update(selected.id,{text:v,name:v.split('\n')[0].slice(0,28)||'Texto'} as any)} placeholder="Escribe tu texto" placeholderTextColor="#777" style={styles.textInput}/>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:8,paddingVertical:6}}>
            {(['Fuente','Trazo','Color','Resaltador','Sombra'] as const).map((tab)=><Pressable key={tab} onPress={()=>setTextTab(tab)} style={{paddingHorizontal:13,paddingVertical:10,borderRadius:18,backgroundColor:textTab===tab?'#18e500':'#282828'}}><Text style={{color:textTab===tab?'#061b09':'#eee',fontWeight:'700'}}>{tab}</Text></Pressable>)}
          </ScrollView>
          {textTab==='Fuente' && <>
            <Text style={styles.field}>Tipografía</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:9}}>
              {['System','Arial','Helvetica','Georgia','Courier','Times','Impact'].map(f=><Pressable key={f} onPress={()=>update(selected.id,{fontFamily:f} as any)} style={{minWidth:104,padding:12,backgroundColor:(selected.fontFamily??'System')===f?'#185c2a':'#282828',borderRadius:10,borderWidth:1,borderColor:(selected.fontFamily??'System')===f?'#18e500':'#444'}}><Text style={{fontFamily:f==='System'?undefined:f==='Times'?'Times New Roman':f==='Courier'?'Courier New':f,fontSize:18,color:'white',textAlign:'center'}} numberOfLines={1}>{f}</Text></Pressable>)}
            </ScrollView>
            <Text style={styles.field}>Tamaño · {Math.round(selected.fontSize)} px</Text>
            <Slider minimumValue={Math.max(8,document.width*.012)} maximumValue={Math.max(32,document.width*.24)} step={1} value={selected.fontSize} onValueChange={v=>update(selected.id,{fontSize:v,height:Math.max(1,selected.text.split('\n').length*v*selected.lineHeight)} as any)} minimumTrackTintColor="#18e500" thumbTintColor="#18e500"/>
            <Text style={styles.field}>Alineación</Text>
            <View style={styles.row}>{(['left','center','right'] as const).map(a=><Pressable key={a} onPress={()=>update(selected.id,{align:a} as any)} style={[styles.mini,selected.align===a&&{backgroundColor:'#19672b'}]}><Text style={styles.miniText}>{a==='left'?'Izquierda':a==='center'?'Centro':'Derecha'}</Text></Pressable>)}</View>
            <Text style={styles.field}>Interlineado · {selected.lineHeight.toFixed(2)}</Text>
            <Slider minimumValue={0.8} maximumValue={2} step={0.05} value={selected.lineHeight} onValueChange={v=>update(selected.id,{lineHeight:v,height:Math.max(1,selected.text.split('\n').length*selected.fontSize*v)} as any)} minimumTrackTintColor="#18e500" thumbTintColor="#18e500"/>
          </>}
          {textTab==='Trazo' && <>
            <Text style={styles.field}>Grosor del contorno · {Math.round(selected.strokeWidth??0)} px</Text>
            <Slider minimumValue={0} maximumValue={Math.max(10,selected.fontSize*.2)} step={1} value={selected.strokeWidth??0} onValueChange={v=>update(selected.id,{strokeWidth:v} as any)} minimumTrackTintColor="#18e500" thumbTintColor="#18e500"/>
            <Text style={styles.field}>Color del trazo</Text>
            <View style={styles.row}>{['#000000','#ffffff','#18e500','#ff304f','#25c5ff','#ffe05a'].map(c=><Pressable key={c} onPress={()=>update(selected.id,{strokeColor:c} as any)} style={[styles.textSwatch,{backgroundColor:c,borderColor:selected.strokeColor===c?'#18e500':'#666',borderWidth:3}]}/>)}</View>
          </>}
          {textTab==='Color' && <>
            <Text style={styles.field}>Color del texto</Text>
            <View style={styles.row}>{['#ffffff','#000000','#18e500','#ff304f','#25c5ff','#ffe05a','#ff8800','#fa8fff'].map(c=><Pressable key={c} onPress={()=>update(selected.id,{color:c} as any)} style={[styles.textSwatch,{backgroundColor:c,borderColor:selected.color===c?'#18e500':'#666',borderWidth:3}]}/>)}</View>
          </>}
          {textTab==='Resaltador' && <>
            <MiniButton label="Sin resaltado" onPress={()=>update(selected.id,{highlightColor:null} as any)}/>
            <View style={styles.row}>{['#ffe05a','#18e500','#25c5ff','#ff304f','#ffffff'].map(c=><Pressable key={c} onPress={()=>update(selected.id,{highlightColor:c} as any)} style={[styles.textSwatch,{backgroundColor:c,borderColor:selected.highlightColor===c?'#18e500':'#666',borderWidth:3}]}/>)}</View>
          </>}
          {textTab==='Sombra' && <>
            <Text style={styles.field}>Distancia de sombra · {Math.round(selected.shadowBlur??0)} px</Text>
            <Slider minimumValue={0} maximumValue={Math.max(12,selected.fontSize*.3)} step={1} value={selected.shadowBlur??0} onValueChange={v=>update(selected.id,{shadowBlur:v} as any)} minimumTrackTintColor="#18e500" thumbTintColor="#18e500"/>
            <Text style={styles.field}>Color de sombra</Text>
            <View style={styles.row}>{['#000000','#ffffff','#18e500','#ff304f','#25c5ff'].map(c=><Pressable key={c} onPress={()=>update(selected.id,{shadowColor:c} as any)} style={[styles.textSwatch,{backgroundColor:c,borderColor:selected.shadowColor===c?'#18e500':'#666',borderWidth:3}]}/>)}</View>
          </>}
          <Text style={styles.help}>Para mover o redimensionar el texto, aplica los cambios y selecciona la capa en el lienzo.</Text>
        </>}
      </View>}
      {tool==='effects' && <View style={{paddingBottom:16}}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom:12}}>{['TODOS','COLORES','CÁMARA DIGITAL','ARTÍSTICOS','GLITCH'].map(c=><Pressable key={c} onPress={()=>setFilterCategory(c)} style={{padding:12,borderBottomWidth:filterCategory===c?2:0,borderBottomColor:'#19e500'}}><Text style={{color:filterCategory===c?'#19e500':'white',fontWeight:'600'}}>{c}</Text></Pressable>)}</ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>{FILTER_NAMES.filter((n,i)=>filterCategory==='TODOS'||filterCategory==='GLITCH'&&GLITCH_NAMES.includes(n)||filterCategory==='COLORES'&&i<11||filterCategory==='CÁMARA DIGITAL'&&i>=1&&i<7||filterCategory==='ARTÍSTICOS'&&i>=5&&i<11).map(name=><Pressable key={name} onPress={()=>applyFilter(name)} style={{marginRight:9,width:116,alignItems:'center'}}><View style={{width:110,height:76,backgroundColor:GLITCH_NAMES.includes(name)?'#173e29':'#444',borderRadius:12,borderWidth:filterPreset===name?2:0,borderColor:'#19e500',alignItems:'center',justifyContent:'center'}}><Feather name={GLITCH_NAMES.includes(name)?'zap':'image'} size={27} color="white"/></View><Text numberOfLines={2} style={{color:'white',fontSize:11,marginTop:7,textAlign:'center'}}>{name}</Text></Pressable>)}</ScrollView>
        {selected?.type==='image' && selected.colorReplace && <View style={{paddingHorizontal:12,paddingTop:12,gap:7}}>
          <Text style={styles.field}>Color original (selecciona uno)</Text>
          <View style={styles.row}>{['#18e500','#ffffff','#111111','#ff304f','#25c5ff','#ffe05a','#0000ff','#ff8800'].map(c=><Pressable key={c} onPress={()=>{setReplacementSource(c);update(selected.id,{colorReplace:{...selected.colorReplace!,source:c}} as any);}} style={{width:29,height:29,borderRadius:15,backgroundColor:c,borderWidth:selected.colorReplace!.source===c?3:1,borderColor:'#aaa'}}/>)}</View>
          <Text style={styles.field}>Sustituir por</Text>
          <View style={styles.row}>{['#18e500','#ffffff','#111111','#ff304f','#25c5ff','#ffe05a','#0000ff','#ff8800'].map(c=><Pressable key={c} onPress={()=>{setReplacementTarget(c);update(selected.id,{colorReplace:{...selected.colorReplace!,target:c}} as any);}} style={{width:29,height:29,borderRadius:15,backgroundColor:c,borderWidth:selected.colorReplace!.target===c?3:1,borderColor:'#aaa'}}/>)}</View>
          {([['tolerance','Sensibilidad'],['softness','Suavidad'],['strength','Intensidad']] as const).map(([key,label])=><View key={key}><Text style={styles.field}>{label} · {Math.round(selected.colorReplace![key]*100)}%</Text><Slider minimumValue={0} maximumValue={1} step={0.01} value={selected.colorReplace![key]} onValueChange={v=>update(selected.id,{colorReplace:{...selected.colorReplace!,[key]:v}} as any)} minimumTrackTintColor="#19e500" thumbTintColor="#19e500" /></View>)}
          <MiniButton label="Desactivar sustitución" onPress={()=>update(selected.id,{colorReplace:undefined} as any)}/>
        </View>}
        {selected?.type==='image' && selected.glitchSettings && <View style={{paddingHorizontal:12,paddingTop:12}}>
          <Text style={styles.field}>Intensidad · {Math.round(selected.glitchSettings.intensity*100)}%</Text>
          <Slider minimumValue={0} maximumValue={2} step={0.01} value={selected.glitchSettings.intensity} onValueChange={v=>update(selected.id,{glitchSettings:{...selected.glitchSettings!,intensity:v}} as any)} minimumTrackTintColor="#19e500" thumbTintColor="#19e500" />
          <Text style={styles.field}>Densidad · {Math.round(selected.glitchSettings.density*100)}%</Text>
          <Slider minimumValue={0} maximumValue={1} step={0.01} value={selected.glitchSettings.density} onValueChange={v=>update(selected.id,{glitchSettings:{...selected.glitchSettings!,density:v}} as any)} minimumTrackTintColor="#19e500" thumbTintColor="#19e500" />
          <View style={styles.row}><Text style={styles.field}>Patrón #{selected.glitchSettings.seed}</Text><MiniButton label="Variar patrón" onPress={()=>update(selected.id,{glitchSettings:{...selected.glitchSettings!,seed:selected.glitchSettings!.seed+1}} as any)}/><MiniButton label="Quitar glitch" onPress={()=>{update(selected.id,{glitchSettings:undefined,glitch:0} as any);setFilterPreset('Ninguno');}}/></View>
          <Text style={styles.help}>Pixel Sorting y Datamosh son aproximaciones visuales para fotografías estáticas.</Text>
        </View>}
        {selected?.type!=='image'&&<Text style={styles.help}>Selecciona una imagen para aplicar filtros.</Text>}
      </View>}
      {['crop','rotate','perspective'].includes(tool) && <View style={{paddingBottom:10}}><View style={{flexDirection:'row',justifyContent:'space-around',paddingVertical:12}}>{(['crop','rotate','perspective'] as Tool[]).map((t)=><Pressable key={t} onPress={()=>setTool(t)} style={{padding:12,borderRadius:12,backgroundColor:tool===t?'#383838':'transparent'}}><Text style={{color:'white',fontSize:15}}>{t==='crop'?'Recortar':t==='rotate'?'Rotar':'Perspectiva'}</Text></Pressable>)}</View>{tool==='crop'&&<CropPanel crop={crop} setCrop={setCrop} onApply={()=>void applyCrop()} hasImage={!!cropImage} busy={busy}/>}{tool==='rotate'&&<><View style={styles.row}><MiniButton label="↶ 90°" onPress={()=>{if(selected)update(selected.id,{rotation:selected.rotation-Math.PI/2});}}/><MiniButton label="↷ 90°" onPress={()=>{if(selected)update(selected.id,{rotation:selected.rotation+Math.PI/2});}}/><MiniButton label="Voltear horizontal" onPress={()=>flip('h')}/><MiniButton label="Voltear vertical" onPress={()=>flip('v')}/></View><Text style={styles.field}>Ángulo · {Math.round((selected?.rotation??0)*180/Math.PI)}°</Text><Slider minimumValue={-180} maximumValue={180} step={1} value={(selected?.rotation??0)*180/Math.PI} onValueChange={v=>{if(selected)update(selected.id,{rotation:v*Math.PI/180});}} minimumTrackTintColor="#19e500" thumbTintColor="#fff"/></>}{tool==='perspective'&&selected?.type==='image'&&<><Text style={styles.field}>Convergencia horizontal (proyectiva)</Text><Slider minimumValue={-.5} maximumValue={.5} value={selected.perspectiveX??0} onValueChange={v=>update(selected.id,{perspectiveX:v} as any)} minimumTrackTintColor="#19e500" thumbTintColor="#fff"/><Text style={styles.field}>Convergencia vertical (proyectiva)</Text><Slider minimumValue={-.5} maximumValue={.5} value={selected.perspectiveY??0} onValueChange={v=>update(selected.id,{perspectiveY:v} as any)} minimumTrackTintColor="#19e500" thumbTintColor="#fff"/></>}</View>}
      {tool==='tools' && <View style={styles.grid}><SheetButton icon="crop" title="Recortar" onPress={()=>{setCrop(initialCrop);setTool('crop');}}/><SheetButton icon="target" title="Varita mágica" onPress={()=>setTool('wand')}/><SheetButton icon="sliders" title="Ajustar" onPress={()=>setTool('adjust')}/><SheetButton icon="move" title="Transformar" onPress={()=>setTool('transform')}/><SheetButton icon="layers" title="Capas" onPress={()=>setTool('layers')}/><SheetButton icon="edit-3" title="Dibujar" onPress={()=>{if(!selected||selected.type!=='paint')addPaint();setTool('brush');}}/><SheetButton icon="plus-square" title="Añadir" onPress={()=>setTool('add')}/></View>}
      {tool==='add' && <View style={styles.grid}><SheetButton icon="image" title="Imagen" onPress={()=>importImage(false)}/><SheetButton icon="edit-3" title="Pintura" onPress={()=>{addPaint();setTool('brush');}}/><SheetButton icon="type" title="Texto" onPress={()=>{addText();setTool('text');}}/><SheetButton icon="square" title="Forma" onPress={()=>{addShape();setTool('layers');}}/><SheetButton icon="refresh-cw" title="Nueva foto" onPress={()=>importImage(true)}/></View>}
      {tool==='mask' && <BrushControls kind="mask" mode={maskMode} setMode={setMaskMode} size={brushSize} setSize={setBrushSize} spread={maskSpread} setSpread={setMaskSpread} opacity={maskOpacity} setOpacity={setMaskOpacity} hardness={maskHardness} setHardness={setMaskHardness} />}
      {tool==='brush' && <BrushControls kind="paint" spread={brushSpread} setSpread={setBrushSpread} size={brushSize} setSize={setBrushSize} opacity={brushOpacity} setOpacity={setBrushOpacity} hardness={brushHardness} setHardness={setBrushHardness} color={brushColor} setColor={c=>{setBrushColor(c);setEraser(false);}} eraser={eraser} setEraser={setEraser} palette={palette} onEyedropper={()=>{setPickingColor(true);setTool(null);}} onRefreshPalette={()=>{void refreshPalette();}} />}
      {tool==='layers' && <ScrollView style={styles.layers}>{[...document.layers].reverse().map(l=><Pressable key={l.id} onPress={()=>select(l.id)} style={[styles.layer,l.id===document.selectedId&&styles.layerActive]}><Feather name={l.type==='image'?'image':l.type==='paint'?'edit-3':l.type==='text'?'type':'square'} size={18} color="#ddd"/><Text style={styles.layerName} numberOfLines={1}>{l.name}</Text><Text style={styles.value}>{Math.round(l.opacity*100)}%</Text><MiniButton label={l.visible?'◉':'○'} onPress={()=>update(l.id,{visible:!l.visible})}/></Pressable>)}</ScrollView>}
      {tool==='adjust' && <View style={styles.panel}>{selected?.type==='image'?(['brightness','contrast','saturation'] as const).map(k=><View key={k} style={styles.row}><Text style={styles.field}>{k==='brightness'?'Brillo':k==='contrast'?'Contraste':'Saturación'}</Text><MiniButton label="−" onPress={()=>adjust(k,-.1)}/><Text style={styles.value}>{(selected.adjustments?.[k]??0).toFixed(1)}</Text><MiniButton label="+" onPress={()=>adjust(k,.1)}/></View>):<Text style={styles.help}>Selecciona una capa de imagen para ajustar.</Text>}</View>}
      {tool==='transform' && <View style={styles.panel}>{selected?<><View style={styles.row}><MiniButton label="←" onPress={()=>update(selected.id,{x:selected.x-document.width*.025})}/><MiniButton label="→" onPress={()=>update(selected.id,{x:selected.x+document.width*.025})}/><MiniButton label="↑" onPress={()=>update(selected.id,{y:selected.y-document.height*.025})}/><MiniButton label="↓" onPress={()=>update(selected.id,{y:selected.y+document.height*.025})}/><MiniButton label="↺" onPress={()=>update(selected.id,{rotation:selected.rotation-Math.PI/12})}/><MiniButton label="↻" onPress={()=>update(selected.id,{rotation:selected.rotation+Math.PI/12})}/></View><View style={styles.row}><Text style={styles.field}>Tamaño</Text><MiniButton label="−" onPress={()=>update(selected.id,{width:selected.width*.9,height:selected.height*.9})}/><MiniButton label="+" onPress={()=>update(selected.id,{width:selected.width*1.1,height:selected.height*1.1})}/><Text style={styles.field}>Opacidad</Text><MiniButton label="−" onPress={()=>update(selected.id,{opacity:selected.opacity-.1})}/><Text style={styles.value}>{Math.round(selected.opacity*100)}%</Text><MiniButton label="+" onPress={()=>update(selected.id,{opacity:selected.opacity+.1})}/></View><View style={styles.row}><MiniButton label="Subir" onPress={()=>move(selected.id,1)}/><MiniButton label="Bajar" onPress={()=>move(selected.id,-1)}/><MiniButton label="Duplicar" onPress={()=>duplicate(selected.id)}/><MiniButton label="Eliminar" onPress={()=>remove(selected.id)}/></View></>:<Text style={styles.help}>Selecciona una capa para transformarla.</Text>}</View>}
    </Sheet></View>}
    {pickingColor && <Pressable style={styles.pickerBanner} onPress={()=>{setPickingColor(false);setTool('brush');}}><Text style={{color:'white'}}>Mantén pulsado y arrastra el cuentagotas · Toca aquí para cancelar</Text></Pressable>}
    {document && <EditorToolbar active={layersOpen?'layers':tool} onSelect={choose}/>}
    {document && stickersOpen && <StickerLibrary onInsert={insertSticker} onClose={()=>setStickersOpen(false)}/>}
    {(busy||imageLoading||bgWorking)&&<ActivityIndicator color="#19e500" style={styles.busy}/>}
  </SafeAreaView>;
}
const styles=StyleSheet.create({root:{flex:1,backgroundColor:'#101010'},headerWrap:{position:'relative',zIndex:5},topEraser:{position:'absolute',right:105,top:11,alignItems:'center',justifyContent:'center',padding:5,borderRadius:9,minWidth:50},topEraserActive:{backgroundColor:'#5c2658'},topEraserText:{color:'#fff',fontSize:10},workspace:{flex:1,backgroundColor:'#1a1a1a'},empty:{flex:1,alignItems:'center',justifyContent:'center',gap:20},emptyTitle:{color:'#fff',fontSize:22,fontWeight:'600'},sheetContainer:{maxHeight:'49%'},grid:{flexDirection:'row',flexWrap:'wrap'},panel:{gap:12,paddingBottom:8},row:{flexDirection:'row',alignItems:'center',flexWrap:'wrap',gap:9},mini:{backgroundColor:'#303030',paddingHorizontal:13,paddingVertical:10,borderRadius:9},miniText:{color:'#fff',fontSize:12,fontWeight:'600'},field:{color:'#ddd',fontSize:13,minWidth:75},value:{color:'#ccc',fontSize:12},help:{color:'#aaa',fontSize:12},swatch:{height:30,width:30,borderRadius:15,borderWidth:3},layers:{maxHeight:260},layer:{flexDirection:'row',alignItems:'center',gap:10,padding:8,borderRadius:10},layerActive:{backgroundColor:'#42303e'},layerName:{flex:1,color:'#fff',fontSize:13},busy:{position:'absolute',top:80,alignSelf:'center'},pickerBanner:{backgroundColor:'#342137',padding:12,alignItems:'center'},textPrimary:{backgroundColor:'#18e500',padding:13,borderRadius:12,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8},textPrimaryLabel:{color:'#062208',fontWeight:'800'},textInput:{color:'#fff',backgroundColor:'#292929',borderRadius:10,borderWidth:1,borderColor:'#555',padding:12,minHeight:72,textAlignVertical:'top',fontSize:17},textSwatch:{width:31,height:31,borderRadius:16},maskShortcut:{position:'absolute',top:8,right:15,backgroundColor:'#29212d',borderRadius:18,paddingHorizontal:12,paddingVertical:9,flexDirection:'row',alignItems:'center',gap:6,borderWidth:1,borderColor:'#c343b7'}});
