import * as THREE from 'three';
import { fullScreenVertex } from './skyShader';
import { luminance } from '../science/spectrum';

/** The adaptation transform operates on cone responses, so preserve signed
 * linear RGB for physical illuminants outside the display's colour triangle. */
export function adaptingWhite(illuminance:ArrayLike<number>):THREE.Vector3 {
  const y=luminance(illuminance);
  if(y<=1e-6)return new THREE.Vector3(1,1,1);
  return new THREE.Vector3(illuminance[0]/y,illuminance[1]/y,illuminance[2]/y);
}
export function createDisplay(){
  const uniforms={uScene:{value:null as THREE.Texture|null},uStars:{value:null as THREE.Texture|null},uGain:{value:1/20000},uAdaptation:{value:0},uWhite:{value:new THREE.Vector3(1,1,1)},uNight:{value:0}};
  const material=new THREE.ShaderMaterial({uniforms,vertexShader:fullScreenVertex,depthTest:false,depthWrite:false,
    fragmentShader:`precision highp float;varying vec2 vUv;uniform sampler2D uScene,uStars;uniform float uGain,uAdaptation,uNight;uniform vec3 uWhite;
    vec3 lms(vec3 c){return mat3(.31399022,.15537241,.01775239,.63951294,.75789446,.10944209,.04649755,.08670142,.87256922)*c;}
    vec3 rgb(vec3 c){return mat3(5.47221206,-1.1252419,.02980165,-4.6419601,2.29317094,-.19318073,.16963708,-.1678952,1.16364789)*c;}
    vec3 srgb(vec3 x){return mix(12.92*x,1.055*pow(max(x,0.),vec3(1./2.4))-.055,step(vec3(.0031308),x));}
    void main(){vec4 scene=texture2D(uScene,vUv);vec3 c=scene.rgb+texture2D(uStars,vUv).rgb*(1.-scene.a);
     vec3 adapted=rgb(lms(c)/max(lms(uWhite),vec3(.03)));c=mix(c,adapted,uAdaptation);
     // Mesopic desaturation is a display approximation, not a rod-cone simulation.
     float y=dot(c,vec3(.2126,.7152,.0722));c=mix(c,vec3(y),uNight*.85);
     c*=uGain;
     float exposedY=dot(c,vec3(.2126,.7152,.0722));
     if(exposedY<=0.){gl_FragColor=vec4(0.,0.,0.,1.);return;}
     // Physical spectra can have negative linear sRGB components. Compute Y
     // before gamut mapping. Move towards grey at that same tone-mapped Y
     // until both the lower and upper display bounds are satisfied.
     float displayY=exposedY/(1.+exposedY);
     vec3 chroma=c/(1.+exposedY)-vec3(displayY);
     float saturation=1.;
     float darkest=min(chroma.r,min(chroma.g,chroma.b));
     float brightest=max(chroma.r,max(chroma.g,chroma.b));
     if(darkest<0.)saturation=min(saturation,displayY/(-darkest));
     if(brightest>0.)saturation=min(saturation,(1.-displayY)/brightest);
     gl_FragColor=vec4(srgb(clamp(vec3(displayY)+saturation*chroma,0.,1.)),1.);
    }`});
  return {uniforms,material};
}
