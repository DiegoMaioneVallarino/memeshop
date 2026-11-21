/** Local colour-key / contiguous magic wand. No network, no model. */
import { Skia } from '@shopify/react-native-skia';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';

export type WandSettings = { tolerance: number; feather: number; contiguous: boolean };
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
const u32=(v:number)=>[(v>>>24)&255,(v>>>16)&255,(v>>>8)&255,v&255];
let crcTable:Uint32Array|undefined;
function crc(bytes:number[]){
  if(!crcTable){crcTable=new Uint32Array(256);for(let i=0;i<256;i++){let c=i;for(let j=0;j<8;j++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;crcTable[i]=c>>>0;}}
  let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;
}
function chunk(name:string,data:number[]){const type=Array.from(name).map(c=>c.charCodeAt(0));return [...u32(data.length),...type,...data,...u32(crc([...type,...data]))];}
function adler(data:Uint8Array){let a=1,b=0;for(let i=0;i<data.length;i++){a=(a+data[i])%65521;b=(b+a)%65521;}return ((b<<16)|a)>>>0;}
function encodePNG(w:number,h:number,alpha:Uint8Array):Uint8Array{
  const raw=new Uint8Array(h*(1+w*4));let p=0;
  for(let y=0;y<h;y++){raw[p++]=0;for(let x=0;x<w;x++){raw[p++]=255;raw[p++]=255;raw[p++]=255;raw[p++]=alpha[y*w+x];}}
  const z:number[]=[0x78,0x01];for(let i=0;i<raw.length;){const n=Math.min(65535,raw.length-i),end=i+n===raw.length;z.push(end?1:0,n&255,n>>>8,(~n)&255,((~n)>>>8)&255);for(let j=0;j<n;j++)z.push(raw[i+j]);i+=n;}
  z.push(...u32(adler(raw)));
  return Uint8Array.from([137,80,78,71,13,10,26,10,...chunk('IHDR',[...u32(w),...u32(h),8,6,0,0,0]),...chunk('IDAT',z),...chunk('IEND',[])]);
}
const b64=(bytes:Uint8Array)=>{const chars='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';let out='';for(let i=0;i<bytes.length;i+=3){const a=bytes[i],b=bytes[i+1],c=bytes[i+2];out+=chars[a>>>2]+chars[((a&3)<<4)|((b??0)>>>4)]+(i+1<bytes.length?chars[((b&15)<<2)|((c??0)>>>6)]:'=')+(i+2<bytes.length?chars[c&63]:'=');}return out;};
function linear(v:number){v/=255;return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4);}
function oklab(r:number,g:number,b:number){r=linear(r);g=linear(g);b=linear(b);const l=Math.cbrt(.4122214708*r+.5363325363*g+.0514459929*b),m=Math.cbrt(.2119034982*r+.6806995451*g+.1073969566*b),s=Math.cbrt(.0883024619*r+.2817188376*g+.6299787005*b);return [.2104542553*l+.793617785*m-.0040720468*s,1.9779984951*l-2.428592205*m+.4505937099*s,.0259040371*l+.7827717662*m-.808675766*s];}
function featherMask(alpha:Uint8Array,w:number,h:number,r:number){if(r<=0)return alpha;const temp=new Float32Array(w*h),out=new Uint8Array(w*h);const k=Math.min(16,Math.max(1,Math.round(r)));for(let y=0;y<h;y++)for(let x=0;x<w;x++){let sum=0,n=0;for(let dx=-k;dx<=k;dx++){const xx=clamp(x+dx,0,w-1);sum+=alpha[y*w+xx];n++;}temp[y*w+x]=sum/n;}for(let y=0;y<h;y++)for(let x=0;x<w;x++){let sum=0,n=0;for(let dy=-k;dy<=k;dy++){sum+=temp[clamp(y+dy,0,h-1)*w+x];n++;}out[y*w+x]=Math.round(sum/n);}return out;}
/** Coordinates are normalized 0..1 relative to the selected image. */
export async function createMagicMask(uri:string,nx:number,ny:number,settings:WandSettings):Promise<string>{
  const resized=await ImageManipulator.manipulateAsync(uri,[{resize:{width:768}}],{format:ImageManipulator.SaveFormat.PNG});
  const data=await Skia.Data.fromURI(resized.uri);
  const image=Skia.Image.MakeImageFromEncoded(data);
  if(!image)throw new Error('No se pudo decodificar la imagen');
  const w=image.width(),h=image.height();
  const pixels=image.readPixels(0,0);
  if(!pixels||pixels.length<w*h*4)throw new Error('No se pudieron leer los píxeles');
  const sx=clamp(Math.floor(nx*w),0,w-1),sy=clamp(Math.floor(ny*h),0,h-1),seed=(sy*w+sx)*4;
  const ref=oklab(pixels[seed],pixels[seed+1],pixels[seed+2]);
  const selected=new Uint8Array(w*h),visited=new Uint8Array(w*h);
  const threshold=.008+settings.tolerance/100*.45;
  const similar=(idx:number)=>{const p=idx*4;const lab=oklab(pixels[p],pixels[p+1],pixels[p+2]);return Math.hypot(lab[0]-ref[0],lab[1]-ref[1],lab[2]-ref[2])<=threshold;};
  if(settings.contiguous){const stack:number[]=[sy*w+sx];visited[sy*w+sx]=1;while(stack.length){const i=stack.pop()!;if(!similar(i))continue;selected[i]=1;const x=i%w,y=(i/w)|0;const add=(n:number)=>{if(!visited[n]){visited[n]=1;stack.push(n);}};if(x>0)add(i-1);if(x<w-1)add(i+1);if(y>0)add(i-w);if(y<h-1)add(i+w);}}
  else for(let i=0;i<w*h;i++)selected[i]=similar(i)?1:0;
  const alpha=new Uint8Array(w*h);for(let i=0;i<alpha.length;i++)alpha[i]=selected[i]?0:255;
  const soft=featherMask(alpha,w,h,settings.feather/100*12);
  const filename=`${FileSystem.documentDirectory}memeshop-wand-${Date.now()}-${Math.floor(Math.random()*1e6)}.png`;
  await FileSystem.writeAsStringAsync(filename,b64(encodePNG(w,h,soft)),{encoding:FileSystem.EncodingType.Base64});
  return filename;
}
