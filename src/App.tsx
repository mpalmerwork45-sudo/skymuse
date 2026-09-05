import { useEffect, useMemo, useState } from 'react';
import SkyView, { type ViewState } from './three/SkyView.tsx';
import { WORLDS } from './science/worlds.ts';
import { computeSky } from './science/atmosphere.ts';
import { DisplayPanel, FisheyeMask, Hud, SunBar, WorldPanel } from './ui/controls.tsx';

/** Default framing: face East, low pitch, golden dawn on the horizon. */
const DEFAULT_VIEW: ViewState = { yawDeg: 90, pitchDeg: 3, fisheye: false, fov: 60 };

export default function App() {
  const [worldId, setWorldId] = useState('earth');
  const world = WORLDS.find((w) => w.id === worldId) ?? WORLDS[0];
  const [sunElev, setSunElev] = useState(2);
  const [sunAz, setSunAz] = useState(90);
  const [aerosol, setAerosol] = useState(1);
  const [dustOn, setDustOn] = useState(true);
  const [cloudsOn, setCloudsOn] = useState(true);
  const [absorption, setAbsorption] = useState(true);
  const [eye, setEye] = useState(true);
  const [exposure, setExposure] = useState(1);
  const [view, setView] = useState<ViewState>(DEFAULT_VIEW);
  const [anim, setAnim] = useState<0 | 1 | -1>(0);
  const [worldsOpen, setWorldsOpen] = useState(true);
  const [teleOpen, setTeleOpen] = useState(true);

  // Cloud-deck master switch: clearing it reveals the clear-sky column beneath.
  const effWorld = useMemo(
    () => (cloudsOn ? world : { ...world, cloudAlbedo: 0 }),
    [world, cloudsOn],
  );

  const sky = useMemo(
    () =>
      computeSky(effWorld, {
        sunElevDeg: sunElev,
        sunAzDeg: sunAz,
        aerosolScale: dustOn ? aerosol : 0,
        absorptionOn: absorption,
        eyeAdapted: eye,
        exposure,
      }),
    [effWorld, sunElev, sunAz, aerosol, dustOn, absorption, eye, exposure],
  );

  // Sunrise (+1) / sunset (-1) animation at 1.5°/s.
  useEffect(() => {
    if (anim === 0) return;
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setSunElev((e) => {
        const next = e + anim * dt * 1.5;
        if (anim > 0 && next >= 45) {
          setAnim(0);
          return 45;
        }
        if (anim < 0 && next <= -12) {
          setAnim(0);
          return -12;
        }
        return next;
      });
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [anim]);

  const selectWorld = (id: string) => {
    setWorldId(id);
    setView({ ...DEFAULT_VIEW });
    setSunElev(2);
    setSunAz(90);
    setAnim(0);
  };

  return (
    <div className="relative h-full w-full overflow-hidden bg-black text-neutral-200">
      <SkyView world={effWorld} sky={sky} view={view} onViewChange={setView} />
      {view.fisheye && <FisheyeMask />}

      {/* top bar */}
      <div className="pointer-events-none absolute left-0 right-0 top-0 flex flex-wrap items-start justify-between gap-2 p-3">
        <div className="pointer-events-auto max-w-md rounded-lg border border-white/10 bg-neutral-950/80 px-3 py-2 backdrop-blur">
          <h1 className="text-sm font-bold tracking-[0.2em] text-amber-100">
            SKYMUSE <span className="font-normal text-neutral-400">· planetary sky simulator</span>
          </h1>
          <p className="mt-0.5 text-xs text-neutral-300">
            <span className="font-semibold text-white">{world.name}</span>
            {' · '}
            {world.star.name} ({world.star.type}) · {world.distanceAU} AU · {world.pressureBar} bar ·{' '}
            {world.gravityMs2} m/s²
          </p>
          <p className="mt-0.5 text-[11px] leading-snug text-neutral-400">{world.blurb}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Hud view={view} />
          <div className="pointer-events-auto flex gap-1">
            <button
              type="button"
              onClick={() => setWorldsOpen((o) => !o)}
              className="rounded-lg border border-white/10 bg-neutral-950/80 px-3 py-1.5 text-xs text-neutral-200 backdrop-blur hover:bg-white/10"
            >
              {worldsOpen ? 'Hide worlds' : 'Worlds'}
            </button>
            <button
              type="button"
              onClick={() => setView((v) => ({ ...v, yawDeg: 90, pitchDeg: 3, fisheye: false }))}
              className="rounded-lg border border-white/10 bg-neutral-950/80 px-3 py-1.5 text-xs text-neutral-200 backdrop-blur hover:bg-white/10"
              title="Reset to East-facing dawn view"
            >
              Reset view
            </button>
          </div>
        </div>
      </div>

      {/* left: worlds */}
      <div className="absolute left-3 top-36">
        <WorldPanel worldId={world.id} onSelect={selectWorld} open={worldsOpen} onToggle={() => setWorldsOpen(false)} />
      </div>

      {/* right: display + telemetry */}
      <div className="absolute right-3 top-36 hidden sm:block">
        <DisplayPanel
          world={effWorld}
          sky={sky}
          aerosol={aerosol}
          dustOn={dustOn}
          cloudsOn={cloudsOn}
          absorption={absorption}
          eye={eye}
          exposure={exposure}
          fisheye={view.fisheye}
          teleOpen={teleOpen}
          onAerosol={setAerosol}
          onDust={setDustOn}
          onClouds={setCloudsOn}
          onAbsorption={setAbsorption}
          onEye={setEye}
          onExposure={setExposure}
          onFisheye={(f) => setView((v) => ({ ...v, fisheye: f }))}
          onTele={() => setTeleOpen((o) => !o)}
        />
      </div>

      {/* bottom: ephemeris */}
      <div className="absolute bottom-3 left-1/2 w-[min(96vw,720px)] -translate-x-1/2">
        <SunBar
          elev={sunElev}
          az={sunAz}
          anim={anim}
          onElev={(v) => {
            setSunElev(v);
            setAnim(0);
          }}
          onAz={setSunAz}
          onPreset={(kind) => {
            if (kind === 'stop') {
              setAnim(0);
            } else if (kind === 'sunrise') {
              setSunElev(-8);
              setAnim(1);
            } else {
              setSunElev(35);
              setAnim(-1);
            }
          }}
        />
        <p className="mt-1 text-center font-mono text-[10px] text-neutral-500">
          drag to look · scroll to zoom · dawn default: East 090° / +2°
        </p>
      </div>
    </div>
  );
}
