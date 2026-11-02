import * as A from 'astronomy-engine';
import type { WorldSpec } from './worlds';
import { AU_KM, type Vec3 } from './spectrum';
import { add, sub, scale, unit, cross, dot, length, azElev, direction, DEG } from './geometry';
import ORBITS from './data/orbits.json';

export interface Observation { date:string; latitude:number; longitude:number; mode:'manual'|'ephemeris'; }
export interface BodyView { name:string; position:Vec3; radiusKm:number; albedo:number; colour:string; sunDirection:Vec3; approximate:boolean; }
export interface AstronomyState {
  sunElevDeg:number;sunAzDeg:number;distanceAU:number;
  east:Vec3;up:Vec3;north:Vec3;observerEQJ:Vec3; bodies:BodyView[];
  ringNormal:Vec3; ringOrigin:Vec3; hasEphemeris:boolean; note:string;
}
const BODY:Record<string,A.Body>={earth:A.Body.Earth,mars:A.Body.Mars,venus:A.Body.Venus,mercury:A.Body.Mercury,
  jupiter:A.Body.Jupiter,saturn:A.Body.Saturn,uranus:A.Body.Uranus,neptune:A.Body.Neptune,pluto:A.Body.Pluto,moon:A.Body.Moon};
const GM:Record<number,number>={499:42828.375214,699:37931206.23,899:6835099.5,999:975.5};
const vector=(v:{x:number;y:number;z:number}):Vec3=>[v.x,v.y,v.z];

/** Two-body propagation of Horizons osculating states. Perturbations are omitted. */
export function satellitePosition(name:string,date:Date):Vec3 {
  const o=ORBITS.find(x=>x.name===name)!;
  const r=o.position as Vec3,v=o.velocity as Vec3,mu=GM[o.parent],r0=length(r);
  const h=cross(r,v),evec=sub(scale(cross(v,h),1/mu),scale(r,1/r0)),e=length(evec);
  const a=1/(2/r0-dot(v,v)/mu),p=unit(evec),q=unit(cross(h,p));
  const cosE=(1-r0/a)/e, sinE=dot(r,v)/(e*Math.sqrt(mu*a));
  const E0=Math.atan2(sinE,cosE),M0=E0-e*Math.sin(E0);
  const dt=(date.getTime()-Date.parse(o.epoch))/1000+69.184; // Horizons epoch is TDB, UTC differs ~69 s.
  const M=(M0+Math.sqrt(mu/a**3)*dt)%(2*Math.PI);let E=M;
  for(let i=0;i<12;i++) E-=(E-e*Math.sin(E)-M)/(1-e*Math.cos(E));
  return add(scale(p,a*(Math.cos(E)-e)),scale(q,a*Math.sqrt(1-e*e)*Math.sin(E)));
}
function planetFrame(body:A.Body,date:Date,lat:number,lon:number) {
  if(body===A.Body.Earth) {
    const rot=A.Rotation_HOR_EQJ(date,new A.Observer(lat,lon,0));
    const turn=(x:number,y:number,z:number)=>vector(A.RotateVector(rot,new A.Vector(x,y,z,A.MakeTime(date))));
    return {east:turn(0,-1,0),up:turn(0,0,1),north:turn(1,0,0),pole:turn(0,Math.cos(lat*DEG),Math.sin(lat*DEG))};
  }
  const axis=A.RotationAxis(body,date),ra=axis.ra*15*DEG,dec=axis.dec*DEG;
  const pole:Vec3=[Math.cos(dec)*Math.cos(ra),Math.cos(dec)*Math.sin(ra),Math.sin(dec)];
  const i:Vec3=[-Math.sin(ra),Math.cos(ra),0],j=cross(pole,i),w=(axis.spin+lon)*DEG;
  const prime=add(scale(i,Math.cos(w)),scale(j,Math.sin(w))),east=add(scale(i,-Math.sin(w)),scale(j,Math.cos(w)));
  return {east,up:add(scale(prime,Math.cos(lat*DEG)),scale(pole,Math.sin(lat*DEG))),
    north:add(scale(prime,-Math.sin(lat*DEG)),scale(pole,Math.cos(lat*DEG))),pole};
}
const COLOURS:Record<string,string>={Earth:'#9bb7c9',Moon:'#bbbbbb',Io:'#e9d194',Europa:'#d4cdc1',Ganymede:'#c0b6a6',Callisto:'#a39788',Titan:'#c9a879',Rhea:'#dddddd',Triton:'#cfcbc9',Charon:'#a6a4a2',Saturn:'#dac69d',Neptune:'#94bdc6',Phobos:'#928273',Deimos:'#928273'};

export function observe(w:WorldSpec,o:Observation,manualElev=2,manualAz=90):AstronomyState {
  const date=new Date(o.date),isMoon=['titan','triton'].includes(w.id);
  const b=BODY[w.id]??(w.id==='titan'?A.Body.Saturn:w.id==='triton'?A.Body.Neptune:A.Body.Earth);
  let centre=w.id==='moon'?add(vector(A.HelioVector(A.Body.Earth,date)),vector(A.GeoMoon(date))):vector(A.HelioVector(b,date));
  let frame=planetFrame(b,date,o.latitude,o.longitude);
  if(isMoon) {
    const moon=w.id==='titan'?'Titan':'Triton',orb=satellitePosition(moon,date),raw=ORBITS.find(x=>x.name===moon)!;
    centre=add(centre,scale(orb,1/AU_KM));
    const pole=unit(cross(raw.position as Vec3,raw.velocity as Vec3)),prime=scale(unit(orb),-1),east=unit(cross(pole,prime));
    const rot=add(scale(prime,Math.cos(o.longitude*DEG)),scale(east,Math.sin(o.longitude*DEG)));
    frame={pole,east:unit(cross(pole,rot)),up:add(scale(rot,Math.cos(o.latitude*DEG)),scale(pole,Math.sin(o.latitude*DEG))),north:add(scale(rot,-Math.sin(o.latitude*DEG)),scale(pole,Math.cos(o.latitude*DEG)))};
  }
  const hasEphemeris=w.star.name==='Sol'&&(BODY[w.id]!==undefined||isMoon);
  if(!hasEphemeris) {
    // Authored observer frame for exoplanets; sky is relocated in 3-D separately.
    frame=planetFrame(A.Body.Earth,date,o.latitude,o.longitude);
    // A custom orbit has no planetary ephemeris. Its user-selected distance
    // and manual illumination define an assumed position relative to its host.
    const local=direction(manualAz,manualElev);
    const towardStar=add(add(scale(frame.east,local[0]),scale(frame.up,local[1])),scale(frame.north,-local[2]));
    centre=sub(scale(towardStar,-w.distanceAU),scale(frame.up,w.radiusKm/AU_KM));
  }
  const toLocal=(v:Vec3):Vec3=>[dot(v,frame.east),dot(v,frame.up),-dot(v,frame.north)];
  const observerEQJ=add(centre,scale(frame.up,w.radiusKm/AU_KM));
  const sunEQJ=scale(observerEQJ,-1),actualSun=unit(toLocal(sunEQJ));
  const [az,el]=azElev(actualSun),sun=o.mode==='ephemeris'&&hasEphemeris?actualSun:direction(manualAz,manualElev);
  const bodies:BodyView[]=[];
  const append=(name:string,relativeEQJ:Vec3,radiusKm:number,albedo:number,approximate=false)=>{
    const position=toLocal(sub(relativeEQJ,scale(frame.up,w.radiusKm)));
    bodies.push({name,position,radiusKm,albedo,colour:COLOURS[name]??'#cccccc',sunDirection:sun,approximate});
  };
  if(w.id==='earth') append('Moon',scale(vector(A.GeoMoon(date)),AU_KM),1737.4,.12);
  if(w.id==='moon') append('Earth',scale(vector(A.GeoMoon(date)),-AU_KM),6371,.3);
  if(w.id==='jupiter') {
    const moons=A.JupiterMoons(date);
    for(const [key,name,radius,albedo] of [['io','Io',1821.6,.63],['europa','Europa',1560.8,.67],['ganymede','Ganymede',2631.2,.43],['callisto','Callisto',2410.3,.22]] as const)
      append(name,scale(vector(moons[key]),AU_KM),radius,albedo);
  }
  const parent=w.id==='saturn'?699:w.id==='mars'?499:w.id==='neptune'?899:w.id==='pluto'?999:0;
  for(const moon of ORBITS.filter(x=>x.parent===parent)) append(moon.name,satellitePosition(moon.name,date),moon.radiusKm,moon.albedo,true);
  if(w.id==='titan') append('Saturn',scale(satellitePosition('Titan',date),-1),60268,.34,true);
  if(w.id==='triton') append('Neptune',scale(satellitePosition('Triton',date),-1),24622,.29,true);
  return {sunElevDeg:o.mode==='ephemeris'&&hasEphemeris?el:manualElev,sunAzDeg:o.mode==='ephemeris'&&hasEphemeris?az:manualAz,
    distanceAU:o.mode==='ephemeris'&&hasEphemeris?length(observerEQJ):w.distanceAU,
    ...frame,observerEQJ,bodies,ringNormal:toLocal(frame.pole),ringOrigin:toLocal(scale(frame.up,-w.radiusKm)),hasEphemeris,
    note:!hasEphemeris?'Assumed observer frame; atmosphere and rotation are hypothetical.':
      bodies.some(x=>x.approximate)?'Planet/Sun ephemerides; named satellites use approximate two-body orbits from JPL 2026 states.':'Astronomy Engine ephemerides and IAU rotation axes; spherical reference surface.'};
}

export function ringBand(radiusKm:number):{tau:number;albedo:number} {
  // NASA/JPL annular radii; gaps are checked before broad containing bands.
  if(radiusKm<74658||radiusKm>136775) return {tau:0,albedo:0};
  if(radiusKm>=117580&&radiusKm<122170) return {tau:.08,albedo:.35}; // Cassini division
  if(radiusKm>=133410&&radiusKm<133740) return {tau:0,albedo:0}; // Encke
  if(radiusKm>=136480&&radiusKm<136520) return {tau:0,albedo:0}; // Keeler
  if(radiusKm<92000) return {tau:.15,albedo:.3};
  if(radiusKm<117580) return {tau:1.5,albedo:.65};
  return {tau:.5,albedo:.55};
}
