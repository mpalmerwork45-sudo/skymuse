import * as THREE from 'three';
import type { WorldSpec } from '../science/worlds';
import type { SkyState } from '../science/atmosphere';
import type { TransportResult } from '../science/transport';
import type { AstronomyState } from '../science/astronomy';
import { BANDS, BAND_RGB, reflectance } from '../science/spectrum';
import { atmosphereGeometry, densities, direction, DEG } from '../science/geometry';
import { companionShadow } from '../science/lighting';

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
uniform sampler2D uSky,uColumns,uSpectral,uBodyReflectance;
uniform sampler2D uRefractionForward,uRefractionInverse;
uniform vec2 uRefractionMin;
uniform float uRefractionSize,uRefractionGain,uRefractionGradient;
uniform float uSkyWidth,uSkyHeight,uSunRadius,uRadius,uHeight,uTemperature;
uniform vec3 uSun,uGroundDirect,uGroundDiffuse,uGroundColour;
uniform vec4 uProfiles;
uniform vec2 uGaussianPeak;
uniform bool uTerrain,uRings,uFullAzimuth;
uniform int uGroundLightCount;
uniform vec4 uGroundLights[13];
uniform vec3 uGroundLighting[13];
uniform vec3 uRingNormal,uRingOrigin;
uniform int uBodyCount;
uniform vec4 uBodies[12];
uniform float uBodyShadow[12];
float sq(float x){return x*x;}
vec2 horizontal(vec3 d){float l=length(d.xz);return l>1e-8?d.xz/l:vec2(1.,0.);}
float escapedRay(vec3 apparent,out vec3 geometric,out vec3 offset){
 float e=asin(clamp(apparent.y,-1.,1.));
 float t=sqrt(clamp((e-uRefractionMin.x)/(PI*.5-uRefractionMin.x),0.,1.));
 vec4 path=texture2D(uRefractionForward,vec2((t*(uRefractionSize-1.)+.5)/uRefractionSize,.5));
 vec2 h=horizontal(apparent);geometric=vec3(h.x*cos(path.r),sin(path.r),h.y*cos(path.r));
 offset=vec3(h.x*path.g,path.b,h.y*path.g);
 return e>=uRefractionMin.x?path.a:0.;
}
vec4 apparentSource(vec3 geometric){
 float e=asin(clamp(geometric.y,-1.,1.));
 if(e<uRefractionMin.y)return vec4(geometric,0.);
 float t=sqrt(clamp((e-uRefractionMin.y)/(PI*.5-uRefractionMin.y),0.,1.));
 vec4 path=texture2D(uRefractionInverse,vec2((t*(uRefractionSize-1.)+.5)/uRefractionSize,.5));
 vec2 h=horizontal(geometric);
 return vec4(h.x*cos(path.r),sin(path.r),h.y*cos(path.r),path.b>.5?path.g:0.);
}
vec2 skyUV(vec3 d){
 float az=atan(d.x,-d.z),sunAz=atan(uSun.x,-uSun.z);
 float relative=mod(az-sunAz+2.*PI,2.*PI);
 float coordinate=uFullAzimuth?relative/(2.*PI):min(relative,2.*PI-relative)/PI;
 float h=sqrt(max(0.,asin(clamp(d.y,-1.,1.)))/(PI*.5));
 return vec2((coordinate*(uSkyWidth-1.)+.5)/uSkyWidth,(h*(uSkyHeight-1.)+.5)/uSkyHeight);
}
vec4 column(vec3 d){float h=sqrt(max(0.,asin(clamp(d.y,-1.,1.)))/(PI*.5));return texture2D(uColumns,vec2((h*(uSkyHeight-1.)+.5)/uSkyHeight,.5));}
vec3 spectralLight(vec4 cols,bool disc){
 vec3 c=vec3(0.);
 for(int i=0;i<48;i++){
  float x=(float(i)+.5)/48.;
  vec4 ext=texture2D(uSpectral,vec2(x,.125));
  vec3 light=texture2D(uSpectral,vec2(x,disc?.625:.375)).rgb;
  c+=light*exp(-dot(ext,cols));
 }return c*uRefractionGain;
}
float angle(vec3 a,vec3 b){return atan(length(cross(a,b)),dot(a,b));}
vec3 reflectedBody(vec4 cols,int body){
 vec3 c=vec3(0.);
 for(int i=0;i<48;i++){
  float x=(float(i)+.5)/48.;
  vec4 ext=texture2D(uSpectral,vec2(x,.125));
  vec3 light=texture2D(uSpectral,vec2(x,.375)).rgb;
  float rho=texture2D(uBodyReflectance,vec2(x,(float(body)+.5)/12.)).r;
  c+=light*rho*exp(-dot(ext,cols));
 }return c*uRefractionGain;
}
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
vec3 bendOffset(vec3 ray,float distance){
 vec3 acceleration=vec3(0.,uRefractionGradient,0.)-ray*(uRefractionGradient*ray.y);
 return ray*distance+.5*acceleration*distance*distance;
}
vec3 rayPoint(vec3 ray,float distance){return vec3(0.,uHeight,0.)+bendOffset(ray,distance);}
float terrainHit(vec3 ray){
 // Local quadratic ray/sphere geometry is accurate over the terrain's 35 km
 // extent. Atmospheric and celestial paths use the full spherical integrator.
 float a=.5*(1./uRadius+uRefractionGradient)*(1.-ray.y*ray.y),b=ray.y;
 float dis=b*b-4.*a*uHeight,base=-1.;
 if(abs(a)<1e-12){if(b<0.)base=-uHeight/b;}
 else if(dis>=0.){
  float q=-.5*(b+(b>=0.?1.:-1.)*sqrt(dis));
  float t1=q/a,t2=abs(q)>1e-20?uHeight/q:-1.;
  if(t1>0.)base=t1;if(t2>0.&&(base<0.||t2<base))base=t2;
 }
 if(!uTerrain)return base;
 if(ray.y>.08&&uRefractionGradient>=-1./uRadius)return -1.;
 float t=0.;
 for(int j=0;j<96;j++){
  vec3 p=rayPoint(ray,t);float h=p.y-surfaceY(p.xz);
  if(h<.00005)return t;
  t+=clamp(h*.8/(.12+max(0.,-ray.y)),.0001,.5);
  if(t>35.)break;
 }return base;
}
float terrainShadow(vec3 p,vec3 light){
 if(light.y<-.1)return 0.;
 float t=.002;
 for(int j=0;j<24;j++){
  vec3 q=p+bendOffset(light,t);
  if(q.y<surfaceY(q.xz))return 0.;
  t+=.005*pow(1.45,float(j));
 }return 1.;
}
vec4 foregroundColumn(vec3 ray,float distance){
 vec4 c=vec4(0.);
 for(int j=0;j<24;j++){
  float a=distance*sq(float(j)/24.),b=distance*sq(float(j+1)/24.);
  vec3 p=rayPoint(ray,(a+b)*.5);
  // Rationalise the radial height correction to retain metre-scale offsets.
  float r=uRadius+p.y,xz2=dot(p.xz,p.xz);
  float h=max(0.,p.y+xz2/(sqrt(r*r+xz2)+r));
  c+=(b-a)*vec4(exp(-h/uProfiles.x)/uProfiles.x,exp(-h/uProfiles.y)/uProfiles.y,
    uGaussianPeak.x*exp(-.5*sq((h-25.)/8.)),
    uGaussianPeak.y*exp(-.5*sq((h-uProfiles.z)/uProfiles.w)));
 }return c;
}
vec3 lightCap(vec3 centre,float radius,int i,int n){
 float pair=floor(float(i)*.5);
 float c=1.-(1.-cos(radius))*(pair+.5)/(float(n)*.5),ss=sqrt(max(0.,1.-c*c));
 vec3 a=normalize(cross(abs(centre.y)<.9?vec3(0.,1.,0.):vec3(1.,0.,0.),centre)),b=cross(centre,a);
 float phi=pair*2.39996323+mod(float(i),2.)*PI;
 return c*centre+ss*(cos(phi)*a+sin(phi)*b);
}
vec3 capSample(int i,int n){return lightCap(uSun,uSunRadius,i,n);}
float bodyLighting(vec3 point,vec3 normal,int self){
 float light=0.;
 for(int i=0;i<16;i++){
  vec3 d=capSample(i,16);
  float shadow=sphere(point-uRingOrigin,d,uRadius)>0.?0.:1.;
  for(int j=0;j<12;j++){
   if(j>=uBodyCount)break;
   if(j!=self&&sphere(point-uBodies[j].xyz,d,uBodies[j].w)>0.)shadow=0.;
  }
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
 if(fisheyeMask(vUv)<.5){gl_FragColor=vec4(0.,0.,0.,1.);return;}
 vec3 ray=rayDirection(vUv),sky=texture2D(uSky,skyUV(ray)).rgb;
 vec3 geometric,offset;float visible=escapedRay(ray,geometric,offset);
 vec4 cols=column(ray);float pixel=sqrt(length(cross(dFdx(geometric),dFdy(geometric))));
 float hit=terrainHit(ray),opacity=0.;
 vec3 light=sky;
 if(hit>=0.){
  vec3 p=rayPoint(ray,hit);
  float e=.0002;vec3 normal=normalize(vec3(surfaceY(p.xz-vec2(e,0.))-surfaceY(p.xz+vec2(e,0.)),2.*e,surfaceY(p.xz-vec2(0.,e))-surfaceY(p.xz+vec2(0.,e))));
  float diffuseFactor=.5*(1.+normal.y);vec3 direct=vec3(0.);
  for(int l=0;l<13;l++){
   if(l>=uGroundLightCount)break;
   if(max(max(uGroundLighting[l].r,uGroundLighting[l].g),uGroundLighting[l].b)<=0.)continue;
   float beam=0.,flatBeam=0.;
   int samples=l==0?16:4;
   for(int i=0;i<16;i++){if(i>=samples)break;vec4 source=apparentSource(lightCap(uGroundLights[l].xyz,uGroundLights[l].w,i,samples));vec3 d=source.xyz;
    flatBeam+=source.a*max(0.,d.y);beam+=source.a*max(0.,dot(normal,d))*terrainShadow(p,d);}
   direct+=uGroundLighting[l]*beam/max(flatBeam,1e-8);
  }
  float textureFactor=1.;
  light=(uGroundDiffuse*diffuseFactor+direct)*textureFactor;
  // Numerical finite-path extinction on the local quadratic ray; homogeneous source-function
  // approximation for nearby terrain inscattering (documented separately).
  vec4 localCols=foregroundColumn(ray,hit);
  vec3 trans=vec3(0.),norm=vec3(0.),fraction=vec3(0.);
  for(int i=0;i<48;i++){float x=(float(i)+.5)/48.;vec3 e0=texture2D(uSpectral,vec2(x,.375)).rgb;
   vec4 ext=texture2D(uSpectral,vec2(x,.125));float tr=exp(-dot(ext,localCols));
   norm+=e0;trans+=e0*tr;fraction+=e0*(1.-tr)/max(1.-exp(-dot(ext,cols)),1e-9);}
  trans=clamp(trans/max(norm,vec3(.000001)),0.,1.);
  light=light*trans+sky*clamp(fraction/max(norm,vec3(.000001)),0.,1.);opacity=1.;
 }else if(visible>.5){
  float disc=coverage(angle(geometric,uSun),uSunRadius,pixel);
  if(disc>1e-8) {light+=spectralLight(cols,true)*disc;opacity=max(opacity,min(1.,disc));}
  float nearest=1e30;
  for(int i=0;i<12;i++){
   if(i>=uBodyCount)break;
   vec3 centre=uBodies[i].xyz,relative=centre-offset;float radius=uBodies[i].w,dist=length(relative);
   float sep=angle(geometric,relative/dist),ar=asin(radius/dist),cover=coverage(sep,ar,pixel);
   if(cover<1e-7||dist>=nearest)continue;
   float t=sphere(-relative,geometric,radius);
   // Antialiased pixels just outside the limb use the tangent normal. A
   // face-on fallback would fabricate a bright rim and excess integrated light.
   // Work relative to the body centre rather than subtracting two large
   // positions after a distant intersection. This preserves limb normals.
   vec3 perpendicular=cross(geometric,cross(relative,geometric));
   vec3 normal=normalize(-perpendicular-geometric*sqrt(max(0.,radius*radius-dot(perpendicular,perpendicular))));
   vec3 surfacePoint=centre+radius*normal;
   float phase=bodyLighting(surfacePoint,normal,i);
   if(ar<pixel*.75){float a=acos(clamp(dot(-centre/dist,uSun),-1.,1.));phase=2./3.*(sin(a)+(PI-a)*cos(a))/PI*uBodyShadow[i];}
   vec3 colour=reflectedBody(cols,i)*phase;
   light=mix(light,sky+colour,clamp(cover,0.,1.));opacity=max(opacity,clamp(cover,0.,1.));nearest=dist;
  }
  if(uRings){
   float denom=dot(geometric,uRingNormal),t=dot(uRingOrigin-offset,uRingNormal)/denom;
   if(abs(denom)>1e-7&&t>0.&&t<nearest){
    vec3 p=offset+geometric*t;vec2 band=ringBand(length(p-uRingOrigin));
    float alpha=1.-exp(-band.x/max(abs(denom),1e-6));
    float lit=0.;
    for(int i=0;i<16;i++){vec3 d=capSample(i,16);if(sphere(p-uRingOrigin,d,uRadius)<0.)lit+=max(0.,dot(uRingNormal,d)*sign(-denom));}
    vec3 colour=spectralLight(cols,false)*vec3(1.,.96,.88)*band.y*lit/16.;
    light=mix(light,sky+colour,alpha);opacity=max(opacity,alpha);
   }
  }
 }else opacity=1.;
 gl_FragColor=vec4(light,opacity);
}
`;
export function createSkyMaterial(){
 const uniforms={
  uResolution:{value:new THREE.Vector2(1280,800)},uForward:{value:new THREE.Vector3(1,0,0)},uRight:{value:new THREE.Vector3(0,0,1)},uUp:{value:new THREE.Vector3(0,1,0)},uFov:{value:60*DEG},uYaw:{value:0},uFisheye:{value:false},
  uSky:{value:new THREE.DataTexture(new Float32Array(4),1,1,THREE.RGBAFormat,THREE.FloatType)},
  uColumns:{value:new THREE.DataTexture(new Float32Array(4),1,1,THREE.RGBAFormat,THREE.FloatType)},
  uSpectral:{value:new THREE.DataTexture(new Float32Array(BANDS*4*4),BANDS,4,THREE.RGBAFormat,THREE.FloatType)},
  uBodyReflectance:{value:new THREE.DataTexture(new Float32Array(BANDS*12*4),BANDS,12,THREE.RGBAFormat,THREE.FloatType)},
  uRefractionForward:{value:new THREE.DataTexture(new Float32Array(4),1,1,THREE.RGBAFormat,THREE.FloatType)},
  uRefractionInverse:{value:new THREE.DataTexture(new Float32Array(4),1,1,THREE.RGBAFormat,THREE.FloatType)},
  uRefractionMin:{value:new THREE.Vector2()},uRefractionSize:{value:1},uRefractionGain:{value:1},uRefractionGradient:{value:0},
  uSkyWidth:{value:1},uSkyHeight:{value:1},uSun:{value:new THREE.Vector3()},uSunRadius:{value:.00465},uRadius:{value:6371},uHeight:{value:.0017},uTemperature:{value:288},
  uGroundDirect:{value:new THREE.Vector3()},uGroundDiffuse:{value:new THREE.Vector3()},uGroundColour:{value:new THREE.Vector3()},uTerrain:{value:true},uFullAzimuth:{value:false},
  uGroundLightCount:{value:0},uGroundLights:{value:Array.from({length:13},()=>new THREE.Vector4())},uGroundLighting:{value:Array.from({length:13},()=>new THREE.Vector3())},
  uProfiles:{value:new THREE.Vector4(8.4,1.2,3,1)},uGaussianPeak:{value:new THREE.Vector2()},
  uRings:{value:false},uRingNormal:{value:new THREE.Vector3()},uRingOrigin:{value:new THREE.Vector3()},uBodyCount:{value:0},
  uBodies:{value:Array.from({length:12},()=>new THREE.Vector4())},uBodyShadow:{value:Array.from({length:12},()=>1)},
 };
 for(const tex of [uniforms.uSky.value,uniforms.uColumns.value,uniforms.uSpectral.value,uniforms.uRefractionForward.value,uniforms.uRefractionInverse.value]){tex.needsUpdate=true;tex.minFilter=THREE.LinearFilter;tex.magFilter=THREE.LinearFilter;}
 uniforms.uBodyReflectance.value.needsUpdate=true;
 const material=new THREE.ShaderMaterial({uniforms,vertexShader:fullScreenVertex,fragmentShader:fragment,depthTest:false,depthWrite:false});
 return {uniforms,material};
}
export type SkyUniforms=ReturnType<typeof createSkyMaterial>['uniforms'];
export function updateSkyUniforms(u:SkyUniforms,w:WorldSpec,s:SkyState,a:AstronomyState){
 if(u.uRefractionForward.value.image.data!==s.refraction.forward){
  u.uRefractionForward.value.dispose();u.uRefractionInverse.value.dispose();
  u.uRefractionForward.value=new THREE.DataTexture(s.refraction.forward,s.refraction.size,1,THREE.RGBAFormat,THREE.FloatType);
  u.uRefractionInverse.value=new THREE.DataTexture(s.refraction.inverse,s.refraction.size,1,THREE.RGBAFormat,THREE.FloatType);
  for(const texture of [u.uRefractionForward.value,u.uRefractionInverse.value]){texture.minFilter=THREE.LinearFilter;texture.magFilter=THREE.LinearFilter;texture.needsUpdate=true;}
 }
 u.uRefractionMin.value.set(s.refraction.minElevation,s.refraction.inverseMinElevation);u.uRefractionSize.value=s.refraction.size;
 u.uRefractionGain.value=s.refraction.gain;u.uRefractionGradient.value=s.refraction.gradient;
 u.uSun.value.fromArray(direction(s.sunAzDeg,s.sunElevDeg));u.uSunRadius.value=s.starAngularDeg*DEG/2;
 u.uRadius.value=w.radiusKm;u.uHeight.value=s.observerHeightKm??.0017;u.uTemperature.value=w.temperatureK;
 const profiles=atmosphereGeometry(w,s.refractionOn!==false);
 u.uProfiles.value.set(profiles.gasH,profiles.aerosolH,profiles.cloudCentre,profiles.cloudSigma);
 u.uGaussianPeak.value.set(densities(profiles,profiles.ozoneCentre)[2],densities(profiles,profiles.cloudCentre)[3]);
 const data=new Float32Array(BANDS*16);
 for(let i=0;i<BANDS;i++){
  data.set(s.optics.extinction[i],i*4);
  for(let c=0;c<3;c++) {data[(BANDS+i)*4+c]=s.spectrum[i]*BAND_RGB[i][c]/Math.PI;data[(2*BANDS+i)*4+c]=s.discRadiance[i]*BAND_RGB[i][c];}
 }
 u.uSpectral.value.image.data=data;u.uSpectral.value.needsUpdate=true;
 u.uRings.value=!!w.rings;u.uRingNormal.value.fromArray(a.ringNormal);u.uRingOrigin.value.fromArray(a.ringOrigin);
 u.uRingOrigin.value.y-=u.uHeight.value;
 u.uBodyCount.value=Math.min(12,a.bodies.length);
 const bodyData=new Float32Array(BANDS*12*4);
 a.bodies.slice(0,12).forEach((b,i)=>{
  u.uBodies.value[i].set(b.position[0],b.position[1]-u.uHeight.value,b.position[2],b.radiusKm);
  const rho=reflectance(b.colour,b.albedo);
  u.uBodyShadow.value[i]=companionShadow(b,w,a,direction(s.sunAzDeg,s.sunElevDeg),s.starAngularDeg*DEG/2);
  for(let band=0;band<BANDS;band++)bodyData[(i*BANDS+band)*4]=rho[band];
 });
 u.uBodyReflectance.value.image.data=bodyData;u.uBodyReflectance.value.needsUpdate=true;
}
export function bindTransport(u:SkyUniforms,r:TransportResult){
 u.uSky.value.dispose();u.uColumns.value.dispose();
 u.uSky.value=new THREE.DataTexture(r.radiance,r.width,r.height,THREE.RGBAFormat,THREE.FloatType);
 u.uColumns.value=new THREE.DataTexture(r.columns,r.height,1,THREE.RGBAFormat,THREE.FloatType);
 for(const tex of [u.uSky.value,u.uColumns.value]){tex.minFilter=THREE.LinearFilter;tex.magFilter=THREE.LinearFilter;tex.needsUpdate=true;}
 u.uSkyWidth.value=r.width;u.uSkyHeight.value=r.height;
 u.uFullAzimuth.value=r.fullAzimuth;u.uGroundLightCount.value=Math.min(13,r.groundLights.length);
 r.groundLights.slice(0,13).forEach((l,i)=>{u.uGroundLights.value[i].set(...l.direction,l.radiusRad);u.uGroundLighting.value[i].fromArray(l.rgb);});
 u.uGroundDirect.value.fromArray(r.groundDirectRGB);u.uGroundDiffuse.value.fromArray(r.groundDiffuseRGB);
}
