/**
 * UI controls: world picker, solar ephemeris bar, display panel, HUD,
 * fisheye mask, and the collapsible science telemetry deck.
 */
import type { ReactNode } from 'react';
import { WORLD_GROUPS, WORLDS, type WorldSpec } from '../science/worlds';
import type { SkyState } from '../science/atmosphere';
import type { ViewState } from '../three/SkyView';
import modelNotesUrl from '../../docs/science-model.md?url';
import { idealGasDensity } from '../science/customWorld';

/* ---------- primitives ---------- */

export function Slider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  display?: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between text-xs text-neutral-300">
        <span>{props.label}</span>
        <span className="font-mono text-amber-200">
          {props.display ?? `${props.value.toFixed(1)}${props.unit ?? ''}`}
        </span>
      </span>
      <input
        type="range"
        className="mt-1 w-full accent-amber-400"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
    </label>
  );
}

export function Toggle(props: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.checked}
      onClick={() => props.onChange(!props.checked)}
      className="flex w-full items-center justify-between py-1 text-left text-xs text-neutral-300"
    >
      <span>{props.label}</span>
      <span
        className={`relative inline-block h-4 w-8 shrink-0 rounded-full transition-colors ${
          props.checked ? 'bg-amber-400' : 'bg-neutral-600'
        }`}
      >
        <span
          className={`absolute top-0.5 h-3 w-3 rounded-full bg-neutral-900 transition-all ${
            props.checked ? 'left-4' : 'left-0.5'
          }`}
        />
      </span>
    </button>
  );
}

export function Panel(props: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-white/10 bg-neutral-950/80 p-3 backdrop-blur ${props.className ?? ''}`}>
      <header className="mb-2 flex items-center justify-between">
        <h2 className="text-[11px] font-semibold tracking-widest text-neutral-400">{props.title}</h2>
        {props.action}
      </header>
      {props.children}
    </section>
  );
}

/* ---------- world picker ---------- */

export function WorldPanel(props: { worldId: string; customWorld?: WorldSpec; onSelect: (id: string) => void; open: boolean; onToggle: () => void }) {
  if (!props.open) return null;
  return (
    <Panel
      title="WORLDS"
      className="max-h-[46vh] w-60 overflow-y-auto"
      action={
        <button type="button" onClick={props.onToggle} className="text-xs text-neutral-400 hover:text-neutral-100" aria-label="Collapse worlds">
          –
        </button>
      }
    >
      {props.customWorld && <div className="mb-3">
        <h3 className="mb-1 text-[10px] font-semibold tracking-widest text-neutral-500">YOUR WORLD</h3>
        <button type="button" onClick={() => props.onSelect(props.customWorld!.id)}
          className={`w-full rounded px-2 py-1 text-left text-xs ${props.worldId === props.customWorld.id ? 'bg-amber-400/20 text-amber-100' : 'text-neutral-300 hover:bg-white/5'}`}>
          {props.customWorld.name}
        </button>
      </div>}
      {WORLD_GROUPS.filter(g => g !== 'Earth variants').map((g) => (
        <div key={g} className="mb-2">
          <h3 className="mb-1 text-[10px] font-semibold tracking-widest text-neutral-500">{g.toUpperCase()}</h3>
          <ul className="space-y-0.5">
            {WORLDS.filter((w) => w.group === g).map((w) => (
              <li key={w.id}>
                <button
                  type="button"
                  onClick={() => props.onSelect(w.id)}
                  className={`w-full rounded px-2 py-1 text-left text-xs transition-colors ${
                    w.id === props.worldId
                      ? 'bg-amber-400/20 text-amber-100'
                      : 'text-neutral-300 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  {w.name}
                </button>
                {w.id === 'earth' && <ul aria-label="Earth variants" className="mb-1 ml-3 border-l border-white/15 pl-2">
                  {WORLDS.filter(variant => variant.group === 'Earth variants').map(variant => <li key={variant.id}>
                    <button type="button" onClick={() => props.onSelect(variant.id)}
                      className={`w-full rounded px-2 py-1 text-left text-xs ${props.worldId === variant.id ? 'bg-amber-400/20 text-amber-100' : 'text-neutral-300 hover:bg-white/5 hover:text-white'}`}>
                      {variant.name}
                    </button>
                  </li>)}
                </ul>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </Panel>
  );
}


export function DisplayPanel(p:{calculating:boolean;world:WorldSpec;sky:SkyState;aerosol:number;dustOn:boolean;cloudsOn:boolean;absorption:boolean;refraction:boolean;eye:boolean;exposure:number;fisheye:boolean;terrain:boolean;teleOpen:boolean;onAerosol:(v:number)=>void;onDust:(v:boolean)=>void;onClouds:(v:boolean)=>void;onAbsorption:(v:boolean)=>void;onRefraction:(v:boolean)=>void;onEye:(v:boolean)=>void;onExposure:(v:number)=>void;onFisheye:(v:boolean)=>void;onTerrain:(v:boolean)=>void;onTele:()=>void}) {
 const s=p.sky;
 return <Panel title="ATMOSPHERE & DISPLAY" className="w-64 max-h-[60vh] overflow-y-auto">
  <div className="mb-2 flex gap-1">{[[true,'Adapted display'],[false,'Fixed camera']].map(([value,label])=><button key={String(label)} className={`rounded px-2 py-1 text-xs ${p.eye===value?'bg-amber-400/20 text-amber-100':'text-neutral-400'}`} onClick={()=>p.onEye(value as boolean)}>{label}</button>)}</div>
  <p className="mb-2 text-[10px] text-neutral-400">Approximate visual adaptation on an SDR screen.</p>
  <Slider label="Exposure" value={Math.log2(p.exposure)} min={-6} max={6} step={.25} display={`${Math.log2(p.exposure).toFixed(2)} stops`} onChange={v=>p.onExposure(2**v)}/>
  <Toggle label="Haze / dust" checked={p.dustOn} onChange={p.onDust}/>
  <Slider label="Aerosol column" value={p.aerosol} min={0} max={4} step={.05} unit="×" onChange={p.onAerosol}/>
  <Toggle label="Prescribed cloud layer" checked={p.cloudsOn} onChange={p.onClouds}/>
  <Toggle label="Methane / ozone absorption" checked={p.absorption} onChange={p.onAbsorption}/>
  <Toggle label="Atmospheric refraction" checked={p.refraction} onChange={p.onRefraction}/>
  <Toggle label="180° equidistant fisheye" checked={p.fisheye} onChange={p.onFisheye}/>
  <Toggle label="Illustrative terrain" checked={p.terrain} onChange={p.onTerrain}/>
  <button className="mt-2 w-full border-t border-white/10 pt-2 text-left text-xs" aria-expanded={p.teleOpen} onClick={p.onTele}>Physics {p.teleOpen?'−':'+'}</button>
  {p.teleOpen&&<dl className="mt-2 space-y-1 text-[10px]">{[
   ['Radius / gas scale height',`${p.world.radiusKm.toLocaleString()} / ${p.world.scaleHeightKm.toPrecision(3)} km`],
   ['Pressure / gas density',`${p.world.pressureBar.toPrecision(3)} bar / ${idealGasDensity(p.world.pressureBar,p.world.molarMass,p.world.temperatureK).toPrecision(3)} kg/m³`],
   ['Rayleigh τ at 550 nm',s.tauR.g.toFixed(4)],['Absorption τ at 550 nm',s.tauA.g.toFixed(4)],
   ['Cloud extinction τ',p.world.clouds.opticalDepth.toFixed(1)],['Ozone column',`${p.world.ozoneDU.toFixed(0)} DU`],
   ['Bolometric stellar flux',`${s.fluxWm2.toPrecision(4)} W/m²`],['Direct horizontal',`${s.directLux.toPrecision(3)} lx`],
   ['Diffuse horizontal',`${s.diffuseLux.toPrecision(3)} lx`],['Total horizontal',`${s.lux.toPrecision(4)} lx`],
   ['Stellar diameter',`${s.starAngularDeg.toFixed(3)}°`],
   ['Star true / apparent elevation',`${s.sunElevDeg.toFixed(2)}° / ${s.sunApparentElevDeg===null?'centre occluded':s.sunApparentElevDeg.toFixed(2)+'°'}`],
   ...(p.world.habitableZone ? [
    ['Goldilocks zone',`${p.world.habitableZone.innerAU.toFixed(3)}–${p.world.habitableZone.outerAU.toFixed(3)} AU`],
    ['Energy vs Earth',`${(s.fluxRel * 100).toFixed(0)}%`],
   ] : []),
  ].map(([name,value])=><div className="flex justify-between gap-2" key={name}><dt className="text-neutral-400">{name}</dt><dd className="font-mono text-neutral-200">{p.calculating?'…':value}</dd></div>)}</dl>}
  <details className="mt-3 text-[10px] text-neutral-400"><summary className="cursor-pointer text-amber-100">Evidence and model limits</summary>
   <p className="my-2 text-neutral-200">{p.world.provenance.status}</p><p>{p.world.provenance.assumptions}</p>
   <p className="my-2">48 spectral bands; spherical primary-ray refraction and single scattering, with approximate hemispheric multiple scattering. Refraction uses a single reference wavelength and prescribed density profiles. Stellar catalogue is incomplete, especially from distant systems. Diffuse Milky Way, airglow and weather are not reconstructed.</p>
   {p.world.provenance.sources.map(source=><a key={source.url} className="my-1 block underline" href={source.url} target="_blank" rel="noreferrer">{source.label}</a>)}
   <a className="my-2 block underline text-amber-100" href={modelNotesUrl} target="_blank" rel="noreferrer">Full model notes, sources and limitations</a>
   <a className="block underline" href="https://github.com/astronexus/HYG-Database" target="_blank" rel="noreferrer">Star data: HYG / David Nash · CC BY-SA 4.0</a>
  </details>
 </Panel>;
}
export function Hud({view}:{view:ViewState}){
 const yaw=((view.yawDeg%360)+360)%360;
 return <div className="rounded-lg border border-white/10 bg-neutral-950/80 px-3 py-1.5 font-mono text-[11px]">{view.fisheye?`ZENITH +90° · 180° EQUIDISTANT · ROT ${yaw.toFixed(0)}°`:`HDG ${yaw.toFixed(0)}° · PITCH ${view.pitchDeg.toFixed(0)}° · FOV ${view.fov.toFixed(0)}°`}</div>;
}
