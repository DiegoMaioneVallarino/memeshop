export type ColorLab = { gradient?: { colors: string[]; midpoint: number; strength: number }; palette?: { colors: string[]; strength: number }; dither?: { mode: 'bayer' | 'noise'; levels: number; size: number; strength: number } };
export const DEFAULT_GRADIENT = { colors: ['#15102f','#d84d88','#ffe5a0'], midpoint: .5, strength: 1 };
export const DEFAULT_PALETTE = { colors: ['#101820','#e84a5f','#ffcb77','#f7fff7'], strength: 1 };
export const DEFAULT_DITHER = { mode: 'bayer' as const, levels: 4, size: 2, strength: 1 };
export function colorVector(hex: string): number[] { return /^#[0-9a-f]{6}$/i.test(hex) ? [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255) : [0,0,0]; }
export function extractPalette(pixels: ArrayLike<number>, count: number): string[] {
  const bins = new Map<number, {n:number;r:number;g:number;b:number}>();
  const stride = Math.max(1, Math.ceil(pixels.length / 4 / 24000));
  for(let i=0;i+3<pixels.length;i+=4*stride){
    if(pixels[i+3]<240) continue;
    const [r,g,b]=[pixels[i],pixels[i+1],pixels[i+2]];
    const key=(r>>5)*64+(g>>5)*8+(b>>5);
    const v=bins.get(key)??{n:0,r:0,g:0,b:0}; v.n++;v.r+=r;v.g+=g;v.b+=b;bins.set(key,v);
  }
  return [...bins.values()].sort((a,b)=>b.n-a.n).slice(0,Math.max(1,Math.min(16,count))).map(v=>'#'+[v.r,v.g,v.b].map(c=>Math.round(c/v.n).toString(16).padStart(2,'0')).join(''));
}
export function colorLabUniforms(lab: ColorLab, width:number,height:number){
 const g=lab.gradient,p=lab.palette,d=lab.dither; const colors=p?.colors.slice(0,16)??[];
 return { dimensions:[width,height], gradientColors:Array.from({length:3},(_,i)=>colorVector(g?.colors[i]??DEFAULT_GRADIENT.colors[i])).flat(), midpoint:Math.max(.01,Math.min(.99,g?.midpoint??.5)), gradientStrength:g?.strength??0, paletteColors:Array.from({length:16},(_,i)=>colorVector(colors[i]??'#000000')).flat(), paletteCount:colors.length,paletteStrength:p?.strength??0,ditherMode:d?.mode==='noise'?1:0,levels:Math.max(2,d?.levels??4),cellSize:Math.max(1,d?.size??1),ditherStrength:d?.strength??0 };
}
