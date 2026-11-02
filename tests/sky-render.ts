import * as THREE from 'three';
import {WORLDS,type WorldSpec} from '../src/science/worlds';
import {computeSky,displayGain,type SkyOptions} from '../src/science/atmosphere';
import {computeTransport,type TransportResult} from '../src/science/transport';
import {observe,type AstronomyState} from '../src/science/astronomy';
import {direction,DEG} from '../src/science/geometry';
import {luminance} from '../src/science/spectrum';
import {createSkyMaterial,bindTransport,updateSkyUniforms} from '../src/three/skyShader';
import {createDisplay} from '../src/three/display';
import {createStars,starAttributes} from '../src/three/stars';

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
 check('Shaders compile and link',errors.length===0,errors);check('No WebGL errors',renderer.getContext().getError()===0);
}catch(e){errors.push(String(e));check('Harness completed',false,String(e));}
finally{
 const result={passed:checks.every(c=>c.passed),checks,errors};(window as unknown as {skyRenderResults:typeof result}).skyRenderResults=result;
 document.querySelector('#results')!.textContent=JSON.stringify(result,null,2);document.title=`${result.passed?'PASS':'FAIL'} — physical rendering checks`;
 renderer.dispose();target.dispose();starTarget.dispose();geometry.dispose();sky.material.dispose();display.material.dispose();stars.material.dispose();stars.geometry.dispose();
}
