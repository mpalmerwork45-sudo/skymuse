import { useEffect, useId, useRef, useState } from 'react';
import { WORLDS, type GasMix } from '../science/worlds';
import {
  GAS_SPECIES, STAR_CHOICES, changeDensityMode, draftFromWorld,
  normalizePercentages, percentagesFromMix, resolveCustomWorld,
  type CustomWorldDraft, type DraftField,
} from '../science/customWorld';

const inputClass = 'mt-1 w-full rounded border border-white/15 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100 outline-none focus:border-amber-300 disabled:opacity-50';
const actionClass = 'rounded border border-white/20 px-3 py-2 text-xs hover:bg-white/10 focus-visible:outline focus-visible:outline-amber-300';

function NumberField(p: {
  label: string; value: string; onChange: (value: string) => void;
  min?: number; max?: number; disabled?: boolean; error?: string;
}) {
  const id = useId();
  return <label htmlFor={id} className="block text-xs text-neutral-300">
    {p.label}
    <input id={id} className={inputClass} type="number" step="any" min={p.min} max={p.max}
      value={p.value} disabled={p.disabled} onChange={event => p.onChange(event.target.value)}
      aria-invalid={!!p.error} aria-describedby={p.error ? `${id}-error` : undefined} />
    {p.error && <span id={`${id}-error`} className="mt-1 block text-[11px] text-red-300">{p.error}</span>}
  </label>;
}

const MIXTURES: { id: string; label: string; mix: GasMix }[] = [
  { id: 'air', label: 'Earth air', mix: WORLDS[0].gases },
  { id: 'co2', label: 'Pure carbon dioxide', mix: { co2: 1 } },
  { id: 'nitrogen', label: 'Pure nitrogen', mix: { n2: 1 } },
  { id: 'hydrogen', label: 'Hydrogen / helium (90 / 10)', mix: { h2: .9, he: .1 } },
  { id: 'methane', label: 'Nitrogen / methane (95 / 5)', mix: { n2: .95, ch4: .05 } },
];
const format = (value: number, digits = 4) => Number.isFinite(value) ? Number(value.toPrecision(digits)).toLocaleString('en-US', { maximumSignificantDigits: digits }) : '—';

export default function WorldEditor(p: {
  initialDraft: CustomWorldDraft;
  onApply: (draft: CustomWorldDraft) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(p.initialDraft);
  const [showErrors, setShowErrors] = useState(false);
  const result = resolveCustomWorld(draft);
  const choice = STAR_CHOICES.find(star => star.id === draft.starChoiceId);
  const customStar = draft.starChoiceId === 'custom';
  const vacuum = draft.densityMode === 'pressure' ? Number(draft.pressureBar) === 0 : Number(draft.densityKgM3) === 0;

  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);

  const field = <K extends keyof CustomWorldDraft>(key: K, value: CustomWorldDraft[K]) =>
    setDraft(current => ({ ...current, [key]: value }));
  const number = (key: DraftField & keyof CustomWorldDraft, label: string, min: number, max: number, disabled = false) =>
    <NumberField key={key} label={label} value={draft[key] as string} min={min} max={max} disabled={disabled}
      onChange={value => field(key, value as never)} error={showErrors ? result.errors[key] : undefined} />;
  const apply = () => {
    setShowErrors(true);
    if (result.world) p.onApply(draft);
    else requestAnimationFrame(() => dialog.current?.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus());
  };

  return <dialog ref={dialog} aria-labelledby="world-editor-title" onCancel={p.onClose}
    className="m-auto max-h-[94dvh] w-[min(94vw,900px)] overflow-y-auto rounded-xl border border-white/20 bg-neutral-950 p-0 text-neutral-200 shadow-2xl backdrop:bg-black/70"
    onClick={event => { if (event.target === event.currentTarget) {
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) p.onClose();
    } }}>
    <form noValidate onSubmit={event => { event.preventDefault(); apply(); }}>
      <header className="flex items-start justify-between gap-4 border-b border-white/10 p-4 sm:px-6">
        <div>
          <h2 id="world-editor-title" className="text-lg font-semibold text-amber-100">Customise your world</h2>
          <p className="mt-1 text-xs text-neutral-400">Choose a star and planet, then apply the settings to recalculate the sky.</p>
        </div>
        <button type="button" className={actionClass} aria-label="Close world editor" onClick={p.onClose}>✕</button>
      </header>

      <div className="space-y-5 p-4 sm:px-6">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-neutral-300">Starting world
            <select aria-label="Starting world" className={inputClass} value={draft.templateId} onChange={event => {
              setDraft(draftFromWorld(WORLDS.find(world => world.id === event.target.value)!)); setShowErrors(false);
            }}>{WORLDS.map(world => <option key={world.id} value={world.id}>{world.name}</option>)}</select>
          </label>
          <label className="text-xs text-neutral-300">World name
            <input className={inputClass} value={draft.name} maxLength={80} onChange={event => field('name', event.target.value)}
              aria-invalid={showErrors && !!result.errors.name} />
            {showErrors && result.errors.name && <span className="block text-red-300">{result.errors.name}</span>}
          </label>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <fieldset className="space-y-3 rounded-lg border border-white/10 p-3">
            <legend className="px-1 text-sm font-medium text-amber-100">Star and orbit</legend>
            <label className="block text-xs text-neutral-300">Star
              <select aria-label="Star" className={inputClass} value={draft.starChoiceId} onChange={event => {
                const selected = STAR_CHOICES.find(star => star.id === event.target.value);
                setDraft(current => ({ ...current, starChoiceId: event.target.value,
                  starName: selected?.star.name ?? 'Custom star',
                  starTempK: selected ? String(selected.star.tempK) : current.starTempK,
                  starRadiusSun: selected ? String(selected.star.radiusSun) : current.starRadiusSun }));
              }}>
                <optgroup label="Stars and stellar classes">{STAR_CHOICES.filter(star => !star.fictional).map(star =>
                  <option key={star.id} value={star.id}>{star.label} · {star.star.type}</option>)}</optgroup>
                <optgroup label="Fictional stellar scenarios">{STAR_CHOICES.filter(star => star.fictional).map(star =>
                  <option key={star.id} value={star.id}>{star.label}</option>)}</optgroup>
                <option value="custom">Custom star…</option>
              </select>
            </label>
            {customStar && <label className="block text-xs text-neutral-300">Star name
              <input className={inputClass} value={draft.starName} maxLength={80} onChange={event => field('starName', event.target.value)}
                aria-invalid={showErrors && !!result.errors.starName} />
              {showErrors && result.errors.starName && <span className="block text-red-300">{result.errors.starName}</span>}
            </label>}
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="Stellar temperature (K)" value={choice ? String(choice.star.tempK) : draft.starTempK} min={1000} max={50000}
                disabled={!customStar} onChange={value => field('starTempK', value)} error={showErrors ? result.errors.starTempK : undefined} />
              <NumberField label="Stellar radius (R☉)" value={choice ? String(choice.star.radiusSun) : draft.starRadiusSun} min={.01} max={1000}
                disabled={!customStar} onChange={value => field('starRadiusSun', value)} error={showErrors ? result.errors.starRadiusSun : undefined} />
            </div>
            {number('distanceAU', 'Distance from star (AU)', .0001, 10000)}
            <p className="text-[11px] text-neutral-400">1 AU is Earth’s average distance from the Sun. Stellar brightness and disc size follow the selected radius, temperature and distance.</p>
          </fieldset>

          <fieldset className="space-y-3 rounded-lg border border-white/10 p-3">
            <legend className="px-1 text-sm font-medium text-amber-100">Planet</legend>
            <div className="grid grid-cols-2 gap-3">
              {number('radiusKm', 'Planet radius (km)', 100, 200000)}
              {number('gravityMs2', 'Surface gravity (m/s²)', .1, 300)}
            </div>
            {number('temperatureK', 'Temperature (K)', 30, 4000)}
            <p className="text-[11px] text-neutral-400">A prescribed isothermal atmosphere and surface. The editor does not calculate climate or chemical equilibrium.</p>
            <label className="block text-xs text-neutral-300">Lower boundary
              <select aria-label="Lower boundary" className={inputClass} value={draft.cloudSurface ? 'cloud' : 'solid'} onChange={event => field('cloudSurface', event.target.value === 'cloud')}>
                <option value="solid">Solid surface</option><option value="cloud">Cloud level (gas giant)</option>
              </select>
            </label>
          </fieldset>
        </div>

        <fieldset className="space-y-3 rounded-lg border border-white/10 p-3">
          <legend className="px-1 text-sm font-medium text-amber-100">Atmosphere</legend>
          <div className="grid items-start gap-3 sm:grid-cols-2">
            <label className="text-xs text-neutral-300">Set atmosphere by
              <select aria-label="Set atmosphere by" className={inputClass} value={draft.densityMode} onChange={event => setDraft(current => changeDensityMode(current, event.target.value as CustomWorldDraft['densityMode']))}>
                <option value="pressure">Surface pressure</option><option value="density">Surface gas density</option>
              </select>
            </label>
            {draft.densityMode === 'pressure'
              ? number('pressureBar', 'Surface pressure (bar)', 0, 300)
              : number('densityKgM3', 'Surface gas density (kg/m³)', 0, 1000)}
          </div>
          <p className="text-[11px] text-neutral-400">Density and pressure are linked by the ideal-gas law. Set either to 0 for an airless world; gas, haze, clouds and ozone are then disabled.</p>

          <div className="flex flex-wrap items-end justify-between gap-3 border-t border-white/10 pt-3">
            <label className="text-xs text-neutral-300">Load gas mixture
              <select aria-label="Load gas mixture" className={inputClass} value="" onChange={event => {
                const mixture = MIXTURES.find(candidate => candidate.id === event.target.value);
                if (mixture) field('gases', percentagesFromMix(mixture.mix));
              }}><option value="" disabled>Choose a mixture…</option>{MIXTURES.map(mixture => <option key={mixture.id} value={mixture.id}>{mixture.label}</option>)}</select>
            </label>
            <button type="button" className={actionClass} onClick={() => {
              const normalized = normalizePercentages(draft.gases);
              if (normalized) field('gases', normalized); else setShowErrors(true);
            }}>Normalize to 100%</button>
          </div>
          <p className={`text-xs ${Math.abs(result.totalPercent - 100) < .001 || vacuum ? 'text-neutral-300' : 'text-amber-200'}`}>
            Composition by volume / mole fraction · Total {format(result.totalPercent, 7)}%
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {GAS_SPECIES.map(gas => <NumberField key={gas.key} label={`${gas.label} %`} value={draft.gases[gas.key]} min={0} max={100}
              onChange={value => field('gases', { ...draft.gases, [gas.key]: value })} />)}
          </div>
          {showErrors && result.errors.composition && <p role="alert" className="text-xs text-red-300">{result.errors.composition}</p>}
          <dl className="grid grid-cols-2 gap-3 rounded bg-white/5 p-3 text-xs sm:grid-cols-4" aria-label="Derived atmosphere">
            {[['Pressure', `${format(result.pressureBar)} bar`], ['Gas density', `${format(result.densityKgM3)} kg/m³`],
              ['Molar mass', result.molarMass > 0 ? `${format(result.molarMass)} g/mol` : 'No gases'],
              ['Gas scale height', `${format(result.scaleHeightKm)} km`]].map(([label, value]) =>
              <div key={label}><dt className="text-neutral-400">{label}</dt><dd className="mt-1 font-mono text-amber-100">{value}</dd></div>)}
          </dl>
        </fieldset>

        <details className="rounded-lg border border-white/10 p-3">
          <summary className="cursor-pointer text-sm text-amber-100">Haze, clouds and surface</summary>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {number('aerosolOD', 'Haze optical depth (550 nm)', 0, 10, vacuum)}
            {number('aerosolHeightKm', 'Haze scale height (km)', .1, 1000, vacuum)}
            {number('ozoneDU', 'Ozone column (DU)', 0, 2000, vacuum)}
            {number('cloudOpticalDepth', 'Cloud optical depth', 0, 100, vacuum)}
            {number('cloudCentreKm', 'Cloud centre height (km)', 0, 5000, vacuum)}
            {number('cloudSigmaKm', 'Cloud layer width (km)', .1, 1000, vacuum)}
            {number('groundAlbedo', 'Surface albedo (0–1)', 0, 1)}
            <label className="text-xs text-neutral-300">Surface colour
              <input className={`${inputClass} h-9 p-1`} type="color" value={draft.surfaceColor} onChange={event => field('surfaceColor', event.target.value)} />
            </label>
          </div>
          <p className="mt-3 text-[11px] text-neutral-400">Albedo sets reflected light; colour sets its approximate tint. Other particle scattering properties come from the starting world. Ozone is specified separately as a trace-gas column.</p>
        </details>

        <p className="text-[11px] text-neutral-400">Custom worlds use manual stellar position and a chosen observer frame. Catalogue orbits, named moons and Saturn’s rings belong to their original preset worlds. Your applied custom world is saved in this browser.</p>
        {showErrors && !result.world && <div role="alert" className="rounded border border-red-400/30 bg-red-400/5 p-3 text-xs text-red-200">
          <p>Check the highlighted settings before applying:</p>
          <ul className="mt-1 list-disc space-y-1 pl-4">{Object.entries(result.errors).map(([key, error]) => <li key={key}>{error}</li>)}</ul>
        </div>}
      </div>

      <footer className="sticky bottom-0 flex justify-end gap-2 border-t border-white/10 bg-neutral-950 px-4 py-3 sm:px-6">
        <button type="button" className={actionClass} onClick={p.onClose}>Cancel</button>
        <button type="submit" className="rounded bg-amber-300 px-4 py-2 text-sm font-semibold text-neutral-950 hover:bg-amber-200">Apply world</button>
      </footer>
    </form>
  </dialog>;
}
