import type { WorldSpec } from './worlds';
import type { Vec3 } from './spectrum';
import { add, sub, scale, dot, length, unit, cross } from './vectors';
import { gasLorentzFactor, refractiveIndex, refractiveGradient, minimumEscapeElevation, traceRefractedRay } from './refraction';
export { dot, length, scale, add, sub, unit, cross } from './vectors';

export const DEG = Math.PI/180;
/** Local coordinates: east +x, zenith +y, south +z. */
export function direction(azDeg: number, elevDeg: number): Vec3 {
  const a=azDeg*DEG, e=elevDeg*DEG;
  return [Math.sin(a)*Math.cos(e),Math.sin(e),-Math.cos(a)*Math.cos(e)];
}
export function azElev(v: Vec3): [number,number] {
  return [(Math.atan2(v[0],-v[2])/DEG+360)%360,Math.asin(v[1]/length(v))/DEG];
}
/** Closest forward sphere intersection; -1 means no hit. Coordinates in km. */
export function sphereHit(p: Vec3,d: Vec3,r: number): number {
  const b=dot(p,d), c=dot(p,p)-r*r, disc=b*b-c;
  if (disc<0) return -1;
  const q=-b-Math.sqrt(disc);
  return q>1e-8 ? q : -b+Math.sqrt(disc)>1e-8 ? -b+Math.sqrt(disc) : -1;
}

export interface AtmosGeometry {
  radius: number; top: number; gasH: number; aerosolH: number;
  ozoneCentre: number; ozoneSigma: number; cloudCentre: number; cloudSigma: number;
  refractiveQ0: number;
}
export type Column = [number,number,number,number];
export function atmosphereGeometry(w: WorldSpec, refractionOn = true): AtmosGeometry {
  const gasH=Math.max(.1,w.scaleHeightKm), aerosolH=w.aerosolHeightKm;
  const refractiveQ0=refractionOn?gasLorentzFactor(w):0;
  if(!Number.isFinite(refractiveQ0)||refractiveQ0<0||refractiveQ0>=.95) throw new RangeError('Atmospheric density exceeds the supported gas refractivity range.');
  return {radius:w.radiusKm,top:Math.max(12*gasH,12*aerosolH,w.clouds.centreKm+6*w.clouds.sigmaKm,60),
    gasH,aerosolH,ozoneCentre:25,ozoneSigma:8,cloudCentre:w.clouds.centreKm,cloudSigma:w.clouds.sigmaKm,refractiveQ0};
}
function erf(x: number): number {
  const s=Math.sign(x); x=Math.abs(x); const t=1/(1+.3275911*x);
  return s*(1-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-.284496736)*t+.254829592)*t*Math.exp(-x*x));
}
function gaussian(h: number,centre: number,sigma: number): number {
  return Math.exp(-.5*((h-centre)/sigma)**2)/(sigma*Math.sqrt(2*Math.PI)*.5*(1+erf(centre/sigma/Math.SQRT2)));
}
/** Density profiles normalised to unit vertical column; units km⁻¹. */
export function densities(g: AtmosGeometry,h: number): Column {
  if (h<-.001 || h>g.top) return [0,0,0,0]; h=Math.max(0,h);
  return [Math.exp(-h/g.gasH)/g.gasH,Math.exp(-h/g.aerosolH)/g.aerosolH,
    gaussian(h,g.ozoneCentre,g.ozoneSigma),gaussian(h,g.cloudCentre,g.cloudSigma)];
}
export function verticalColumn(g: AtmosGeometry,low: number,high: number): Column {
  const gaussianIntegral=(c:number,s:number)=>(erf((high-c)/s/Math.SQRT2)-erf((low-c)/s/Math.SQRT2))/(1+erf(c/s/Math.SQRT2));
  return [Math.exp(-low/g.gasH)-Math.exp(-high/g.gasH),Math.exp(-low/g.aerosolH)-Math.exp(-high/g.aerosolH),
    gaussianIntegral(g.ozoneCentre,g.ozoneSigma),gaussianIntegral(g.cloudCentre,g.cloudSigma)];
}
export interface Segment { p: Vec3; direction: Vec3; density: Column; ds: number; h: number; }
export function raySegments(g: AtmosGeometry,p: Vec3,d: Vec3,count=64): {segments: Segment[]; ground: boolean; distance: number} {
  if(g.refractiveQ0>0) {
    const ray=traceRefractedRay(g,p,d,count);
    const segments=ray.nodes.map(node=>{
      const column:Column=[0,0,0,0];
      for(const sample of node.samples){const rho=densities(g,sample.height);for(let k=0;k<4;k++)column[k]+=rho[k]*sample.ds;}
      return {p:node.p,direction:node.direction,h:node.h,ds:node.ds,density:column.map(c=>c/Math.max(node.ds,1e-30)) as Column};
    });
    return {segments,ground:ray.ground,distance:ray.distance};
  }
  const outer=sphereHit(p,d,g.radius+g.top), groundDistance=sphereHit(p,d,g.radius);
  const ground=groundDistance>0 && groundDistance<outer;
  const distance=ground?groundDistance:Math.max(0,outer);
  const segments: Segment[]=[];
  for(let j=0;j<count;j++) {
    // Quadratic spacing resolves the observer's dense lower atmosphere.
    const a=distance*(j/count)**2,b=distance*((j+1)/count)**2;
    const q=add(p,scale(d,(a+b)/2)), h=length(q)-g.radius;
    segments.push({p:q,direction:d,h,density:densities(g,h),ds:b-a});
  }
  return {segments,ground,distance};
}
export function pathColumns(g: AtmosGeometry,p: Vec3,d: Vec3,count=96): Column | null {
  const ray=raySegments(g,p,d,count);
  if(ray.ground) return null;
  const c: Column=[0,0,0,0];
  for(const s of ray.segments) for(let k=0;k<4;k++) c[k]+=s.density[k]*s.ds;
  return c;
}

/** Uniform solid-angle stellar-cap quadrature. Weight converts normal E to L dΩ. */
export function stellarDisc(centre: Vec3,radius: number,count=64): {dir: Vec3; weight:number}[] {
  count=2*Math.ceil(count/2);
  const a=unit(cross(Math.abs(centre[1])<.9?[0,1,0]:[1,0,0],centre)),b=cross(centre,a);
  const result=[]; const w=2/(1+Math.cos(radius))/count;
  for(let i=0;i<count;i++) {
    const pair=Math.floor(i/2);
    const cos=1-(1-Math.cos(radius))*(pair+.5)/(count/2), sin=Math.sqrt(Math.max(0,1-cos*cos));
    const phi=pair*Math.PI*(3-Math.sqrt(5))+(i%2)*Math.PI;
    result.push({dir:add(scale(centre,cos),add(scale(a,sin*Math.cos(phi)),scale(b,sin*Math.sin(phi)))),weight:w});
  }
  return result;
}

/** Equidistant 180° dome: zenith at centre, horizon at radius 1. */
export function fisheyeDirection(x: number,y: number,yawDeg=0): Vec3|null {
  const r=Math.hypot(x,y); if(r>1) return null;
  const theta=r*Math.PI/2, az=Math.atan2(x,y)+yawDeg*DEG;
  return [Math.sin(theta)*Math.sin(az),Math.cos(theta),-Math.sin(theta)*Math.cos(az)];
}

export interface SourcePath { columns: Column; direction: Vec3; focusing: number; }
interface SourceRecord { geometricMu:number; apparentMu:number; columns:Column; }
const sourceCoordinate=(mu:number,size:number)=>(Math.sign(mu)*Math.sqrt(Math.abs(mu))+1)*.5*(size-1);
const sourceMu=(x:number,size:number)=>{const q=2*x/(size-1)-1;return Math.sign(q)*q*q;};

function localDirection(up:Vec3,geometric:Vec3,geometricMu:number,apparentMu:number):Vec3 {
  const horizontal=unit(sub(geometric,scale(up,geometricMu)));
  return add(scale(up,apparentMu),scale(horizontal,Math.sqrt(Math.max(0,1-apparentMu*apparentMu))));
}
function sourceRecords(g:AtmosGeometry,height:number,size=384,count=48):SourceRecord[] {
  const p:Vec3=[0,g.radius+height,0],records:SourceRecord[]=[];
  const low=g.refractiveQ0>0?minimumEscapeElevation(g,p[1]):-Math.acos(g.radius/p[1]);
  for(let j=0;j<size;j++) {
    const elevation=low+1e-7+(Math.PI/2-low-1e-7)*(j/(size-1))**2;
    const d:Vec3=[Math.cos(elevation),Math.sin(elevation),0];
    let geometricElevation=elevation,ground=false,columns:Column=[0,0,0,0];
    if(g.refractiveQ0>0){
      const path=traceRefractedRay(g,p,d,count);ground=path.ground;geometricElevation=path.geometricElevation;
      for(const node of path.nodes)for(const sample of node.samples){
        const rho=densities(g,sample.height);for(let k=0;k<4;k++)columns[k]+=rho[k]*sample.ds;
      }
    }else{
      const c=pathColumns(g,p,d,count);ground=c===null;if(c)columns=c;
    }
    if(ground||geometricElevation< -Math.PI/2||geometricElevation>Math.PI/2+1e-8)continue;
    const geometricMu=Math.sin(geometricElevation);
    // Keep the monotonically ordered primary image; higher-order mirage images
    // require weather profiles and are not represented by this model.
    if(records.length&&geometricMu<=records[records.length-1].geometricMu+1e-14)continue;
    records.push({geometricMu,apparentMu:Math.sin(elevation),columns});
  }
  return records;
}
function sampleRecord(records:SourceRecord[],mu:number,gain:number):{columns:Column;apparentMu:number;focusing:number}|null {
  if(records.length<2||mu<records[0].geometricMu-1e-12)return null;
  let low=0,high=records.length-1;
  while(high-low>1){const mid=(low+high)>>1;if(records[mid].geometricMu<=mu)low=mid;else high=mid;}
  const a=records[low],b=records[high],span=b.geometricMu-a.geometricMu;
  const f=Math.max(0,Math.min(1,(mu-a.geometricMu)/span));
  return {columns:a.columns.map((c,k)=>c*(1-f)+b.columns[k]*f) as Column,
    apparentMu:a.apparentMu*(1-f)+b.apparentMu*f,focusing:gain*(b.apparentMu-a.apparentMu)/span};
}

/** Serializable angular maps shared by the Sun, catalogue stars and body shader. */
export interface RefractionView {
  size:number; minElevation:number; inverseMinElevation:number; forward:Float32Array; inverse:Float32Array; inverseColumns:Float32Array;
  gain:number; gradient:number;
}
export class ObserverRayLookup {
  readonly view:RefractionView;
  private readonly records:SourceRecord[];
  constructor(readonly g:AtmosGeometry,readonly height=.0017,size=512){
    const p:Vec3=[0,g.radius+height,0],gain=refractiveIndex(g,height)**2;
    this.records=sourceRecords(g,height,size,64);
    const minElevation=-Math.acos(g.radius/p[1]);
    const inverseMinElevation=Math.asin(this.records[0].geometricMu);
    const forward=new Float32Array(size*4),inverse=new Float32Array(size*4),inverseColumns=new Float32Array(size*4);
    for(let j=0;j<size;j++){
      const elevation=minElevation+(Math.PI/2-minElevation)*(j/(size-1))**2;
      const d:Vec3=[Math.cos(elevation),Math.sin(elevation),0];
      if(g.refractiveQ0>0){
        const ray=traceRefractedRay(g,p,d,64);
        const valid=!ray.ground&&ray.geometricElevation>=-Math.PI/2;
        const offset=sub(ray.exitPoint,p),closest=sub(offset,scale(ray.exitDirection,dot(offset,ray.exitDirection)));
        forward.set([ray.geometricElevation,closest[0],closest[1],valid?1:0],j*4);
      }else forward.set([elevation,0,0,1],j*4);
      const mu=Math.sin(inverseMinElevation+(Math.PI/2-inverseMinElevation)*(j/(size-1))**2),sample=sampleRecord(this.records,mu,gain);
      if(sample){inverse.set([Math.asin(Math.max(-1,Math.min(1,sample.apparentMu))),sample.focusing,1,0],j*4);inverseColumns.set(sample.columns,j*4);}
    }
    this.view={size,minElevation,inverseMinElevation,forward,inverse,inverseColumns,gain,gradient:refractiveGradient(g,height)};
  }
  sample(geometric:Vec3):SourcePath|null {
    const mu=Math.max(-1,Math.min(1,geometric[1])),s=sampleRecord(this.records,mu,this.view.gain);
    return s?{columns:s.columns,direction:localDirection([0,1,0],geometric,mu,s.apparentMu),focusing:s.focusing}:null;
  }
}
let observerCache:{key:string;lookup:ObserverRayLookup}|undefined;
export function observerRayLookup(world:WorldSpec,height=.0017,refractionOn=true):ObserverRayLookup {
  const g=atmosphereGeometry(world,refractionOn),key=JSON.stringify([g,height]);
  if(observerCache?.key!==key)observerCache={key,lookup:new ObserverRayLookup(g,height)};
  return observerCache!.lookup;
}

export function refractSource(view:RefractionView,geometric:Vec3):SourcePath|null {
  const mu=Math.max(-1,Math.min(1,geometric[1])),elevation=Math.asin(mu);
  if(elevation<view.inverseMinElevation)return null;
  const xx=Math.sqrt(Math.max(0,(elevation-view.inverseMinElevation)/(Math.PI/2-view.inverseMinElevation)))*(view.size-1);
  const i=Math.max(0,Math.min(view.size-2,Math.floor(xx))),f=Math.max(0,Math.min(1,xx-i));
  const a=i*4,b=(i+1)*4;
  if(view.inverse[a+2]<.5||view.inverse[b+2]<.5)return null;
  const e=view.inverse[a]*(1-f)+view.inverse[b]*f;
  const columns=[0,1,2,3].map(k=>view.inverseColumns[a+k]*(1-f)+view.inverseColumns[b+k]*f) as Column;
  return {columns,direction:localDirection([0,1,0],geometric,mu,Math.sin(e)),focusing:view.inverse[a+1]*(1-f)+view.inverse[b+1]*f};
}

/** Incoming geometric directions are mapped to local refracted rays and columns. */
export class ColumnLookup {
  readonly data:Float32Array;
  private readonly light:Float32Array;
  private readonly horizon:Float64Array;
  constructor(readonly g:AtmosGeometry,readonly heights=48,readonly angles=192){
    this.data=new Float32Array(heights*angles*4);this.light=new Float32Array(heights*angles*2);this.horizon=new Float64Array(heights);
    for(let y=0;y<heights;y++){
      const h=.001+(g.top-.001)*(y/(heights-1))**2;
      const records=g.refractiveQ0>0?sourceRecords(g,h,384,48):null,gain=refractiveIndex(g,h)**2;
      this.horizon[y]=records?.[0]?.geometricMu??-Math.sqrt(Math.max(0,1-(g.radius/(g.radius+h))**2));
      for(let x=0;x<angles;x++){
        const mu=sourceMu(x,angles),dir:Vec3=[Math.sqrt(Math.max(0,1-mu*mu)),mu,0];
        const sample=records?sampleRecord(records,mu,gain):null;
        const cols=records?sample?.columns??null:pathColumns(g,[0,g.radius+h,0],dir,64);
        const offset=(y*angles+x)*4;
        for(let k=0;k<4;k++)this.data[offset+k]=cols?cols[k]:1e6;
        this.light[(y*angles+x)*2]=sample?.apparentMu??mu;
        this.light[(y*angles+x)*2+1]=sample?.focusing??1;
      }
    }
  }
  sampleLight(p:Vec3,geometric:Vec3):SourcePath|null {
    const r=length(p),height=r-this.g.radius,up=scale(p,1/r),mu=Math.max(-1,Math.min(1,dot(up,geometric)));
    const xx=sourceCoordinate(mu,this.angles),yy=Math.sqrt(Math.max(0,height-.001)/(this.g.top-.001))*(this.heights-1);
    const x=Math.max(0,Math.min(this.angles-2,Math.floor(xx))),y=Math.max(0,Math.min(this.heights-2,Math.floor(yy)));
    const u=Math.max(0,Math.min(1,xx-x)),v=Math.max(0,Math.min(1,yy-y));
    if(mu<this.horizon[y]*(1-v)+this.horizon[y+1]*v)return null;
    const columns:Column=[0,0,0,0];let weight=0,apparentMu=0,focusing=0;
    for(let j=0;j<2;j++)for(let i=0;i<2;i++){
      const at=(y+j)*this.angles+x+i,off=at*4,w=(i?u:1-u)*(j?v:1-v);
      if(this.data[off]>=1e5)continue;
      for(let k=0;k<4;k++)columns[k]+=this.data[off+k]*w;
      apparentMu+=this.light[at*2]*w;focusing+=this.light[at*2+1]*w;weight+=w;
    }
    if(weight<1e-8)return null;
    apparentMu=Math.max(-1,Math.min(1,apparentMu/weight));
    return {columns:columns.map(c=>c/weight) as Column,direction:localDirection(up,geometric,mu,apparentMu),focusing:focusing/weight};
  }
  sample(p:Vec3,d:Vec3):Column|null {return this.sampleLight(p,d)?.columns??null;}
}
