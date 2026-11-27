export const COLOR_LAB_SHADER = `
uniform shader source;
uniform float2 dimensions;
uniform float3 gradientColors[3];
uniform float midpoint, gradientStrength;
uniform float3 paletteColors[16];
uniform float paletteCount, paletteStrength, ditherMode, levels, cellSize, ditherStrength;
float bayer(float2 p){
 float2 q=mod(p,4.0); float2 lo=mod(q,2.0); float2 hi=floor(q/2.0);
 float a=2.0*lo.x+3.0*lo.y-4.0*lo.x*lo.y;
 float b=2.0*hi.x+3.0*hi.y-4.0*hi.x*hi.y;
 return (4.0*a+b+0.5)/16.0-0.5;
}
half4 main(float2 p){
 half4 c=source.eval(p); if(c.a<=0.0) return c;
 float3 rgb=clamp(float3(c.rgb)/float(c.a),0.0,1.0);
 float l=dot(rgb,float3(.2126,.7152,.0722));
 float3 g=l<midpoint?mix(gradientColors[0],gradientColors[1],l/midpoint):mix(gradientColors[1],gradientColors[2],(l-midpoint)/(1.0-midpoint));
 rgb=mix(rgb,g,gradientStrength);
 float2 q=floor(p/max(dimensions,float2(1.0))*1024.0/cellSize);
 float noise=ditherMode>0.5?fract(sin(dot(q,float2(12.9898,78.233)))*43758.5453)-0.5:bayer(q);
 if(ditherStrength>0.0){ float n=levels-1.0; float3 quant=floor(clamp(rgb+noise/n,0.0,1.0)*n+0.5)/n; rgb=mix(rgb,quant,ditherStrength); }
 if(paletteCount>0.0 && paletteStrength>0.0){ float best=100.0; float3 chosen=rgb; for(int i=0;i<16;i++){ if(float(i)<paletteCount){float3 delta=rgb-paletteColors[i];float dist=dot(delta*delta,float3(.3,.59,.11));if(dist<best){best=dist;chosen=paletteColors[i];}}} rgb=mix(rgb,chosen,paletteStrength); }
 return half4(half3(clamp(rgb,0.0,1.0)*float(c.a)),c.a);
}`;
