/**
 * UI controls: world picker, solar ephemeris bar, display panel, HUD,
 * fisheye mask, and the collapsible science telemetry deck.
 */
import type { ReactNode } from 'react';
import { WORLD_GROUPS, WORLDS, type WorldSpec } from '../science/worlds';
import type { SkyState } from '../science/atmosphere';
import type { ViewState } from '../three/SkyView';

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

export function WorldPanel(props: { worldId: string; onSelect: (id: string) => void; open: boolean; onToggle: () => void }) {
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
      {WORLD_GROUPS.map((g) => (
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
              </li>
            ))}
          </ul>
        </div>
      ))}
    </Panel>
  );
}

/* ---------- solar ephemeris ---------- */

export function SunBar(props: {
  elev: number;
  az: number;
  anim: number;
  onElev: (v: number) => void;
  onAz: (v: number) => void;
  onPreset: (kind: 'sunrise' | 'sunset' | 'stop') => void;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-neutral-950/80 px-4 py-2 backdrop-blur">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => props.onPreset('sunrise')}
          className="rounded border border-white/10 px-2 py-1 text-xs text-neutral-200 hover:bg-white/10"
          title="Animate dawn: sun climbs from -8° to +45°"
        >
          ▲ Sunrise
        </button>
        <button
          type="button"
          onClick={() => props.onPreset('sunset')}
          className="rounded border border-white/10 px-2 py-1 text-xs text-neutral-200 hover:bg-white/10"
          title="Animate dusk: sun sinks from +35° to -12°"
        >
          ▼ Sunset
        </button>
        {props.anim !== 0 && (
          <button
            type="button"
            onClick={() => props.onPreset('stop')}
            className="rounded border border-amber-400/40 px-2 py-1 text-xs text-amber-200 hover:bg-white/10"
          >
            ❚❚ Pause
          </button>
        )}
        <div className="grid flex-1 grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
          <Slider label="Sun elevation" value={props.elev} min={-15} max={85} step={0.5} unit="°" onChange={props.onElev} />
          <Slider label="Sun azimuth" value={props.az} min={0} max={360} step={1} unit="°" onChange={props.onAz} />
        </div>
      </div>
    </div>
  );
}

/* ---------- display + telemetry ---------- */

function fmtLux(lux: number): string {
  if (lux >= 10000) return `${Math.round(lux).toLocaleString('en-US')} lx`;
  if (lux >= 10) return `${lux.toFixed(0)} lx`;
  if (lux >= 0.01) return `${lux.toFixed(2)} lx`;
  return `${lux.toExponential(1)} lx`;
}

function TeleRow(props: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-px text-[11px]">
      <span className="text-neutral-500">{props.k}</span>
      <span className="font-mono text-neutral-200">{props.v}</span>
    </div>
  );
}

export function DisplayPanel(props: {
  world: WorldSpec;
  sky: SkyState;
  aerosol: number;
  dustOn: boolean;
  cloudsOn: boolean;
  absorption: boolean;
  eye: boolean;
  exposure: number;
  fisheye: boolean;
  teleOpen: boolean;
  onAerosol: (v: number) => void;
  onDust: (v: boolean) => void;
  onClouds: (v: boolean) => void;
  onAbsorption: (v: boolean) => void;
  onEye: (v: boolean) => void;
  onExposure: (v: number) => void;
  onFisheye: (v: boolean) => void;
  onTele: () => void;
}) {
  const { sky: s, world: w } = props;
  return (
    <Panel title="ATMOSPHERE & CAMERA" className="w-64">
      <div className="mb-1 grid grid-cols-2 gap-1">
        <button
          type="button"
          onClick={() => props.onEye(true)}
          className={`rounded px-2 py-1 text-xs ${props.eye ? 'bg-amber-400/20 text-amber-100' : 'text-neutral-400 hover:bg-white/5'}`}
        >
          Human eye
        </button>
        <button
          type="button"
          onClick={() => props.onEye(false)}
          className={`rounded px-2 py-1 text-xs ${!props.eye ? 'bg-amber-400/20 text-amber-100' : 'text-neutral-400 hover:bg-white/5'}`}
        >
          Fixed camera
        </button>
      </div>
      <Slider label="Exposure" value={props.exposure} min={0.1} max={4} step={0.05} display={`${props.exposure.toFixed(2)}×`} onChange={props.onExposure} />
      <Toggle label="Dust aerosols (Mie)" checked={props.dustOn} onChange={props.onDust} />
      <div className={props.dustOn ? undefined : 'pointer-events-none opacity-40'}>
        <Slider
          label="Aerosol density"
          value={props.aerosol}
          min={0}
          max={4}
          step={0.05}
          display={props.dustOn ? `${props.aerosol.toFixed(2)}×` : 'off'}
          onChange={props.onAerosol}
        />
      </div>
      <Toggle label="Cloud deck (overcast)" checked={props.cloudsOn} onChange={props.onClouds} />
      <p className="mb-1 truncate text-[11px] text-neutral-500" title={w.aerosol.name}>
        {w.aerosol.name} · g={w.aerosol.g.toFixed(2)}
      </p>
      <Toggle label="Molecular absorption (CH₄/O₃)" checked={props.absorption} onChange={props.onAbsorption} />
      <Toggle label="All-sky fisheye dome" checked={props.fisheye} onChange={props.onFisheye} />
      <button
        type="button"
        onClick={props.onTele}
        aria-expanded={props.teleOpen}
        className="mt-1 flex w-full items-center justify-between border-t border-white/10 pt-2 text-[11px] font-semibold tracking-widest text-neutral-400 hover:text-neutral-100"
      >
        <span>TELEMETRY</span>
        <span>{props.teleOpen ? '–' : '+'}</span>
      </button>
      {props.teleOpen && (
        <div className="mt-1">
          <TeleRow k="Scale height" v={`${w.scaleHeightKm.toFixed(1)} km`} />
          <TeleRow k="Column vs Earth" v={`${s.columnFactor.toExponential(2)}`} />
          <TeleRow k="τ Rayleigh R/G/B" v={`${s.tauR.r.toFixed(3)} / ${s.tauR.g.toFixed(3)} / ${s.tauR.b.toFixed(3)}`} />
          <TeleRow k="τ Mie R/G/B" v={`${s.tauM.r.toFixed(3)} / ${s.tauM.g.toFixed(3)} / ${s.tauM.b.toFixed(3)}`} />
          <TeleRow k="τ absorb R/G/B" v={`${s.tauA.r.toFixed(3)} / ${s.tauA.g.toFixed(3)} / ${s.tauA.b.toFixed(3)}`} />
          <TeleRow k="τ total @550nm" v={s.tauT.g.toFixed(3)} />
          <TeleRow k="Multi-scatter S(τ)" v={s.saturation550.toFixed(3)} />
          <TeleRow k="Stellar flux" v={`${s.fluxWm2 >= 100 ? s.fluxWm2.toFixed(0) : s.fluxWm2.toFixed(2)} W/m²`} />
          <TeleRow k="Surface light (approx.)" v={fmtLux(s.lux)} />
          <TeleRow k="Retinal gain" v={props.eye ? `${s.adaptGain.toFixed(2)}×` : '1.00× (off)'} />
          <TeleRow k="Final exposure" v={`${s.exposureFinal.toFixed(2)}×`} />
          <TeleRow k="Sun disc" v={`${s.starAngularDeg.toFixed(2)}°`} />
        </div>
      )}
    </Panel>
  );
}

/* ---------- HUD + fisheye ---------- */

function compass(yaw: number): string {
  const pts = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return pts[Math.round(yaw / 45) % 8];
}

export function Hud(props: { view: ViewState }) {
  const yaw = ((props.view.yawDeg % 360) + 360) % 360;
  const p = props.view.pitchDeg;
  return (
    <div className="rounded-lg border border-white/10 bg-neutral-950/80 px-3 py-1.5 font-mono text-[11px] text-neutral-200 backdrop-blur">
      HDG {String(Math.round(yaw)).padStart(3, '0')}° {compass(yaw)} · PITCH {p >= 0 ? '+' : '−'}
      {Math.abs(Math.round(p))}
      °{props.view.fisheye ? ' · FISHEYE' : ` · ${Math.round(props.view.fov)}°`}
    </div>
  );
}

export function FisheyeMask() {
  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{
        background: 'radial-gradient(circle at 50% 50%, transparent 33vmin, rgba(0,0,0,0.98) 34.5vmin)',
      }}
    >
      <p className="absolute bottom-24 left-1/2 -translate-x-1/2 font-mono text-[11px] tracking-widest text-neutral-400">
        ALL-SKY FISHEYE · 180°
      </p>
    </div>
  );
}
