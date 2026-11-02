import type { WorldSpec } from './worlds';
import type { Vec3 } from './spectrum';
import { add, scale, dot, length, unit, cross } from './vectors';
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
}
export type Column = [number,number,number,number];
export function atmosphereGeometry(w: WorldSpec): AtmosGeometry {
  const gasH=Math.max(.1,w.scaleHeightKm), aerosolH=w.aerosolHeightKm;
  return {radius:w.radiusKm,top:Math.max(12*gasH,12*aerosolH,w.clouds.centreKm+6*w.clouds.sigmaKm,60),
    gasH,aerosolH,ozoneCentre:25,ozoneSigma:8,cloudCentre:w.clouds.centreKm,cloudSigma:w.clouds.sigmaKm};
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
export interface Segment { p: Vec3; density: Column; ds: number; h: number; }
export function raySegments(g: AtmosGeometry,p: Vec3,d: Vec3,count=64): {segments: Segment[]; ground: boolean; distance: number} {
  const outer=sphereHit(p,d,g.radius+g.top), groundDistance=sphereHit(p,d,g.radius);
  const ground=groundDistance>0 && groundDistance<outer;
  const distance=ground?groundDistance:Math.max(0,outer);
  const segments: Segment[]=[];
  for(let j=0;j<count;j++) {
    // Quadratic spacing resolves the observer's dense lower atmosphere.
    const a=distance*(j/count)**2,b=distance*((j+1)/count)**2;
    const q=add(p,scale(d,(a+b)/2)), h=length(q)-g.radius;
    segments.push({p:q,h,density:densities(g,h),ds:b-a});
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

/** Path-column lookup parameterised densely near grazing angles. */
export class ColumnLookup {
  readonly data: Float32Array;
  constructor(readonly g: AtmosGeometry,readonly heights=48,readonly angles=192) {
    this.data=new Float32Array(heights*angles*4);
    for(let y=0;y<heights;y++) for(let x=0;x<angles;x++) {
      const h=.001+g.top*(y/(heights-1))**2, v=2*x/(angles-1)-1, mu=Math.sign(v)*v*v;
      const cols=pathColumns(g,[0,g.radius+h,0],[Math.sqrt(1-mu*mu),mu,0],64);
      for(let k=0;k<4;k++) this.data[(y*angles+x)*4+k]=cols?cols[k]:1e6;
    }
  }
  sample(p: Vec3,d: Vec3): Column|null {
    const r=length(p), h=r-this.g.radius, mu=dot(p,d)/r;
    if(mu<0 && r*r*(1-mu*mu)<this.g.radius**2) return null;
    const xx=(Math.sign(mu)*Math.sqrt(Math.abs(mu))+1)*.5*(this.angles-1);
    const yy=Math.sqrt(Math.max(0,h-.001)/this.g.top)*(this.heights-1);
    const x=Math.max(0,Math.min(this.angles-2,Math.floor(xx))),y=Math.max(0,Math.min(this.heights-2,Math.floor(yy)));
    const u=Math.max(0,Math.min(1,xx-x)),v=Math.max(0,Math.min(1,yy-y));
    const out: Column=[0,0,0,0]; let weight=0;
    for(let j=0;j<2;j++) for(let i=0;i<2;i++) {
      const off=((y+j)*this.angles+x+i)*4,w=(i?u:1-u)*(j?v:1-v);
      // Never interpolate the occultation sentinel into an illuminated ray.
      if(this.data[off]>=1e5) continue;
      for(let k=0;k<4;k++) out[k]+=w*this.data[off+k]; weight+=w;
    }
    if(weight<1e-6) return pathColumns(this.g,p,d,64);
    return out.map(x=>x/weight) as Column;
  }
}
