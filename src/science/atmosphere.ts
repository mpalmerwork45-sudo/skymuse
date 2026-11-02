/** Spectral optical depths and physical stellar boundary conditions. */
import type { WorldSpec } from './worlds';
import { METHANE } from './data/methane';
import { AU_KM, SUN_KM, NM, OZONE, BANDS, stellarSpectrum, stellarLuminosity, rgb, xyz, type Vec3 } from './spectrum';
import { observerRayLookup, direction, stellarDisc, DEG, type Column, type RefractionView } from './geometry';
import type {IncidentLight} from './lighting';

export interface ChannelSet { r:number; g:number; b:number; }
export interface SkyOptions {
  sunElevDeg:number; sunAzDeg:number; aerosolScale:number; absorptionOn:boolean;
  eyeAdapted:boolean; exposure:number; observerHeightKm?:number;
  /** Spherical achromatic primary-ray refraction; enabled unless false. */
  refractionOn?:boolean;
  /** Reflected companion light in the observer's geometric frame. */
  illuminants?:IncidentLight[];
}
export interface Optics {
  /** Extinction by gas (Rayleigh + methane), haze, ozone, cloud. */
  extinction: Float64Array[];
  rayleigh: Float64Array; aerosol: Float64Array; cloud: Float64Array;
  aerosolG: Float64Array;
}
export interface SkyState extends SkyOptions {
  tauR:ChannelSet; tauM:ChannelSet; tauA:ChannelSet; tauT:ChannelSet;
  columnFactor:number; fluxWm2:number; fluxRel:number; starAngularDeg:number;
  spectrum:Float64Array; discRadiance:Float64Array; directSpectrum:Float64Array;
  directNormalRGB:Vec3; directHorizontalRGB:Vec3; starColor:Vec3;
  /** Direct component only until the worker integrates diffuse radiance. */
  lux:number; directLux:number; diffuseLux:number;
  adaptGain:number; exposureFinal:number;
  optics:Optics;
  refraction:RefractionView;
  /** Null if the centre has no primary ray above the planetary limb. */
  sunApparentElevDeg:number|null;
  lights:DirectLight[]; secondaryDirectLux:number;
}
export interface DirectLight extends IncidentLight {directSpectrum:Float64Array;directLux:number;}
const XSEC: Record<string,number>={n2:1,o2:.9,ar:.85,co2:2.3,h2:.18,he:.035,ch4:1.6,h2o:.65,so2:3.2};
export function columnFactor(w:WorldSpec):number {
  let mix=0,total=0;
  for(const [gas,f] of Object.entries(w.gases)) {mix+=(f??0)*(XSEC[gas]??0);total+=f??0;}
  return total>0 ? (w.pressureBar/1.01325)*(28.97/w.molarMass)*(9.81/w.gravityMs2)*mix/total/(.78+.21*.9+.01*.85):0;
}
export function wavelengthValue(values:Vec3,nm:number):number {
  return nm<550 ? values[2]+(values[1]-values[2])*Math.max(0,(nm-440)/110)
    :values[1]+(values[0]-values[1])*Math.min(1,(nm-550)/130);
}
export function molecularColumn(w:WorldSpec):number {
  return w.pressureBar*1e5/w.gravityMs2/(w.molarMass*1e-3)*6.02214076e23;
}
export function makeOptics(w:WorldSpec,o:SkyOptions):Optics {
  const rayleigh=Float64Array.from(NM,nm=>.099*columnFactor(w)*(550/nm)**4);
  const mixTotal=Object.values(w.gases).reduce((a,b)=>a+(b??0),0);
  const ch4Column=molecularColumn(w)*(w.gases.ch4??0)/Math.max(mixTotal,1e-20);
  // Do not extrapolate the cold-gas fit outside its measured temperature range.
  const z=(Math.max(100,Math.min(296,w.temperatureK))-198)/98;
  const extinction=NM.map((nm,i)=> {
    const m=METHANE[i];
    const sigma=m[0]>0 ? Math.exp(.5*z*(z-1)*Math.log(m[0])+(1-z*z)*Math.log(m[1])+.5*z*(z+1)*Math.log(m[2])):0;
    return Float64Array.of(rayleigh[i]+(o.absorptionOn?ch4Column*sigma:0),
      w.aerosol.density*o.aerosolScale*(550/nm)**w.aerosol.angstrom,
      o.absorptionOn?w.ozoneDU*2.687e20*OZONE[i]:0,w.clouds.opticalDepth);
  });
  return {extinction,rayleigh,
    aerosol:Float64Array.from(NM,(nm,i)=>extinction[i][1]*Math.max(0,Math.min(1,w.aerosol.albedo*wavelengthValue(w.aerosol.tint,nm)))),
    cloud:Float64Array.from(NM,()=>w.clouds.opticalDepth*w.clouds.singleScatteringAlbedo),
    aerosolG:Float64Array.from(NM,nm=>w.aerosol.gRGB?wavelengthValue(w.aerosol.gRGB,nm):w.aerosol.g)};
}
export function opticalDepth(optics:Optics,i:number,c:Column):number {
  const t=optics.extinction[i];return t[0]*c[0]+t[1]*c[1]+t[2]*c[2]+t[3]*c[3];
}
export function transmission(optics:Optics,c:Column|null):Float64Array {
  return Float64Array.from(NM,(_,i)=>c?Math.exp(-opticalDepth(optics,i,c)):0);
}
export function computeSky(w:WorldSpec,o:SkyOptions):SkyState {
  const optics=makeOptics(w,o),spectrum=stellarSpectrum(w.star,w.distanceAU);
  const radius=Math.asin(Math.min(.999,w.star.radiusSun*SUN_KM/(w.distanceAU*AU_KM)));
  const discRadiance=Float64Array.from(spectrum,e=>e/(Math.PI*Math.sin(radius)**2));
  const observer=observerRayLookup(w,o.observerHeightKm??.0017,o.refractionOn!==false);
  const dir=direction(o.sunAzDeg,o.sunElevDeg);
  const lights:DirectLight[]=[{name:w.star.name,direction:dir,radiusRad:radius,spectrum},...(o.illuminants??[])].map(source=>{
    const directSpectrum=new Float64Array(BANDS);
    for(const q of stellarDisc(source.direction,source.radiusRad,96)){
      const light=observer.sample(q.dir);if(!light||light.direction[1]<=0)continue;
      for(let i=0;i<BANDS;i++)directSpectrum[i]+=source.spectrum[i]*q.weight*light.focusing*light.direction[1]*Math.exp(-opticalDepth(optics,i,light.columns));
    }
    return {...source,directSpectrum,directLux:xyz(directSpectrum)[1]};
  });
  const directSpectrum=new Float64Array(BANDS);
  for(const light of lights)for(let i=0;i<BANDS;i++)directSpectrum[i]+=light.directSpectrum[i];
  const centre=observer.sample(dir);
  const normal=transmission(optics,centre?.columns??null).map((t,i)=>t*spectrum[i]*(centre?.focusing??0));
  const select=(f:(i:number)=>number):ChannelSet=>({r:f(32),g:f(19),b:f(8)});
  const tauR=select(i=>optics.rayleigh[i]),tauM=select(i=>optics.extinction[i][1]);
  const tauA=select(i=>optics.extinction[i][0]-optics.rayleigh[i]+optics.extinction[i][2]);
  const tauT=select(i=>optics.extinction[i].reduce((a,b)=>a+b,0));
  const fluxWm2=1361*stellarLuminosity(w.star)/w.distanceAU**2,directLux=xyz(directSpectrum)[1];
  return {...o,optics,spectrum,discRadiance,directSpectrum,tauR,tauM,tauA,tauT,
    columnFactor:columnFactor(w),fluxWm2,fluxRel:fluxWm2/1361,starAngularDeg:2*radius/DEG,
    directNormalRGB:rgb(normal),directHorizontalRGB:rgb(directSpectrum),starColor:rgb(spectrum),
    lux:directLux,directLux,diffuseLux:0,adaptGain:1,exposureFinal:o.exposure,
    refraction:observer.view,lights,secondaryDirectLux:lights.slice(1).reduce((sum,l)=>sum+l.directLux,0),
    sunApparentElevDeg:centre?Math.asin(Math.max(-1,Math.min(1,centre.direction[1])))/DEG:null};
}

export const CAMERA_GAIN=1/20000;
/** Display approximation, not a prediction of retinal perception. */
export function displayGain(luminance:number,adapted:boolean):number {
  return adapted ? .18/Math.max(.002,luminance) : CAMERA_GAIN;
}
