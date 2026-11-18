import type { WorldSpec } from './worlds';
import { computeSky, opticalDepth, type SkyOptions, type SkyState } from './atmosphere';
import { BANDS, NM, CIE, reflectance, rgb, planck, type Vec3 } from './spectrum';
import { atmosphereGeometry, ColumnLookup, direction, azElev, dot, length, raySegments, stellarDisc, verticalColumn, heightGrid, DEG, type Column } from './geometry';
import { lowerIndex } from './sampling';
import { emittingLayer, solveLayers } from './twoStream';
import { refractiveIndex } from './refraction';

export const phaseR=(cos:number)=>3*(1+cos*cos)/(16*Math.PI);
export const phaseHG=(cos:number,g:number)=>(1-g*g)/(4*Math.PI*(1+g*g-2*g*cos)**1.5);
export interface TransportResult {
  width:number; height:number; radiance:Float32Array; columns:Float32Array;
  fullAzimuth:boolean;
  groundLights:{direction:Vec3;radiusRad:number;rgb:Vec3}[];
  diffuseRGB:Vec3; groundRGB:Vec3; groundDirectRGB:Vec3; groundDiffuseRGB:Vec3;
  lux:number; diffuseLux:number; meanLuminance:number; diffuseSpectrum:Float64Array;
  /** Downwelling flux from the angularly approximate two-stream solution. */
  twoStreamLux:number; elapsedMs:number;
  singleLux:number; multipleLux:number;
}
export interface Quality {width:number;height:number;steps:number;layers:number;discSamples:number;}
export const STANDARD:Quality={width:64,height:40,steps:48,layers:128,discSamples:24};

let geometryCache: {key:string;lookup:ColumnLookup}|undefined;
export function getLookup(w:WorldSpec,refractionOn=true):ColumnLookup {
  const g=atmosphereGeometry(w,refractionOn),key=JSON.stringify(g);
  if(geometryCache?.key!==key) geometryCache={key,lookup:new ColumnLookup(g)};
  return geometryCache!.lookup;
}

/** Logarithmic mean of beam transmissions, exact in a constant-opacity layer. */
function beamMean(a:number,b:number):number {
  if(Math.abs(a-b)<1e-5) return Math.exp(-(a+b)/2);
  return (Math.exp(-a)-Math.exp(-b))/(b-a);
}

export function diffuseProfile(w:WorldSpec,s:SkyState,lookup:ColumnLookup,n:number,thermalOn=true) {
  const g=lookup.g, heights=heightGrid(g,0,n+1);
  const sun=stellarDisc(direction(0,s.sunElevDeg),s.starAngularDeg*DEG/2,s.starAngularDeg>2?64:12);
  const columns=Array.from(heights,h=>sun.map(q=>lookup.sampleLight([0,g.radius+Math.max(.001,h),0],q.dir)));
  const rho=reflectance(w.surfaceColor,w.groundAlbedo);
  const up:Float64Array[]=[],down:Float64Array[]=[];
  for(let i=0;i<BANDS;i++) {
    const layers=[];
    for(let j=0;j<heights.length-1;j++) {
      const c=verticalColumn(g,heights[j],heights[j+1]);
      const tau=opticalDepth(s.optics,i,c);
      const tr=s.optics.rayleigh[i]*c[0],tm=s.optics.aerosol[i]*c[1],tc=s.optics.cloud[i]*c[3],scat=tr+tm+tc;
      const asym=scat>0?(tm*s.optics.aerosolG[i]+tc*w.clouds.g)/scat:0;
      let source=0,muWeighted=0;
      for(let k=0;k<sun.length;k++) {
        const a=columns[j][k],b=columns[j+1][k];
        const ta=a?opticalDepth(s.optics,i,a.columns):1e5,tb=b?opticalDepth(s.optics,i,b.columns):1e5;
        // For a layer straddling the planetary shadow, integrate its lit fraction
        // with midpoint rays instead of smearing the occulted endpoint.
        let mean=beamMean(ta,tb)*((a?.focusing??0)+(b?.focusing??0))/2;
        let apparentMu=((a?.direction[1]??0)+(b?.direction[1]??0))/2;
        if(!a || !b) {
          mean=0;let muNumerator=0;
          for(let l=0;l<4;l++) {
            const h=heights[j]+(l+.5)/4*(heights[j+1]-heights[j]);
            const cc=lookup.sampleLight([0,g.radius+h,0],sun[k].dir);
            if(cc){const light=cc.focusing*Math.exp(-opticalDepth(s.optics,i,cc.columns))/4;mean+=light;muNumerator+=light*cc.direction[1];}
          }
          apparentMu=mean>0?muNumerator/mean:0;
        }
        const q=s.spectrum[i]*sun[k].weight*mean*scat;
        source+=q; muWeighted+=q*apparentMu;
      }
      const forward=source>0 ? .5*(1+asym*muWeighted/source):.5;
      const thermal=thermalOn?2*Math.PI*refractiveIndex(g,(heights[j]+heights[j+1])/2)**2*planck(NM[i],w.temperatureK)*Math.max(0,tau-scat):0;
      layers.push(emittingLayer(tau,tau>0?scat/tau:0,asym,source*(1-forward)+thermal,source*forward+thermal));
    }
    const ground=rho[i]*s.directSpectrum[i]+(thermalOn?Math.PI*(1-rho[i])*refractiveIndex(g,0)**2*planck(NM[i],w.temperatureK):0);
    const f=solveLayers(layers,rho[i],ground);
    up.push(f.up);down.push(f.down);
  }
  return {heights,up,down,rho};
}

/** Integrate a cell's solid angle and horizontal projection on the mirrored half-sky. */
export function hemisphereCellWeights(x:number,width:number,sinLower:number,sinUpper:number) {
  // The samples at 0 and pi have half a cell on the stored half-sky.
  // Reflection across the source meridian accounts for the other half-sky.
  const halfCell = x === 0 || x === width - 1;
  const azimuthSpan = (halfCell ? Math.PI : 2 * Math.PI) / (width - 1);
  const solidAngle = azimuthSpan * (sinUpper - sinLower);
  return {solidAngle, projectedAngle: solidAngle * (sinUpper + sinLower) / 2};
}

function integrateLight(w:WorldSpec,s:SkyState,quality:Quality,thermalOn:boolean):TransportResult {
  const start=performance.now(),opts=s,lookup=getLookup(w,opts.refractionOn!==false),g=lookup.g;
  const {width,height,steps,layers}=quality,p:Vec3=[0,w.radiusKm+(opts.observerHeightKm??.0017),0];
  const profile=diffuseProfile(w,s,lookup,layers,thermalOn);
  const cap=stellarDisc(direction(0,opts.sunElevDeg),s.starAngularDeg*DEG/2,
    s.starAngularDeg>2?quality.discSamples:8);
  const radiance=new Float32Array(width*height*4),columns=new Float32Array(height*4);
  const diffuseSpectrum=new Float64Array(BANDS);
  let meanLuminance=0,singleLux=0,multipleLux=0;
  for(let y=0;y<height;y++) {
    // Quadratically concentrated samples at the horizon, with endpoints included.
    const elevation=(y/(height-1))**2*Math.PI/2;
    const ray=raySegments(g,p,[Math.cos(elevation),Math.sin(elevation),0],steps);
    const total:Column=[0,0,0,0];
    for(const q of ray.segments) for(let k=0;k<4;k++) total[k]+=q.density[k]*q.ds;
    columns.set(total,y*4);
    const lo=y===0?0:((y-.5)/(height-1))**2*Math.PI/2;
    const hi=y===height-1?Math.PI/2:((y+.5)/(height-1))**2*Math.PI/2;
    const sinLower=Math.sin(lo),sinUpper=Math.sin(hi);
    for(let x=0;x<width;x++) {
      // [0,pi] azimuth is sufficient for an azimuthally symmetric atmosphere.
      const az=x/(width-1)*Math.PI;
      const east=Math.sin(az), south=-Math.cos(az);
      const atten=new Float64Array(BANDS).fill(1),L=new Float64Array(BANDS),L1=new Float64Array(BANDS),Lm=new Float64Array(BANDS);
      // In a spherical atmosphere ray positions, tangent directions and all
      // density samples at this elevation rotate together about the zenith.
      for(const seg of ray.segments) {
        const position:Vec3=[east*seg.p[0],seg.p[1],south*seg.p[0]];
        const tangent:Vec3=[east*seg.direction[0],seg.direction[1],south*seg.direction[0]];
        const dc=seg.density.map(d=>d*seg.ds) as Column;
        const sunlight=cap.map(q=>lookup.sampleLight(position,q.dir));
        const localIndexSquared=refractiveIndex(g,seg.h)**2,rayGain=s.refraction.gain/localIndexSquared;
        const phases=sunlight.map(light=>{const mu=light?dot(tangent,light.direction):0;return {r:phaseR(mu),mu};});
        const at=lowerIndex(profile.heights,seg.h);
        const f=Math.min(1,Math.max(0,(seg.h-profile.heights[at])/(profile.heights[at+1]-profile.heights[at])));
        for(let i=0;i<BANDS;i++) {
          if(atten[i]<1e-14) continue;
          const tau=opticalDepth(s.optics,i,dc),tr=s.optics.rayleigh[i]*dc[0],tm=s.optics.aerosol[i]*dc[1],tc=s.optics.cloud[i]*dc[3];
          let single=0;
          for(let k=0;k<cap.length;k++) {
            const light=sunlight[k];if(!light) continue;
            const phase=tr*phases[k].r+tm*phaseHG(phases[k].mu,s.optics.aerosolG[i])+tc*phaseHG(phases[k].mu,w.clouds.g);
            single+=s.spectrum[i]*cap[k].weight*light.focusing*Math.exp(-opticalDepth(s.optics,i,light.columns))*phase;
          }
          const up=profile.up[i][at]*(1-f)+profile.up[i][at+1]*f;
          const down=profile.down[i][at]*(1-f)+profile.down[i][at+1]*f;
          // Hemispheric source-function reconstruction. This source uses only
          // diffuse light: no duplication of the separately integrated first scatter.
          const mu=dot(seg.p,seg.direction)/length(seg.p);
          const asym=(tm*s.optics.aerosolG[i]+tc*w.clouds.g)/Math.max(1e-30,tr+tm+tc);
          const multiple=(tr+tm+tc)*((1-asym*mu)*up+(1+asym*mu)*down)/(2*Math.PI);
          const thermal=thermalOn?Math.max(0,tau-tr-tm-tc)*localIndexSquared*planck(NM[i],w.temperatureK):0;
          const integral=tau>1e-9?-Math.expm1(-tau)/tau:1-tau/2;
          L[i]+=rayGain*atten[i]*(single+multiple+thermal)*integral;
          L1[i]+=rayGain*atten[i]*single*integral;Lm[i]+=rayGain*atten[i]*multiple*integral;
          atten[i]*=Math.exp(-tau);
        }
      }
      const colour=rgb(L),offset=(y*width+x)*4;
      radiance.set([...colour,1],offset);
      const {solidAngle,projectedAngle}=hemisphereCellWeights(x,width,sinLower,sinUpper);
      for(let i=0;i<BANDS;i++) {
        diffuseSpectrum[i]+=L[i]*projectedAngle;
        singleLux+=L1[i]*CIE[i][1]*projectedAngle;
        multipleLux+=Lm[i]*CIE[i][1]*projectedAngle;
      }
      meanLuminance+=Math.max(0,L.reduce((n,l,i)=>n+l*CIE[i][1],0))*solidAngle/(2*Math.PI);
    }
  }
  const diffuseRGB=rgb(diffuseSpectrum),groundDirect=new Float64Array(BANDS),groundDiffuse=new Float64Array(BANDS);
  for(let i=0;i<BANDS;i++) {
    groundDirect[i]=profile.rho[i]*s.directSpectrum[i]/Math.PI;
    groundDiffuse[i]=profile.rho[i]*diffuseSpectrum[i]/Math.PI+(thermalOn?(1-profile.rho[i])*s.refraction.gain*planck(NM[i],w.temperatureK):0);
  }
  const groundDirectRGB=rgb(groundDirect),groundDiffuseRGB=rgb(groundDiffuse);
  const groundRGB=groundDirectRGB.map((v,i)=>v+groundDiffuseRGB[i]) as Vec3;
  const diffuseLux=diffuseSpectrum.reduce((a,v,i)=>a+v*CIE[i][1],0);
  const twoStreamLux=profile.down.reduce((a,v,i)=>a+v[0]*CIE[i][1],0);
  return {width,height,radiance,columns,diffuseRGB,groundRGB,groundDirectRGB,groundDiffuseRGB,
    fullAzimuth:false,groundLights:[{direction:direction(s.sunAzDeg,s.sunElevDeg),radiusRad:s.starAngularDeg*DEG/2,rgb:groundDirectRGB}],
    lux:s.directLux+diffuseLux,diffuseLux,diffuseSpectrum,meanLuminance,twoStreamLux,singleLux,multipleLux,elapsedMs:performance.now()-start};
}

/** Sample an axisymmetric half-sky at an arbitrary azimuth and row coordinate. */
function componentPixel(t:TransportResult,azimuth:number,row:number,channel:number):number {
  const a=Math.acos(Math.max(-1,Math.min(1,Math.cos(azimuth)))),xx=a/Math.PI*(t.width-1),yy=row*(t.height-1);
  const x=Math.min(t.width-2,Math.floor(xx)),y=Math.min(t.height-2,Math.floor(yy)),u=xx-x,v=yy-y;
  const at=(x:number,y:number)=>t.radiance[(y*t.width+x)*4+channel];
  return (at(x,y)*(1-u)+at(x+1,y)*u)*(1-v)+(at(x,y+1)*(1-u)+at(x+1,y+1)*u)*v;
}

export function computeTransport(w:WorldSpec,opts:SkyOptions,quality:Quality=STANDARD):TransportResult {
  const start=performance.now(),s=computeSky(w,opts);
  // Transfer is linear in incoming light. Solve each axisymmetric illumination
  // separately, then rotate and add its field. Thermal emission is counted once.
  const parts=s.lights.map((light,index)=>{
    const [az,el]=azElev(light.direction);
    const state={...s,sunAzDeg:az,sunElevDeg:el,spectrum:light.spectrum,directSpectrum:light.directSpectrum,directLux:light.directLux,starAngularDeg:2*light.radiusRad/DEG};
    return {azimuth:az*DEG,result:integrateLight(w,state,quality,index===0)};
  });
  const first=parts[0].result;
  if(parts.length===1){first.elapsedMs=performance.now()-start;return first;}
  const width=2*(first.width-1)+1,height=first.height,radiance=new Float32Array(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const phi=2*Math.PI*x/(width-1)+parts[0].azimuth;
    for(let c=0;c<3;c++)radiance[(y*width+x)*4+c]=parts.reduce((sum,p)=>sum+componentPixel(p.result,phi-p.azimuth,y/(height-1),c),0);
    radiance[(y*width+x)*4+3]=1;
  }
  const vector=(key:'diffuseRGB'|'groundRGB'|'groundDirectRGB'|'groundDiffuseRGB'):Vec3=>[0,1,2].map(c=>parts.reduce((sum,p)=>sum+p.result[key][c],0)) as Vec3;
  const scalar=(key:'lux'|'diffuseLux'|'meanLuminance'|'twoStreamLux'|'singleLux'|'multipleLux')=>parts.reduce((sum,p)=>sum+p.result[key],0);
  const diffuseSpectrum=Float64Array.from({length:BANDS},(_,i)=>parts.reduce((sum,p)=>sum+p.result.diffuseSpectrum[i],0));
  return {...first,width,height,radiance,fullAzimuth:true,groundLights:parts.flatMap(p=>p.result.groundLights),diffuseSpectrum,
    diffuseRGB:vector('diffuseRGB'),groundRGB:vector('groundRGB'),groundDirectRGB:vector('groundDirectRGB'),groundDiffuseRGB:vector('groundDiffuseRGB'),
    lux:scalar('lux'),diffuseLux:scalar('diffuseLux'),meanLuminance:scalar('meanLuminance'),twoStreamLux:scalar('twoStreamLux'),singleLux:scalar('singleLux'),multipleLux:scalar('multipleLux'),elapsedMs:performance.now()-start};
}
