import * as THREE from 'three';
import type { WorldSpec } from '../science/worlds';
import type { SkyState } from '../science/atmosphere';
import type { AstronomyState,Observation } from '../science/astronomy';
import type { TransportResult } from '../science/transport';
import { BANDS,NM,rgb,xyz,planck,temperatureBV,type Vec3 } from '../science/spectrum';
import { sub,scale,add,length,dot,DEG } from '../science/geometry';
import { opticalDepth } from '../science/atmosphere';
import { refractSource } from '../science/geometry';
import HOSTS from '../science/data/hosts.json';
import { projectionGLSL } from './skyShader';

type StarRow=number[];
let cataloguePromise:Promise<StarRow[]>|undefined;
export function loadStars():Promise<StarRow[]> {
  return cataloguePromise??=(fetch(`${import.meta.env.BASE_URL}data/stars.json`).then(r=>{if(!r.ok)throw Error('Star catalogue could not be loaded');return r.json();}));
}
const sourceCache=new Map<number,Float64Array>();
function starSpectrum(bv:number):Float64Array {
  const key=Math.round(bv*20);
  if(!sourceCache.has(key)) {
    const sp=Float64Array.from(NM,nm=>planck(nm,temperatureBV(key/20))),y=xyz(sp)[1];
    sourceCache.set(key,sp.map(x=>x/y));
  }
  return sourceCache.get(key)!;
}
export function starAttributes(rows:StarRow[],w:WorldSpec,s:SkyState,a:AstronomyState,o:Observation,t:TransportResult) {
  const map:Record<string,string>={'proxima-b':'Proxima Cen','trappist-1e':'TRAPPIST-1','kepler-186f':'Kepler-186','wasp-12b':'WASP-12'};
  const host=HOSTS.find(h=>h.hostname===(w.star.catalogueHost??map[w.id]));
  let origin:Vec3=scale(a.observerEQJ,1/206264.806247);
  if(host) origin=add(origin,[host.sy_dist*Math.cos(host.dec*DEG)*Math.cos(host.ra*DEG),host.sy_dist*Math.cos(host.dec*DEG)*Math.sin(host.ra*DEG),host.sy_dist*Math.sin(host.dec*DEG)]);
  const years=(Date.parse(o.date)-Date.parse('2000-01-01T12:00:00Z'))/(365.25*86400000);
  const positions:number[]=[],colours:number[]=[];
  const addStar=(position:Vec3,flux:number,bv:number)=>{
    const local:Vec3=[dot(position,a.east),dot(position,a.up),-dot(position,a.north)],dist=length(local),dir=scale(local,1/dist);
    const source=refractSource(s.refraction,dir);if(!source)return;
    const sp=starSpectrum(bv),trans=Float64Array.from({length:BANDS},(_,i)=>sp[i]*flux*source.focusing*Math.exp(-opticalDepth(s.optics,i,source.columns)));
    const colour=rgb(trans);
    if(xyz(trans)[1]<1e-13)return;
    positions.push(...source.direction);colours.push(...colour);
  };
  for(const row of rows) {
    const old:Vec3=[row[1],row[2],row[3]],pos=add(old,scale([row[4],row[5],row[6]],years));
    const relative=sub(pos,origin),d=length(relative),original=length(old);
    // A host's uncertain catalogue parallax must not create a second local sun.
    if(host&&length(sub(old,origin))<Math.max(.02,host.sy_dist*.002))continue;
    const mag=row[7]+5*Math.log10(d/original);
    if(mag>8.5)continue;
    addStar(relative,2.54e-6*10**(-.4*mag),row[8]);
  }
  if(host) {const d=length(origin);addStar(scale(origin,-1),2.54e-6*10**(-.4*(4.83+5*Math.log10(d)-5)),.65);}
  return {positions:new Float32Array(positions),colours:new Float32Array(colours)};
}
export function createStars(){
  const uniforms={uResolution:{value:new THREE.Vector2()},uForward:{value:new THREE.Vector3()},uRight:{value:new THREE.Vector3()},uUp:{value:new THREE.Vector3()},uFov:{value:60*DEG},uYaw:{value:0},uFisheye:{value:false}};
  // Each PSF already carries its flux in RGB. Sum it directly in the HDR
  // target. The scene alpha is used later for occultation in the display pass.
  const material=new THREE.ShaderMaterial({uniforms,transparent:true,blending:THREE.CustomBlending,
    blendEquation:THREE.AddEquation,blendSrc:THREE.OneFactor,blendDst:THREE.OneFactor,depthTest:false,depthWrite:false,
    vertexShader:`precision highp float; attribute vec3 flux; varying vec3 vRadiance; ${projectionGLSL}
    void main(){vec3 d=normalize(position);vec2 ndc;float omega;
     if(uFisheye){float theta=acos(clamp(d.y,-1.,1.)),az=atan(d.x,-d.z)-uYaw;float r=theta/(PI*.5);
      ndc=r*vec2(sin(az),cos(az))*.86*min(uResolution.x,uResolution.y)/uResolution;
      float anglePerPixel=PI/(.86*min(uResolution.x,uResolution.y));omega=anglePerPixel*anglePerPixel*(theta<.0001?1.:sin(theta)/theta);
     }else{float z=dot(d,uForward);if(z<=0.){gl_Position=vec4(2.,2.,2.,1.);gl_PointSize=0.;return;}
      ndc=vec2(dot(d,uRight)/(tan(uFov*.5)*uResolution.x/uResolution.y),dot(d,uUp)/tan(uFov*.5))/z;
      omega=pow(2.*tan(uFov*.5)/uResolution.y,2.)*z*z*z;
     }
     gl_Position=vec4(ndc,0.,1.);gl_PointSize=7.;vRadiance=flux/max(omega,1e-15);
    }`,
    fragmentShader:`precision highp float;varying vec3 vRadiance;
    void main(){vec2 p=(gl_PointCoord-.5)*7.;float sigma=.72;float psf=exp(-dot(p,p)/(2.*sigma*sigma))/(6.283185307*sigma*sigma);gl_FragColor=vec4(vRadiance*psf,0.);}`});
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(0),3));geometry.setAttribute('flux',new THREE.BufferAttribute(new Float32Array(0),3));
  const points=new THREE.Points(geometry,material);points.frustumCulled=false;
  return {uniforms,material,geometry,points};
}
