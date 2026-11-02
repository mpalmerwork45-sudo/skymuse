import {useEffect,useMemo,useState} from 'react';
import SkyView,{type ViewState} from './three/SkyView';
import {WORLDS} from './science/worlds';
import {computeSky} from './science/atmosphere';
import {observe,type Observation} from './science/astronomy';
import {useTransport} from './science/useTransport';
import {DisplayPanel,Hud,Slider,WorldPanel} from './ui/controls';
import WorldEditor from './ui/WorldEditor';
import {CUSTOM_STORAGE_KEY,CUSTOM_WORLD_ID,draftFromWorld,parseCustomWorldDraft,resolveCustomWorld,type CustomWorldDraft} from './science/customWorld';

const DEFAULT_VIEW:ViewState={yawDeg:90,pitchDeg:8,fisheye:false,fov:60,terrain:true};
export default function App(){
 const [customDraft,setCustomDraft]=useState<CustomWorldDraft|null>(()=>{
  try{return parseCustomWorldDraft(localStorage.getItem(CUSTOM_STORAGE_KEY));}catch{return null;}
 });
 const customWorld=useMemo(()=>customDraft?resolveCustomWorld(customDraft).world:undefined,[customDraft]);
 const [worldId,setWorldId]=useState(customDraft?CUSTOM_WORLD_ID:'earth');
 const base=(worldId===CUSTOM_WORLD_ID?customWorld:WORLDS.find(w=>w.id===worldId))??WORLDS[0];
 const [editorOpen,setEditorOpen]=useState(false),[storageNotice,setStorageNotice]=useState('');
 const [sunElev,setSunElev]=useState(2),[sunAz,setSunAz]=useState(90),[aerosol,setAerosol]=useState(1);
 const [dustOn,setDustOn]=useState(true),[cloudsOn,setCloudsOn]=useState(true),[absorption,setAbsorption]=useState(true);
 const [refraction,setRefraction]=useState(true);
 const [eye,setEye]=useState(true),[exposure,setExposure]=useState(1),[view,setView]=useState(DEFAULT_VIEW);
 const [worldsOpen,setWorldsOpen]=useState(()=>window.innerWidth>=640),[displayOpen,setDisplayOpen]=useState(()=>window.innerWidth>=640),[teleOpen,setTeleOpen]=useState(true);
 const [observation,setObservation]=useState<Observation>({date:'2026-10-30T06:00:00Z',latitude:0,longitude:0,mode:'manual'});
 const [play,setPlay]=useState(false);
 useEffect(()=>{const resize=()=>{if(window.innerWidth<640){setWorldsOpen(false);setDisplayOpen(false);}};window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize);},[]);
 const astronomy=useMemo(()=>observe(base,observation,sunElev,sunAz),[base,observation,sunElev,sunAz]);
 const world=useMemo(()=>({...base,distanceAU:astronomy.distanceAU,clouds:cloudsOn?base.clouds:{...base.clouds,opticalDepth:0}}),[base,astronomy.distanceAU,cloudsOn]);
 const options=useMemo(()=>({sunElevDeg:astronomy.sunElevDeg,sunAzDeg:astronomy.sunAzDeg,aerosolScale:dustOn?aerosol:0,absorptionOn:absorption,eyeAdapted:eye,exposure,refractionOn:refraction}),[astronomy.sunElevDeg,astronomy.sunAzDeg,dustOn,aerosol,absorption,eye,exposure,refraction]);
 const state=useMemo(()=>computeSky(world,options),[world,options]);
 const transport=useTransport(world,options);
 const renderedWorld=transport.completed?.world??world;
 const renderedSky=useMemo(()=>computeSky(renderedWorld,{...(transport.completed?.options??options),eyeAdapted:eye,exposure}),[renderedWorld,transport.completed,options,eye,exposure]);
 const renderedAstronomy=useMemo(()=>observe(renderedWorld,observation,renderedSky.sunElevDeg,renderedSky.sunAzDeg),[renderedWorld,observation,renderedSky.sunElevDeg,renderedSky.sunAzDeg]);
 const sky=useMemo(()=>({...state,lux:transport.result?.lux??state.lux,diffuseLux:transport.result?.diffuseLux??0}),[state,transport.result]);
 useEffect(()=>{if(!play||observation.mode!=='ephemeris')return;const id=setInterval(()=>setObservation(o=>({...o,date:new Date(Date.parse(o.date)+600000).toISOString()})),3000);return()=>clearInterval(id);},[play,observation.mode]);
 const selectWorld=(id:string)=>{setWorldId(id);setPlay(false);setView({...DEFAULT_VIEW});if(id==='saturn')setObservation(o=>({...o,latitude:20}));if(id===CUSTOM_WORLD_ID||WORLDS.find(w=>w.id===id)?.star.name!=='Sol')setObservation(o=>({...o,mode:'manual'}));};
 const applyCustomWorld=(draft:CustomWorldDraft)=>{
  if(!resolveCustomWorld(draft).world)return;
  setCustomDraft(draft);setWorldId(CUSTOM_WORLD_ID);setPlay(false);
  setSunElev(astronomy.sunElevDeg);setSunAz(astronomy.sunAzDeg);
  setObservation(o=>({...o,mode:'manual'}));
  setAerosol(1);setDustOn(true);setCloudsOn(true);setAbsorption(true);
  setEditorOpen(false);
  try{localStorage.setItem(CUSTOM_STORAGE_KEY,JSON.stringify(draft));setStorageNotice('');}
  catch{setStorageNotice('Custom world applied. Browser storage is unavailable, so these settings will not survive a reload.');}
 };
 const button='rounded-lg border border-white/10 bg-neutral-950/80 px-3 py-1.5 text-xs hover:bg-neutral-800';
 return <div className="relative h-full w-full overflow-hidden bg-black text-neutral-200">
  <SkyView world={renderedWorld} sky={renderedSky} astronomy={renderedAstronomy} observation={observation} transport={transport.result} view={view} onViewChange={setView}/>
  <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col justify-between gap-3 sm:flex-row p-3">
   <div className="pointer-events-auto max-w-lg rounded-lg border border-white/10 bg-neutral-950/85 px-3 py-2 backdrop-blur">
    <h1 className="text-sm font-bold tracking-[.2em] text-amber-100">SKYMUSE <span className="font-normal tracking-normal text-neutral-400">· planetary skies</span></h1>
    <p className="mt-1 text-xs"><strong>{base.name}</strong> · {world.star.name} · {world.distanceAU.toPrecision(4)} AU · {Number(world.pressureBar.toPrecision(4))} bar</p>
    <p className="mt-1 text-[11px] text-neutral-400">{base.blurb}</p>
    <p className="mt-1 text-[10px] text-amber-200/80">{base.provenance.status}{transport.busy?' · Calculating atmosphere…':''}</p>
    {transport.error&&<p role="alert" className="text-xs text-red-300">Atmosphere calculation failed: {transport.error}</p>}
    {storageNotice&&<p role="status" className="mt-1 text-[10px] text-amber-200">{storageNotice}</p>}
   </div>
   <div className="flex flex-col items-end gap-2"><Hud view={view}/><div className="pointer-events-auto flex flex-wrap justify-end gap-1">
    <button className={button} onClick={()=>setEditorOpen(true)}>Customise</button>
    <button className={button} onClick={()=>{setWorldsOpen(x=>!x);if(window.innerWidth<640)setDisplayOpen(false);}}>Worlds</button><button className={button} onClick={()=>{setDisplayOpen(x=>!x);if(window.innerWidth<640)setWorldsOpen(false);}}>Display</button>
    <button className={button} onClick={()=>setView(v=>({...v,yawDeg:sky.sunAzDeg,pitchDeg:Math.max(3,sky.sunApparentElevDeg??sky.sunElevDeg),fisheye:false}))}>Face star</button>
   </div></div>
  </div>
  <div className="absolute left-3 top-56 sm:top-40"><WorldPanel worldId={base.id} customWorld={customWorld} onSelect={selectWorld} open={worldsOpen} onToggle={()=>setWorldsOpen(false)}/></div>
  {displayOpen&&<div className="absolute right-3 top-56 sm:top-32"><DisplayPanel calculating={transport.busy} world={world} sky={sky} aerosol={aerosol} dustOn={dustOn} cloudsOn={cloudsOn} absorption={absorption} refraction={refraction} eye={eye} exposure={exposure} fisheye={view.fisheye} terrain={view.terrain} teleOpen={teleOpen} onAerosol={setAerosol} onDust={setDustOn} onClouds={setCloudsOn} onAbsorption={setAbsorption} onRefraction={setRefraction} onEye={setEye} onExposure={setExposure} onFisheye={fisheye=>setView(v=>({...v,fisheye}))} onTerrain={terrain=>setView(v=>({...v,terrain}))} onTele={()=>setTeleOpen(x=>!x)}/></div>}
  <section aria-label="Observation" className="absolute bottom-3 left-1/2 w-[min(96vw,780px)] -translate-x-1/2 rounded-lg border border-white/10 bg-neutral-950/90 px-3 py-2 backdrop-blur">
   <div className="mb-2 flex flex-wrap items-center gap-3 text-[11px]">
    <label>Geometry <select aria-label="Geometry mode" className="ml-1 rounded bg-neutral-800 p-1" value={observation.mode} onChange={e=>{setPlay(false);setObservation(o=>({...o,mode:e.target.value as Observation['mode']}));}}><option value="manual">Manual stellar position</option>{astronomy.hasEphemeris&&<option value="ephemeris">Date and location</option>}</select></label>
    <label>UTC <input aria-label="Observation UTC" className="rounded bg-neutral-800 p-1" type="datetime-local" value={observation.date.slice(0,16)} onChange={e=>{if(e.target.value)setObservation(o=>({...o,date:e.target.value+':00Z'}));}}/></label>
    <label>Lat <input aria-label="Latitude" className="w-16 rounded bg-neutral-800 p-1" type="number" min={-90} max={90} value={observation.latitude} onChange={e=>setObservation(o=>({...o,latitude:Math.max(-90,Math.min(90,Number(e.target.value)))}))}/></label>
    <label>Lon E <input aria-label="Longitude" className="w-16 rounded bg-neutral-800 p-1" type="number" min={-180} max={180} value={observation.longitude} onChange={e=>setObservation(o=>({...o,longitude:Math.max(-180,Math.min(180,Number(e.target.value)))}))}/></label>
   </div>
   {observation.mode==='manual'?<div className="grid grid-cols-2 gap-6"><Slider label="Stellar elevation (geometric)" value={sunElev} min={-90} max={90} step={.25} unit="°" onChange={setSunElev}/><Slider label="Stellar azimuth" value={sunAz} min={0} max={360} step={1} unit="°" onChange={setSunAz}/></div>:<div className="flex items-center gap-4 text-xs"><span>Star {sky.sunElevDeg.toFixed(2)}° elevation · {sky.sunAzDeg.toFixed(2)}° azimuth</span><button className={button} onClick={()=>setPlay(x=>!x)}>{play?'Pause':'Advance time'}</button><span className="text-[10px] text-neutral-400">10 simulated minutes / 3 seconds</span></div>}
   <p className="text-[10px] text-neutral-400">{observation.mode==='manual'?'Manual illumination; date and location orient catalogue stars and companions. ':''}{astronomy.note}</p>
   <p className="mt-1 text-center text-[10px] text-neutral-500">Drag to look · scroll to zoom · {refraction?'apparent view / geometric stellar coordinates':'geometric rays'} · terrain is illustrative</p>
  </section>
  {editorOpen&&<WorldEditor initialDraft={worldId===CUSTOM_WORLD_ID&&customDraft?customDraft:draftFromWorld(base)} onApply={applyCustomWorld} onClose={()=>setEditorOpen(false)}/>}
 </div>;
}
