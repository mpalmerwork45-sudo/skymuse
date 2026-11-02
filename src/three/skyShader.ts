import * as THREE from 'three';
import type { WorldSpec } from '../science/worlds';
import type { SkyState } from '../science/atmosphere';
import type { TransportResult } from '../science/transport';
import type { AstronomyState } from '../science/astronomy';
import { BANDS, BAND_RGB, linearHex } from '../science/spectrum';
import { direction, DEG } from '../science/geometry';

export const fullScreenVertex=`varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`;
export const projectionGLSL=`
const float PI=3.141592653589793;
uniform vec2 uResolution;
uniform vec3 uForward,uRight,uUp;
uniform float uFov,uYaw;
uniform bool uFisheye;
vec3 rayDirection(vec2 uv){
 vec2 p=uv*2.-1.;
 if(uFisheye){p*=uResolution/min(uResolution.x,uResolution.y)/.86;
  float theta=length(p)*PI*.5,az=atan(p.x,p.y)+uYaw;
  return vec3(sin(theta)*sin(az),cos(theta),-sin(theta)*cos(az));}
 p.x*=uResolution.x/uResolution.y;
 return normalize(uForward+(uRight*p.x+uUp*p.y)*tan(uFov*.5));
}
float fisheyeMask(vec2 uv){return uFisheye?step(length((uv*2.-1.)*uResolution/min(uResolution.x,uResolution.y)/.86),1.):1.;}
`;
const fragment=`precision highp float;
varying vec2 vUv;
${projectionGLSL}
uniform sampler2D uSky,uColumns,uSpectral;
uniform float uSkyWidth,uSkyHeight,uSunRadius,uRadius,uHeight,uTemperature;
uniform vec3 uSun,uGroundDirect,uGroundDiffuse,uGroundColour;
uniform vec4 uProfiles;
uniform bool uTerrain,uRings;
uniform vec3 uRingNormal,uRingOrigin;
uniform int uBodyCount;
uniform vec4 uBodies[12];
uniform vec4 uBodyColour[12];
float sq(float x){return x*x;}
vec2 skyUV(vec3 d){
 float az=atan(d.x,-d.z),sunAz=atan(uSun.x,-uSun.z);
 float diff=abs(mod(az-sunAz+PI,2.*PI)-PI);
 float h=sqrt(max(0.,asin(clamp(d.y,-1.,1.)))/(PI*.5));
 return vec2((diff/PI*(uSkyWidth-1.)+.5)/uSkyWidth,(h*(uSkyHeight-1.)+.5)/uSkyHeight);
}
vec4 column(vec3 d){float h=sqrt(max(0.,asin(clamp(d.y,-1.,1.)))/(PI*.5));return texture2D(uColumns,vec2((h*(uSkyHeight-1.)+.5)/uSkyHeight,.5));}
vec3 spectralLight(vec4 cols,bool disc){
 vec3 c=vec3(0.);
 for(int i=0;i<48;i++){
  float x=(float(i)+.5)/48.;
  vec4 ext=texture2D(uSpectral,vec2(x,.125));
  vec3 light=texture2D(uSpectral,vec2(x,disc?.625:.375)).rgb;
  c+=light*exp(-dot(ext,cols));
 }return c;
}
float angle(vec3 a,vec3 b){return atan(length(cross(a,b)),dot(a,b));}
float coverage(float separation,float radius,float pixel){
 // Small objects use a unit-integral Gaussian PSF, preserving total angular flux.
 if(radius<pixel*.75){float sigma=pixel*.55;return sq(radius)/(2.*sq(sigma))*exp(-.5*sq(separation/sigma));}
 return 1.-smoothstep(radius-pixel*.5,radius+pixel*.5,separation);
}
float sphere(vec3 relative,vec3 d,float radius){
 float b=dot(relative,d),perp=length(cross(relative,d));
 if(perp>=radius)return -1.;
 float q=sqrt(max(0.,radius*radius-perp*perp));
 float t=-b-q;return t>0.?t:(-b+q>0.?-b+q:-1.);
}
float terrainHeight(vec2 p){
 if(!uTerrain)return 0.;
 float taper=1.-exp(-dot(p,p)/.03);
 return taper*(.012*sin(p.x*4.1)*sin(p.y*3.2)+.004*sin(p.x*19.2+p.y*7.1));
}
float surfaceY(vec2 p){float r2=dot(p,p);return -r2/(uRadius+sqrt(max(0.,uRadius*uRadius-r2)))+terrainHeight(p);}
float terrainHit(vec3 ray){
 float b=(uRadius+uHeight)*ray.y,c=uHeight*(2.*uRadius+uHeight),dis=b*b-c;
 float base=dis>=0.&&b<0.?c/(-b+sqrt(max(0.,dis))):-1.;
 if(!uTerrain)return base;
 if(ray.y>.08)return -1.;
 float t=0.;
 for(int j=0;j<96;j++){
  vec3 p=vec3(0.,uHeight,0.)+ray*t;float h=p.y-surfaceY(p.xz);
  if(h<.00005)return t;
  t+=clamp(h*.8/(.12+max(0.,-ray.y)),.0001,.5);
  if(t>35.)break;
 }return base;
}
float terrainShadow(vec3 p,vec3 light){
 if(light.y<-.1)return 0.;
 float t=.002;
 for(int j=0;j<24;j++){
  vec3 q=p+light*t;
  if(q.y<surfaceY(q.xz))return 0.;
  t+=.005*pow(1.45,float(j));
 }return 1.;
}
vec4 foregroundColumn(vec3 ray,float distance){
 vec4 c=vec4(0.);
 for(int j=0;j<24;j++){
  float a=distance*sq(float(j)/24.),b=distance*sq(float(j+1)/24.);
  vec3 p=vec3(0.,uRadius+uHeight,0.)+ray*(a+b)*.5;
  float h=max(0.,length(p)-uRadius);
  c+=(b-a)*vec4(exp(-h/uProfiles.x)/uProfiles.x,exp(-h/uProfiles.y)/uProfiles.y,
    exp(-.5*sq((h-25.)/8.))/(8.*2.506628*.99911),
    exp(-.5*sq((h-uProfiles.z)/uProfiles.w))/(uProfiles.w*2.506628));
 }return c;
}
vec3 capSample(int i,int n){
 float pair=floor(float(i)*.5);
 float c=1.-(1.-cos(uSunRadius))*(pair+.5)/(float(n)*.5),ss=sqrt(max(0.,1.-c*c));
 vec3 a=normalize(cross(abs(uSun.y)<.9?vec3(0.,1.,0.):vec3(1.,0.,0.),uSun)),b=cross(uSun,a);
 float phi=pair*2.39996323+mod(float(i),2.)*PI;
 return c*uSun+ss*(cos(phi)*a+sin(phi)*b);
}
float bodyLighting(vec3 point,vec3 normal){
 float light=0.;
 for(int i=0;i<16;i++){
  vec3 d=capSample(i,16);
  float shadow=sphere(point-uRingOrigin,d,uRadius)>0.?0.:1.;
  light+=max(0.,dot(normal,d))*shadow;
 }return light/16.*2./(1.+cos(uSunRadius));
}
vec2 ringBand(float r){
 if(r<74658.||r>136775.)return vec2(0.);
 if(r>=117580.&&r<122170.)return vec2(.08,.35);
 if(r>=133410.&&r<133740.)return vec2(0.);
 if(r>=136480.&&r<136520.)return vec2(0.);
 if(r<92000.)return vec2(.15,.3);
 if(r<117580.)return vec2(1.5,.65);
 return vec2(.5,.55);
}
void main(){
 if(fisheyeMask(vUv)<.5){gl_FragColor=vec4(0.);return;}
 vec3 ray=rayDirection(vUv),sky=texture2D(uSky,skyUV(ray)).rgb;
 vec4 cols=column(ray);float pixel=sqrt(length(cross(dFdx(ray),dFdy(ray))));
 float hit=terrainHit(ray),opacity=0.;
 vec3 light=sky;
 if(hit>=0.){
  vec3 p=vec3(0.,uHeight,0.)+ray*hit;
  float e=.0002;vec3 normal=normalize(vec3(surfaceY(p.xz-vec2(e,0.))-surfaceY(p.xz+vec2(e,0.)),2.*e,surfaceY(p.xz-vec2(0.,e))-surfaceY(p.xz+vec2(0.,e))));
  float diffuseFactor=.5*(1.+normal.y),beam=0.,flatBeam=0.;
  for(int i=0;i<16;i++){vec3 d=capSample(i,16);flatBeam+=max(0.,d.y);beam+=max(0.,dot(normal,d))*terrainShadow(p,d);}
  float textureFactor=1.;
  light=(uGroundDiffuse*diffuseFactor+uGroundDirect*beam/max(flatBeam,1e-8))*textureFactor;
  // Exact finite-path extinction quadrature; homogeneous source-function
  // approximation for nearby terrain inscattering (documented separately).
  vec4 localCols=foregroundColumn(ray,hit);
  vec3 trans=vec3(0.),norm=vec3(0.),fraction=vec3(0.);
  for(int i=0;i<48;i++){float x=(float(i)+.5)/48.;vec3 e0=texture2D(uSpectral,vec2(x,.375)).rgb;
   vec4 ext=texture2D(uSpectral,vec2(x,.125));float tr=exp(-dot(ext,localCols));
   norm+=e0;trans+=e0*tr;fraction+=e0*(1.-tr)/max(1.-exp(-dot(ext,cols)),1e-9);}
  trans=clamp(trans/max(norm,vec3(.000001)),0.,1.);
  light=light*trans+sky*clamp(fraction/max(norm,vec3(.000001)),0.,1.);opacity=1.;
 }else{
  float disc=coverage(angle(ray,uSun),uSunRadius,pixel);
  if(disc>1e-8) {light+=spectralLight(cols,true)*disc;opacity=max(opacity,min(1.,disc));}
  float nearest=1e30;
  for(int i=0;i<12;i++){
   if(i>=uBodyCount)break;
   vec3 centre=uBodies[i].xyz;float radius=uBodies[i].w,dist=length(centre);
   float sep=angle(ray,centre/dist),ar=asin(radius/dist),cover=coverage(sep,ar,pixel);
   if(cover<1e-7||dist>=nearest)continue;
   float t=sphere(-centre,ray,radius);
   vec3 normal=t>0.?normalize(ray*t-centre):-centre/dist;
   float phase=bodyLighting(t>0.?ray*t:centre,normal);
   if(ar<pixel*.75){float a=acos(clamp(dot(-centre/dist,uSun),-1.,1.));phase=2./3.*(sin(a)+(PI-a)*cos(a))/PI;}
   vec3 colour=spectralLight(cols,false)*uBodyColour[i].rgb*uBodyColour[i].a*phase;
   light=mix(light,sky+colour,clamp(cover,0.,1.));opacity=max(opacity,clamp(cover,0.,1.));nearest=dist;
  }
  if(uRings){
   float denom=dot(ray,uRingNormal),t=dot(uRingOrigin,uRingNormal)/denom;
   if(abs(denom)>1e-7&&t>0.&&t<nearest){
    vec3 p=ray*t;vec2 band=ringBand(length(p-uRingOrigin));
    float alpha=1.-exp(-band.x/max(abs(denom),1e-6));
    float lit=0.;
    for(int i=0;i<16;i++){vec3 d=capSample(i,16);if(sphere(p-uRingOrigin,d,uRadius)<0.)lit+=max(0.,dot(uRingNormal,d)*sign(-denom));}
    vec3 colour=spectralLight(cols,false)*vec3(1.,.96,.88)*band.y*lit/16.;
    light=mix(light,sky+colour,alpha);opacity=max(opacity,alpha);
   }
  }
 }
 gl_FragColor=vec4(light,opacity);
}
`;
export function createSkyMaterial(){
 const uniforms={
  uResolution:{value:new THREE.Vector2(1280,800)},uForward:{value:new THREE.Vector3(1,0,0)},uRight:{value:new THREE.Vector3(0,0,1)},uUp:{value:new THREE.Vector3(0,1,0)},uFov:{value:60*DEG},uYaw:{value:0},uFisheye:{value:false},
  uSky:{value:new THREE.DataTexture(new Float32Array(4),1,1,THREE.RGBAFormat,THREE.FloatType)},
  uColumns:{value:new THREE.DataTexture(new Float32Array(4),1,1,THREE.RGBAFormat,THREE.FloatType)},
  uSpectral:{value:new THREE.DataTexture(new Float32Array(BANDS*4*4),BANDS,4,THREE.RGBAFormat,THREE.FloatType)},
  uSkyWidth:{value:1},uSkyHeight:{value:1},uSun:{value:new THREE.Vector3()},uSunRadius:{value:.00465},uRadius:{value:6371},uHeight:{value:.0017},uTemperature:{value:288},
  uGroundDirect:{value:new THREE.Vector3()},uGroundDiffuse:{value:new THREE.Vector3()},uGroundColour:{value:new THREE.Vector3()},uTerrain:{value:true},
  uProfiles:{value:new THREE.Vector4(8.4,1.2,3,1)},
  uRings:{value:false},uRingNormal:{value:new THREE.Vector3()},uRingOrigin:{value:new THREE.Vector3()},uBodyCount:{value:0},
  uBodies:{value:Array.from({length:12},()=>new THREE.Vector4())},uBodyColour:{value:Array.from({length:12},()=>new THREE.Vector4())},
 };
 for(const tex of [uniforms.uSky.value,uniforms.uColumns.value,uniforms.uSpectral.value]){tex.needsUpdate=true;tex.minFilter=THREE.LinearFilter;tex.magFilter=THREE.LinearFilter;}
 const material=new THREE.ShaderMaterial({uniforms,vertexShader:fullScreenVertex,fragmentShader:fragment,depthTest:false,depthWrite:false});
 return {uniforms,material};
}
export type SkyUniforms=ReturnType<typeof createSkyMaterial>['uniforms'];
export function updateSkyUniforms(u:SkyUniforms,w:WorldSpec,s:SkyState,a:AstronomyState){
 u.uSun.value.fromArray(direction(s.sunAzDeg,s.sunElevDeg));u.uSunRadius.value=s.starAngularDeg*DEG/2;
 u.uRadius.value=w.radiusKm;u.uHeight.value=s.observerHeightKm??.0017;u.uTemperature.value=w.temperatureK;
 u.uProfiles.value.set(Math.max(.1,w.scaleHeightKm),w.aerosolHeightKm,w.clouds.centreKm,w.clouds.sigmaKm);
 const data=new Float32Array(BANDS*16);
 for(let i=0;i<BANDS;i++){
  data.set(s.optics.extinction[i],i*4);
  for(let c=0;c<3;c++) {data[(BANDS+i)*4+c]=s.spectrum[i]*BAND_RGB[i][c]/Math.PI;data[(2*BANDS+i)*4+c]=s.discRadiance[i]*BAND_RGB[i][c];}
 }
 u.uSpectral.value.image.data=data;u.uSpectral.value.needsUpdate=true;
 u.uRings.value=!!w.rings;u.uRingNormal.value.fromArray(a.ringNormal);u.uRingOrigin.value.fromArray(a.ringOrigin);
 u.uBodyCount.value=Math.min(12,a.bodies.length);
 a.bodies.slice(0,12).forEach((b,i)=>{
  u.uBodies.value[i].set(...b.position,b.radiusKm);
  const col=linearHex(b.colour),y=.2126*col[0]+.7152*col[1]+.0722*col[2];
  u.uBodyColour.value[i].set(col[0]/y,col[1]/y,col[2]/y,b.albedo);
 });
}
export function bindTransport(u:SkyUniforms,r:TransportResult){
 u.uSky.value.dispose();u.uColumns.value.dispose();
 u.uSky.value=new THREE.DataTexture(r.radiance,r.width,r.height,THREE.RGBAFormat,THREE.FloatType);
 u.uColumns.value=new THREE.DataTexture(r.columns,r.height,1,THREE.RGBAFormat,THREE.FloatType);
 for(const tex of [u.uSky.value,u.uColumns.value]){tex.minFilter=THREE.LinearFilter;tex.magFilter=THREE.LinearFilter;tex.needsUpdate=true;}
 u.uSkyWidth.value=r.width;u.uSkyHeight.value=r.height;
 u.uGroundDirect.value.fromArray(r.groundDirectRGB);u.uGroundDiffuse.value.fromArray(r.groundDiffuseRGB);
}
