import { useEffect,useRef,useState } from 'react';
import * as THREE from 'three';
import type { WorldSpec } from '../science/worlds';
import { displayGain,type SkyState } from '../science/atmosphere';
import type { AstronomyState,Observation } from '../science/astronomy';
import type { TransportResult } from '../science/transport';
import { luminance } from '../science/spectrum';
import { DEG,direction } from '../science/geometry';
import { bindTransport,createSkyMaterial,updateSkyUniforms } from './skyShader';
import { createDisplay } from './display';
import { createStars,loadStars,starAttributes } from './stars';

export interface ViewState {yawDeg:number;pitchDeg:number;fisheye:boolean;fov:number;terrain:boolean;}
export interface SkyViewProps {
 world:WorldSpec;sky:SkyState;astronomy:AstronomyState;observation:Observation;
 transport:TransportResult|null;view:ViewState;onViewChange:(view:ViewState)=>void;
}
export default function SkyView(props:SkyViewProps){
 const mountRef=useRef<HTMLDivElement>(null),live=useRef(props);live.current=props;
 const [error,setError]=useState<string|null>(null);
 useEffect(()=>{
  const mount=mountRef.current;if(!mount)return;
  let renderer:THREE.WebGLRenderer;
  try{renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});}
  catch(e){setError(String(e));return;}
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=THREE.LinearSRGBColorSpace;
  mount.appendChild(renderer.domElement);
  const sky=createSkyMaterial(),display=createDisplay(),stars=createStars();
  const scene=new THREE.Scene(),starScene=new THREE.Scene(),post=new THREE.Scene(),camera=new THREE.Camera();
  const geometry=new THREE.PlaneGeometry(2,2);
  scene.add(new THREE.Mesh(geometry,sky.material));starScene.add(stars.points);post.add(new THREE.Mesh(geometry,display.material));
  const targetOptions={type:THREE.FloatType,format:THREE.RGBAFormat,depthBuffer:false,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter};
  const target=new THREE.WebGLRenderTarget(1,1,targetOptions),starTarget=new THREE.WebGLRenderTarget(1,1,targetOptions);
  display.uniforms.uScene.value=target.texture;display.uniforms.uStars.value=starTarget.texture;
  let rows:number[][]|null=null,disposed=false,dirty=true;
  loadStars().then(r=>{if(!disposed){rows=r;dirty=true;}}).catch(e=>{if(!disposed)setError(String(e));});
  let lastTransport:TransportResult|null=null,lastWorld='',lastAstro:AstronomyState|null=null;
  let gain=1/20000,white=new THREE.Vector3(1,1,1),lastTime=performance.now(),raf=0,first=true;
  const resize=()=>{const width=mount.clientWidth,height=mount.clientHeight;renderer.setSize(width,height);
   const size=renderer.getDrawingBufferSize(new THREE.Vector2());target.setSize(size.x,size.y);starTarget.setSize(size.x,size.y);
   sky.uniforms.uResolution.value.copy(size);stars.uniforms.uResolution.value.copy(size);};
  const observer=new ResizeObserver(resize);observer.observe(mount);resize();
  renderer.debug.onShaderError=(gl,program,vertex,fragment)=>setError([gl.getProgramInfoLog(program),gl.getShaderInfoLog(vertex),gl.getShaderInfoLog(fragment)].filter(Boolean).join('\n'));
  const render=(now:number)=>{
   const p=live.current,dt=Math.min(.2,(now-lastTime)/1000);lastTime=now;
   if(p.transport&&p.transport!==lastTransport){
    bindTransport(sky.uniforms,p.transport);lastTransport=p.transport;dirty=true;
    updateSkyUniforms(sky.uniforms,p.world,p.sky,p.astronomy);
   }
   if(lastAstro!==p.astronomy||lastWorld!==p.world.id){lastAstro=p.astronomy;lastWorld=p.world.id;dirty=true;if(p.transport)updateSkyUniforms(sky.uniforms,p.world,p.sky,p.astronomy);}
   if(dirty&&rows&&p.transport){
    const data=starAttributes(rows,p.world,p.sky,p.astronomy,p.observation,p.transport);
    stars.geometry.setAttribute('position',new THREE.BufferAttribute(data.positions,3));stars.geometry.setAttribute('flux',new THREE.BufferAttribute(data.colours,3));dirty=false;
   }
   const fwd=new THREE.Vector3().fromArray(direction(p.view.yawDeg,p.view.pitchDeg));
   const right=new THREE.Vector3().crossVectors(fwd,new THREE.Vector3(0,1,0)).normalize(),up=new THREE.Vector3().crossVectors(right,fwd).normalize();
   for(const u of [sky.uniforms,stars.uniforms]){u.uForward.value.copy(fwd);u.uRight.value.copy(right);u.uUp.value.copy(up);u.uFov.value=p.view.fov*DEG;u.uYaw.value=p.view.yawDeg*DEG;u.uFisheye.value=p.view.fisheye;}
   sky.uniforms.uTerrain.value=p.view.terrain&&!p.world.horizonDiffuse;
   if(p.transport){
    const field=.5*(p.transport.meanLuminance+Math.max(0,luminance(p.transport.groundRGB)));
    const wanted=displayGain(field,p.sky.eyeAdapted);
    // Bright adaptation is fast; dark adaptation is deliberately slower.
    const tau=wanted<gain?.7:5;
    if(first){gain=wanted;first=false;}else gain=Math.exp(Math.log(gain)+(Math.log(wanted)-Math.log(gain))*(1-Math.exp(-dt/tau)));
    if(!p.sky.eyeAdapted)gain=wanted;
    const illum=p.transport.diffuseRGB.map((v,i)=>v+p.sky.directHorizontalRGB[i]);
    const y=Math.max(1e-8,luminance(illum));
    const targetWhite=y>1e-6?new THREE.Vector3(...illum.map(v=>Math.max(.05,v/y))):new THREE.Vector3(1,1,1);
    white.lerp(targetWhite,1-Math.exp(-dt/3));display.uniforms.uWhite.value.copy(white);
    display.uniforms.uAdaptation.value=p.sky.eyeAdapted?.75:0;
    display.uniforms.uNight.value=p.sky.eyeAdapted?Math.max(0,Math.min(1,(Math.log10(3)-Math.log10(Math.max(.0001,field)))/4)):0;
   }
   display.uniforms.uGain.value=gain*p.sky.exposure;
   renderer.setClearColor(0,0);renderer.setRenderTarget(target);renderer.clear();renderer.render(scene,camera);
   renderer.setRenderTarget(starTarget);renderer.clear();renderer.render(starScene,camera);
   renderer.setRenderTarget(null);renderer.render(post,camera);
   raf=requestAnimationFrame(render);
  };raf=requestAnimationFrame(render);
  let drag:{x:number;y:number;view:ViewState}|null=null;
  const down=(e:PointerEvent)=>{drag={x:e.clientX,y:e.clientY,view:live.current.view};renderer.domElement.setPointerCapture(e.pointerId);};
  const move=(e:PointerEvent)=>{if(!drag)return;const v=drag.view;live.current.onViewChange({...v,yawDeg:(v.yawDeg-(e.clientX-drag.x)*.15+360)%360,pitchDeg:Math.max(-89,Math.min(89,v.pitchDeg+(e.clientY-drag.y)*.15))});};
  const release=()=>{drag=null;};
  const wheel=(e:WheelEvent)=>{e.preventDefault();const p=live.current;p.onViewChange({...p.view,fov:Math.max(15,Math.min(110,p.view.fov+e.deltaY*.025))});};
  const canvas=renderer.domElement;canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);canvas.addEventListener('wheel',wheel,{passive:false});
  return ()=>{disposed=true;cancelAnimationFrame(raf);observer.disconnect();geometry.dispose();sky.material.dispose();display.material.dispose();stars.geometry.dispose();stars.material.dispose();target.dispose();starTarget.dispose();sky.uniforms.uSky.value.dispose();sky.uniforms.uColumns.value.dispose();sky.uniforms.uSpectral.value.dispose();renderer.dispose();canvas.remove();};
 },[]);
 return <div ref={mountRef} className="absolute inset-0 touch-none">{error&&<pre role="alert" className="absolute left-1/2 top-1/2 z-50 max-w-xl -translate-x-1/2 whitespace-pre-wrap bg-black p-4 text-red-300">{error}</pre>}</div>;
}
