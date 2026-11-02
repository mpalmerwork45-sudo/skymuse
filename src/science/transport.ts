import type { WorldSpec } from './worlds';
import { computeSky, opticalDepth, type SkyOptions, type SkyState } from './atmosphere';
import { BANDS, NM, BAND_RGB, CIE, reflectance, rgb, planck, type Vec3 } from './spectrum';
import { atmosphereGeometry, ColumnLookup, densities, direction, dot, length, raySegments, stellarDisc, verticalColumn, DEG, type Column } from './geometry';
import { emittingLayer, solveLayers } from './twoStream';

export const phaseR=(cos:number)=>3*(1+cos*cos)/(16*Math.PI);
export const phaseHG=(cos:number,g:number)=>(1-g*g)/(4*Math.PI*(1+g*g-2*g*cos)**1.5);
export interface TransportResult {
  width:number; height:number; radiance:Float32Array; columns:Float32Array;
  diffuseRGB:Vec3; groundRGB:Vec3; groundDirectRGB:Vec3; groundDiffuseRGB:Vec3;
  lux:number; diffuseLux:number; meanLuminance:number; diffuseSpectrum:Float64Array;
  /** Downwelling flux from the angularly approximate two-stream solution. */
  twoStreamLux:number; elapsedMs:number;
  singleLux:number; multipleLux:number;
}
export interface Quality {width:number;height:number;steps:number;layers:number;discSamples:number;}
export const STANDARD:Quality={width:64,height:40,steps:48,layers:128,discSamples:24};

let geometryCache: {key:string;lookup:ColumnLookup}|undefined;
export function getLookup(w:WorldSpec):ColumnLookup {
  const g=atmosphereGeometry(w),key=JSON.stringify(g);
  if(geometryCache?.key!==key) geometryCache={key,lookup:new ColumnLookup(g)};
  return geometryCache!.lookup;
}

/** Logarithmic mean of beam transmissions, exact in a constant-opacity layer. */
function beamMean(a:number,b:number):number {
  if(Math.abs(a-b)<1e-5) return Math.exp(-(a+b)/2);
  return (Math.exp(-a)-Math.exp(-b))/(b-a);
}

export function diffuseProfile(w:WorldSpec,s:SkyState,lookup:ColumnLookup,n:number) {
  const g=lookup.g, heights=Float64Array.from({length:n+1},(_,j)=>g.top*(j/n)**2);
  const sun=stellarDisc(direction(0,s.sunElevDeg),s.starAngularDeg*DEG/2,s.starAngularDeg>2?64:12);
  const columns=Array.from(heights,h=>sun.map(q=>lookup.sample([0,g.radius+Math.max(.001,h),0],q.dir)));
  const rho=reflectance(w.surfaceColor,w.groundAlbedo);
  const up:Float64Array[]=[],down:Float64Array[]=[];
  for(let i=0;i<BANDS;i++) {
    const layers=[];
    for(let j=0;j<n;j++) {
      const c=verticalColumn(g,heights[j],heights[j+1]);
      const tau=opticalDepth(s.optics,i,c);
      const tr=s.optics.rayleigh[i]*c[0],tm=s.optics.aerosol[i]*c[1],tc=s.optics.cloud[i]*c[3],scat=tr+tm+tc;
      const asym=scat>0?(tm*s.optics.aerosolG[i]+tc*w.clouds.g)/scat:0;
      let source=0,muWeighted=0;
      for(let k=0;k<sun.length;k++) {
        const a=columns[j][k],b=columns[j+1][k];
        const ta=a?opticalDepth(s.optics,i,a):1e5,tb=b?opticalDepth(s.optics,i,b):1e5;
        // For a layer straddling the planetary shadow, integrate its lit fraction
        // with midpoint rays instead of smearing the occulted endpoint.
        let mean=beamMean(ta,tb);
        if(!a || !b) {
          mean=0;
          for(let l=0;l<4;l++) {
            const h=heights[j]+(l+.5)/4*(heights[j+1]-heights[j]);
            const cc=lookup.sample([0,g.radius+h,0],sun[k].dir);
            if(cc) mean+=Math.exp(-opticalDepth(s.optics,i,cc))/4;
          }
        }
        const q=s.spectrum[i]*sun[k].weight*mean*scat;
        source+=q; muWeighted+=q*sun[k].dir[1];
      }
      const forward=source>0 ? .5*(1+asym*muWeighted/source):.5;
      const thermal=2*Math.PI*planck(NM[i],w.temperatureK)*Math.max(0,tau-scat);
      layers.push(emittingLayer(tau,tau>0?scat/tau:0,asym,source*(1-forward)+thermal,source*forward+thermal));
    }
    const ground=rho[i]*s.directSpectrum[i]+Math.PI*(1-rho[i])*planck(NM[i],w.temperatureK);
    const f=solveLayers(layers,rho[i],ground);
    up.push(f.up);down.push(f.down);
  }
  return {heights,up,down,rho};
}

export function computeTransport(w:WorldSpec,opts:SkyOptions,quality:Quality=STANDARD):TransportResult {
  const start=performance.now(),s=computeSky(w,opts),lookup=getLookup(w),g=lookup.g;
  const {width,height,steps,layers}=quality,p:Vec3=[0,w.radiusKm+(opts.observerHeightKm??.0017),0];
  const profile=diffuseProfile(w,s,lookup,layers);
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
    const fluxWeight=Math.PI/width*(Math.sin(hi)**2-Math.sin(lo)**2);
    const solidWeight=2*Math.PI/width*(Math.sin(hi)-Math.sin(lo));
    for(let x=0;x<width;x++) {
      // [0,pi] azimuth is sufficient for an azimuthally symmetric atmosphere.
      const az=x/(width-1)*Math.PI;
      const v=direction(az/DEG,elevation/DEG),view=raySegments(g,p,v,steps);
      const atten=new Float64Array(BANDS).fill(1),L=new Float64Array(BANDS),L1=new Float64Array(BANDS),Lm=new Float64Array(BANDS);
      const phases=cap.map(q=>({r:phaseR(dot(v,q.dir)),mu:dot(v,q.dir)}));
      for(const seg of view.segments) {
        const dc=seg.density.map(d=>d*seg.ds) as Column;
        const sunCols=cap.map(q=>lookup.sample(seg.p,q.dir));
        const at=Math.min(layers-1,Math.max(0,Math.floor(Math.sqrt(Math.max(0,seg.h)/g.top)*layers)));
        const f=Math.min(1,Math.max(0,(seg.h-profile.heights[at])/(profile.heights[at+1]-profile.heights[at])));
        for(let i=0;i<BANDS;i++) {
          if(atten[i]<1e-14) continue;
          const tau=opticalDepth(s.optics,i,dc),tr=s.optics.rayleigh[i]*dc[0],tm=s.optics.aerosol[i]*dc[1],tc=s.optics.cloud[i]*dc[3];
          let single=0;
          for(let k=0;k<cap.length;k++) {
            const c=sunCols[k];if(!c) continue;
            const phase=tr*phases[k].r+tm*phaseHG(phases[k].mu,s.optics.aerosolG[i])+tc*phaseHG(phases[k].mu,w.clouds.g);
            single+=s.spectrum[i]*cap[k].weight*Math.exp(-opticalDepth(s.optics,i,c))*phase;
          }
          const up=profile.up[i][at]*(1-f)+profile.up[i][at+1]*f;
          const down=profile.down[i][at]*(1-f)+profile.down[i][at+1]*f;
          // Hemispheric source-function reconstruction. This source uses only
          // diffuse light: no duplication of the separately integrated first scatter.
          const mu=dot(seg.p,v)/length(seg.p);
          const asym=(tm*s.optics.aerosolG[i]+tc*w.clouds.g)/Math.max(1e-30,tr+tm+tc);
          const multiple=(tr+tm+tc)*((1-asym*mu)*up+(1+asym*mu)*down)/(2*Math.PI);
          const thermal=Math.max(0,tau-tr-tm-tc)*planck(NM[i],w.temperatureK);
          const integral=tau>1e-9?-Math.expm1(-tau)/tau:1-tau/2;
          L[i]+=atten[i]*(single+multiple+thermal)*integral;
          L1[i]+=atten[i]*single*integral;Lm[i]+=atten[i]*multiple*integral;
          atten[i]*=Math.exp(-tau);
        }
      }
      const colour=rgb(L),offset=(y*width+x)*4;
      radiance.set([...colour,1],offset);
      // Trapezoidal azimuth quadrature over the mirrored half-sky.
      const azWeight=width/(width-1)*(x===0||x===width-1?.5:1);
      for(let i=0;i<BANDS;i++) {diffuseSpectrum[i]+=L[i]*fluxWeight*azWeight;singleLux+=L1[i]*CIE[i][1]*fluxWeight*azWeight;multipleLux+=Lm[i]*CIE[i][1]*fluxWeight*azWeight;}
      meanLuminance+=Math.max(0,L.reduce((n,l,i)=>n+l*CIE[i][1],0))*solidWeight*azWeight/(2*Math.PI);
    }
  }
  const diffuseRGB=rgb(diffuseSpectrum),groundDirect=new Float64Array(BANDS),groundDiffuse=new Float64Array(BANDS);
  for(let i=0;i<BANDS;i++) {
    groundDirect[i]=profile.rho[i]*s.directSpectrum[i]/Math.PI;
    groundDiffuse[i]=profile.rho[i]*diffuseSpectrum[i]/Math.PI+(1-profile.rho[i])*planck(NM[i],w.temperatureK);
  }
  const groundDirectRGB=rgb(groundDirect),groundDiffuseRGB=rgb(groundDiffuse);
  const groundRGB=groundDirectRGB.map((v,i)=>v+groundDiffuseRGB[i]) as Vec3;
  const diffuseLux=diffuseSpectrum.reduce((a,v,i)=>a+v*CIE[i][1],0);
  const twoStreamLux=profile.down.reduce((a,v,i)=>a+v[0]*CIE[i][1],0);
  return {width,height,radiance,columns,diffuseRGB,groundRGB,groundDirectRGB,groundDiffuseRGB,
    lux:s.directLux+diffuseLux,diffuseLux,diffuseSpectrum,meanLuminance,twoStreamLux,singleLux,multipleLux,elapsedMs:performance.now()-start};
}
