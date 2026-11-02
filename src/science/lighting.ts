/** Single-bounce Lambertian companion illumination. See model notes for limits. */
import type {WorldSpec} from './worlds';
import type {AstronomyState,BodyView} from './astronomy';
import {AU_KM,SUN_KM,stellarSpectrum,reflectance,xyz,type Vec3} from './spectrum';
import {direction,unit,dot,length,sub,scale,sphereHit,stellarDisc} from './geometry';

export interface IncidentLight {name:string;direction:Vec3;radiusRad:number;spectrum:Float64Array;}
/** Surface diffuse reflectance rho gives geometric albedo 2 rho / 3. */
export function lambertPhase(alpha:number):number {
  if(alpha>=Math.PI-1e-12)return 0;
  return Math.max(0,(Math.sin(alpha)+(Math.PI-alpha)*Math.cos(alpha))/Math.PI);
}
export function reflectedIrradiance(body:BodyView,stellar:Float64Array,sun:Vec3):Float64Array {
  const distance=length(body.position),alpha=Math.acos(Math.max(-1,Math.min(1,-dot(unit(body.position),sun))));
  const factor=2/3*(body.radiusKm/distance)**2*lambertPhase(alpha),rho=reflectance(body.colour,body.albedo);
  return stellar.map((e,i)=>e*rho[i]*factor);
}
/** Approximate finite-disc penumbra integrated over the visible companion.
 * Both the observer's parent sphere and other companions can block stellar rays.
 * This first bounce does not feed back into companion images or ring scattering.
 */
export function companionShadow(body:BodyView,w:WorldSpec,a:AstronomyState,sun:Vec3,sunRadius:number):number {
  const centre=body.position,distance=length(centre),radius=Math.asin(body.radiusKm/distance);
  const incident=stellarDisc(sun,sunRadius,16),view=stellarDisc(unit(centre),radius,64);
  let lit=0,unshadowed=0;
  const blockers=[{position:a.ringOrigin,radiusKm:w.radiusKm},...a.bodies.filter(b=>b!==body)];
  for(const q of view){
    const t=sphereHit(scale(centre,-1),q.dir,body.radiusKm);if(t<0)continue;
    const p=scale(q.dir,t),normal=unit(sub(p,centre));
    for(const ray of incident){
      const weight=q.weight*ray.weight*Math.max(0,dot(normal,ray.dir));
      unshadowed+=weight;
      if(!blockers.some(b=>sphereHit(sub(p,b.position),ray.dir,b.radiusKm)>0))lit+=weight;
    }
  }
  return unshadowed>0?Math.max(0,Math.min(1,lit/unshadowed)):0;
}

export function companionIlluminants(w:WorldSpec,a:AstronomyState):IncidentLight[] {
  const stellar=stellarSpectrum(w.star,a.distanceAU),sun=direction(a.sunAzDeg,a.sunElevDeg);
  const sunRadius=Math.asin(Math.min(.999,w.star.radiusSun*SUN_KM/(a.distanceAU*AU_KM)));
  return a.bodies.slice(0,12).flatMap(body=>{
    const spectrum=reflectedIrradiance(body,stellar,sun),shadow=companionShadow(body,w,a,sun,sunRadius);
    for(let i=0;i<spectrum.length;i++)spectrum[i]*=shadow;
    if(xyz(spectrum)[1]<1e-12)return [];
    return [{name:body.name,direction:unit(body.position),radiusRad:Math.asin(body.radiusKm/length(body.position)),spectrum}];
  });
}
