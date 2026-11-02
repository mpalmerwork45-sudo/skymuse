import * as THREE from 'three';
import {WORLDS,type WorldSpec} from '../src/science/worlds';
import {computeSky,displayGain,type SkyOptions} from '../src/science/atmosphere';
import {computeTransport,type TransportResult} from '../src/science/transport';
import {observe,type AstronomyState} from '../src/science/astronomy';
import {direction,DEG,stellarDisc,observerRayLookup,sphereHit,scale,sub,unit,dot,length} from '../src/science/geometry';
import {luminance,rgb} from '../src/science/spectrum';
import {createSkyMaterial,bindTransport,updateSkyUniforms} from '../src/three/skyShader';
import {createDisplay} from '../src/three/display';
import {createStars,starAttributes} from '../src/three/stars';
import {companionIlluminants} from '../src/science/lighting';

const checks:{name:string;passed:boolean;detail?:unknown}[]=[],errors:string[]=[];
const check=(name:string,passed:boolean,detail?:unknown)=>checks.push({name,passed,detail});
const world=(id:string)=>WORLDS.find(w=>w.id===id)!;
const options:SkyOptions={sunElevDeg:45,sunAzDeg:90,aerosolScale:1,absorptionOn:true,eyeAdapted:true,exposure:1};
const observation={date:'2026-10-30T06:00:00Z',latitude:20,longitude:0,mode:'manual' as const};
const quality={width:24,height:20,steps:48,layers:128,discSamples:32};
const renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});renderer.setSize(320,200);renderer.outputColorSpace=THREE.LinearSRGBColorSpace;
renderer.debug.onShaderError=(gl,p,v,f)=>errors.push([gl.getProgramInfoLog(p),gl.getShaderInfoLog(v),gl.getShaderInfoLog(f)].join('\n'));
const sky=createSkyMaterial(),display=createDisplay(),stars=createStars(),geometry=new THREE.PlaneGeometry(2,2),camera=new THREE.Camera();
const scene=new THREE.Scene(),post=new THREE.Scene(),starScene=new THREE.Scene();scene.add(new THREE.Mesh(geometry,sky.material));post.add(new THREE.Mesh(geometry,display.material));starScene.add(stars.points);
const target=new THREE.WebGLRenderTarget(320,200,{type:THREE.FloatType,depthBuffer:false}),starTarget=target.clone();
display.uniforms.uScene.value=target.texture;display.uniforms.uStars.value=starTarget.texture;
let current:TransportResult;
function point(yaw:number,pitch:number,fov=60,fisheye=false){
 const f=new THREE.Vector3().fromArray(direction(yaw,pitch)),r=new THREE.Vector3().crossVectors(f,new THREE.Vector3(0,1,0)).normalize(),up=new THREE.Vector3().crossVectors(r,f);
 for(const u of [sky.uniforms,stars.uniforms]){u.uForward.value.copy(f);u.uRight.value.copy(r);u.uUp.value.copy(up);u.uResolution.value.set(target.width,target.height);u.uFov.value=fov*DEG;u.uFisheye.value=fisheye;u.uYaw.value=yaw*DEG;}
}
function setup(w:WorldSpec,o:Partial<SkyOptions>={},bodies=true){
 const s=computeSky(w,{...options,...o}),a=observe(w,observation,s.sunElevDeg,s.sunAzDeg);
 if(!bodies)a.bodies=[];
 current=computeTransport(w,s,quality);updateSkyUniforms(sky.uniforms,w,s,a);bindTransport(sky.uniforms,current);sky.uniforms.uTerrain.value=false;
 const mean=.5*(current.meanLuminance+Math.max(0,luminance(current.groundRGB)));display.uniforms.uGain.value=displayGain(mean,s.eyeAdapted)*s.exposure;
 display.uniforms.uAdaptation.value=s.eyeAdapted?.75:0;const e=current.diffuseRGB.map((v,i)=>v+s.directHorizontalRGB[i]),y=Math.max(1e-8,luminance(e));display.uniforms.uWhite.value.set(...e.map(v=>Math.max(.05,v/y)) as [number,number,number]);
 return {s,a,t:current};
}
function render(){renderer.setClearColor(0,0);renderer.setRenderTarget(target);renderer.clear();renderer.render(scene,camera);renderer.setRenderTarget(starTarget);renderer.clear();renderer.render(starScene,camera);renderer.setRenderTarget(null);renderer.render(post,camera);}
function raw(x:number,y:number){const out=new Float32Array(4);renderer.readRenderTargetPixels(target,x,y,1,1,out);return Array.from(out);}
function fullRaw(){const p=new Float32Array(target.width*target.height*4);renderer.readRenderTargetPixels(target,0,0,target.width,target.height,p);return p;}
function gallery(name:string){const f=document.createElement('figure'),img=document.createElement('img'),c=document.createElement('figcaption');img.src=renderer.domElement.toDataURL();c.textContent=name;f.append(img,c);document.querySelector('#gallery')!.append(f);}
function resize(w:number,h:number){target.setSize(w,h);starTarget.setSize(w,h);renderer.setSize(w,h);}
try{
 const moon=world('moon');
 setup(moon,{},false);point(90,45,2);render();const disc1=raw(160,100)[0];
 setup({...moon,distanceAU:2},{},false);point(90,45,2);render();const disc2=raw(160,100)[0];
 check('GPU resolved stellar radiance is independent of distance',Math.abs(disc1/disc2-1)<1e-5,{disc1,disc2});
 resize(256,256);
 function integratedDisc(distanceAU:number){const w={...moon,distanceAU};setup(w,{},false);point(90,45,10);render();const p=fullRaw();let sum=0;for(let y=0;y<256;y++)for(let x=0;x<256;x++){const u=(2*(x+.5)/256-1)*Math.tan(5*DEG),v=(2*(y+.5)/256-1)*Math.tan(5*DEG);const omega=(2*Math.tan(5*DEG)/256)**2/(1+u*u+v*v)**1.5;sum+=p[(y*256+x)*4]*omega;}return sum;}
 const energyA=integratedDisc(20),energyB=integratedDisc(40);check('Unresolved stellar disc conserves inverse-square angular flux',Math.abs(energyA/energyB/4-1)<.08,{energyA,energyB});
 setup(moon,{sunElevDeg:0,sunAzDeg:0},false);point(0,90,60,true);render();const p=fullRaw();let centre=0,rim=0;
 for(let y=0;y<256;y++)for(let x=0;x<256;x++){const yval=p[(y*256+x)*4];const radius=Math.hypot(x+0.5-128,y+.5-128);if(radius<60)centre+=yval;else if(radius>105&&radius<111)rim+=yval;}
 check('Actual fisheye places a horizon star on the rim',rim>0&&centre===0,{centre,rim});gallery('Airless 180° fisheye: horizon star on rim');
 resize(320,200);
 setup(world('earth'),{sunElevDeg:45});point(180,35);render();const earthPixel=raw(160,100);check('Earth daylight side sky is spectrally blue',earthPixel[2]>earthPixel[0]*1.3,earthPixel);gallery('Earth · 45° stellar elevation');
 setup(world('earth'),{sunElevDeg:2});point(90,8);render();gallery('Earth · 2° · adapted display');
 setup(world('mars'),{sunElevDeg:2});point(90,8);render();gallery('Mars · assumed dust optics');
 setup(world('venus'),{sunElevDeg:45});point(90,45);render();const centreVenus=raw(160,100),leftVenus=raw(130,100);check('Opaque Venus clouds remove the direct stellar image',Math.abs(centreVenus[0]/leftVenus[0]-1)<.2,{centreVenus,leftVenus});gallery('Venus · 45° · prescribed clouds');
 const vacuum=setup(moon,{sunElevDeg:-40},false);const a={...vacuum.a,bodies:[{name:'reference moon',position:direction(90,40).map(x=>x*300000) as [number,number,number],radiusKm:2000,albedo:.3,colour:'#cccccc',sunDirection:direction(270,-34),approximate:false}]};
 const full=computeSky(moon,{...options,sunElevDeg:-34,sunAzDeg:270});updateSkyUniforms(sky.uniforms,moon,full,a);point(90,40,5);render();const lit=raw(160,100)[0];
 const newMoon=computeSky(moon,{...options,sunElevDeg:40,sunAzDeg:90});updateSkyUniforms(sky.uniforms,moon,newMoon,a);render();const dark=raw(160,100)[0];
 check('Companion phase follows stellar illumination, with no positive night-light floor',lit>1&&dark<lit*.001,{lit,dark});
 const absorbing={...moon,aerosol:{...moon.aerosol,density:100,albedo:0}};
 setup(absorbing,{sunElevDeg:-34,sunAzDeg:270},false);updateSkyUniforms(sky.uniforms,absorbing,computeSky(absorbing,{...options,sunElevDeg:-34,sunAzDeg:270}),a);render();const obscured=raw(160,100)[0];
 check('Foreground absorption extinguishes a bright companion',obscured<lit*1e-8,{obscured});
 // Same catalogue source in clear vacuum and a purely absorbing column.
 const catalogue=[[1,0,0,10,0,0,0,0,.65]],frame={...vacuum.a,east:[1,0,0],up:[0,0,1],north:[0,1,0],observerEQJ:[0,0,0]} as AstronomyState;
 const clear=starAttributes(catalogue,moon,full,frame,observation,vacuum.t),blocked=starAttributes(catalogue,absorbing,computeSky(absorbing,options),frame,observation,current);
 check('Catalogue starlight is attenuated by the atmosphere',clear.colours.length>0&&blocked.colours.length===0);
 setup({...world('saturn'),clouds:{...world('saturn').clouds,opticalDepth:0}},{sunElevDeg:25});point(180,30);render();gallery('Saturn · latitude 20° · cloud layer disabled');
 setup(world('wasp-12b'),{sunElevDeg:-15});point(90,5);render();check('WASP partial-disc setting remains illuminated',current.lux>1000,current.lux);gallery('WASP-12b · centre −15°, upper limb above horizon');
 // An explicitly transparent reference medium isolates refraction geometry and
 // radiometry from Earth's very strong, wavelength-dependent horizon extinction.
 resize(512,512);
 const reference=setup(world('earth'),{sunElevDeg:0,refractionOn:true},false);
 reference.s.optics.extinction.forEach(c=>c.fill(0));reference.t.radiance.fill(0);
 reference.t.groundDirectRGB.fill(0);reference.t.groundDiffuseRGB.fill(0);
 updateSkyUniforms(sky.uniforms,world('earth'),reference.s,reference.a);bindTransport(sky.uniforms,reference.t);
 const apparent=reference.s.sunApparentElevDeg!;
 point(90,apparent,2);render();const image=fullRaw();
 const intrinsic=rgb(reference.s.discRadiance)[0],centreImage=raw(256,256)[0];
 check('Refracted resolved radiance follows the L/n² invariant',Math.abs(centreImage/(intrinsic*reference.s.refraction.gain)-1)<2e-5,{centreImage,intrinsic,gain:reference.s.refraction.gain});
 let energy=0,sx=0,sy=0,sxx=0,syy=0;
 for(let y=0;y<512;y++)for(let x=0;x<512;x++){
  const u=(2*(x+.5)/512-1)*Math.tan(DEG),v=(2*(y+.5)/512-1)*Math.tan(DEG);
  const omega=(2*Math.tan(DEG)/512)**2/(1+u*u+v*v)**1.5,w=image[(y*512+x)*4]*omega;
  energy+=w;sx+=w*u;sy+=w*v;sxx+=w*u*u;syy+=w*v*v;
 }
 const flattening=Math.sqrt((syy/energy-(sy/energy)**2)/(sxx/energy-(sx/energy)**2));
 check('GPU horizon disc is lifted and flattened by the shared ray geometry',apparent>.4&&apparent<.7&&flattening>.65&&flattening<.95,{apparent,flattening});
 const lookup=observerRayLookup(world('earth'));
 const predicted=rgb(reference.s.spectrum)[0]*stellarDisc(direction(90,0),reference.s.starAngularDeg*DEG/2,4096).reduce((sum,q)=>sum+q.weight*(lookup.sample(q.dir)?.focusing??0),0);
 check('Refracted GPU disc flux agrees with independent incident-cap quadrature',Math.abs(energy/predicted-1)<.015,{energy,predicted,ratio:energy/predicted});
 gallery('Transparent refractive reference · true centre 0° · disc lifted and flattened');
 const below=direction(90,-.3),testFrame={...reference.a,east:[1,0,0],up:[0,1,0],north:[0,0,-1],observerEQJ:[0,0,0]} as AstronomyState;
 const refractedStar=starAttributes([[1,...below.map(v=>v*10),0,0,0,-5,.65]],world('earth'),reference.s,testFrame,observation,reference.t);
 const expectedStar=lookup.sample(below)!;
 check('Catalogue stars use the same apparent position and focusing as the disc',refractedStar.positions.length===3&&refractedStar.positions[1]>0&&Math.abs(refractedStar.positions[1]-expectedStar.direction[1])<2e-5&&Math.abs(luminance(Array.from(refractedStar.colours) as [number,number,number])/(2.54e-4*expectedStar.focusing)-1)<.005,{apparentY:refractedStar.positions[1],expectedY:expectedStar.direction[1],focusing:expectedStar.focusing});
 const sourceBody={name:'reference companion',position:direction(270,70).map(v=>v*300000) as [number,number,number],radiusKm:1737.4,albedo:.12,colour:'#bbbbbb',sunDirection:direction(90,-80),approximate:false};
 const sourceScene={...observe(moon,observation,-80,90),bodies:[sourceBody]};
 const illuminants=companionIlluminants(moon,sourceScene),moonlit=setup(moon,{sunElevDeg:-80,illuminants},false);
 updateSkyUniforms(sky.uniforms,moon,moonlit.s,sourceScene);point(270,70,2);render();
 const companionImage=fullRaw();let companionFlux=0,coveredOmega=0;
 for(let y=0;y<512;y++)for(let x=0;x<512;x++){
  const u=(2*(x+.5)/512-1)*Math.tan(DEG),v=(2*(y+.5)/512-1)*Math.tan(DEG);
  companionFlux+=companionImage[(y*512+x)*4]*(2*Math.tan(DEG)/512)**2/(1+u*u+v*v)**1.5;
  coveredOmega+=companionImage[(y*512+x)*4+3]*(2*Math.tan(DEG)/512)**2/(1+u*u+v*v)**1.5;
 }
 const incident=rgb(illuminants[0].spectrum)[0];
 const sphereFlux=stellarDisc(unit(sourceBody.position),Math.asin(sourceBody.radiusKm/length(sourceBody.position)),16384).reduce((sum,q)=>{
  const t=sphereHit(scale(sourceBody.position,-1),q.dir,sourceBody.radiusKm),normal=unit(sub(scale(q.dir,t),sourceBody.position));
  return sum+q.weight*Math.max(0,dot(normal,direction(90,-80)))*(sourceBody.radiusKm/length(sourceBody.position))**2;
 },0)*rgb(moonlit.s.spectrum)[0]*.12;
 const profile=[[-60,0],[-30,0],[0,0],[30,0],[60,0],[0,-60],[0,60]].map(([dx,dy])=>{
  const x=256+dx,y=256+dy,u=(2*(x+.5)/512-1)*Math.tan(DEG),v=(2*(y+.5)/512-1)*Math.tan(DEG);
  const d=sky.uniforms.uForward.value.clone().addScaledVector(sky.uniforms.uRight.value,u).addScaledVector(sky.uniforms.uUp.value,v).normalize().toArray() as [number,number,number];
  const t=sphereHit(scale(sourceBody.position,-1),d,sourceBody.radiusKm),normal=unit(sub(scale(d,t),sourceBody.position));
  return {dx,dy,gpu:companionImage[(y*512+x)*4],cpu:rgb(moonlit.s.spectrum)[0]*.12/Math.PI*Math.max(0,dot(normal,direction(90,-80)))};
 });
 check('Rendered companion flux agrees with its independent ground illuminant',Math.abs(companionFlux/incident-1)<.01&&Math.abs(companionFlux/sphereFlux-1)<.003,{companionFlux,incident,sphereFlux,ratio:companionFlux/incident,coveredOmega,expectedOmega:Math.PI*(sourceBody.radiusKm/300000)**2});
 check('Resolved companion surface normals agree with independent finite-sphere rays',profile.every(p=>Math.abs(p.gpu/p.cpu-1)<.01),profile);
 point(270,-30,60);render();const litGround=raw(256,256);
 check('Reflected companion light reaches the rendered night ground',litGround[0]>.001&&moonlit.s.secondaryDirectLux>.1,{litGround,directLux:moonlit.s.secondaryDirectLux});
 gallery('Airless night ground illuminated by a Lambertian companion');
 const moonSpectrum=reference.s.spectrum.map(e=>e*1e-6);
 setup(world('earth'),{sunElevDeg:-80,illuminants:[{name:'reference moon',direction:direction(20,35),radiusRad:.00465,spectrum:moonSpectrum}]},false);
 point(20,35,10);render();const nearMoon=raw(256,256)[0];point(160,35,10);render();const oppositeMoon=raw(256,256)[0];
 check('Secondary sky glow follows the companion azimuth in the GPU renderer',nearMoon>oppositeMoon*1.2&&oppositeMoon>0,{nearMoon,oppositeMoon});
 gallery('Earth night sky near the reference moon · scattering from reflected light');
 check('Shaders compile and link',errors.length===0,errors);check('No WebGL errors',renderer.getContext().getError()===0);
}catch(e){errors.push(String(e));check('Harness completed',false,String(e));}
finally{
 const result={passed:checks.every(c=>c.passed),checks,errors};(window as unknown as {skyRenderResults:typeof result}).skyRenderResults=result;
 document.querySelector('#results')!.textContent=JSON.stringify(result,null,2);document.title=`${result.passed?'PASS':'FAIL'} — physical rendering checks`;
 renderer.dispose();target.dispose();starTarget.dispose();geometry.dispose();sky.material.dispose();sky.uniforms.uBodyReflectance.value.dispose();display.material.dispose();stars.material.dispose();stars.geometry.dispose();
}
