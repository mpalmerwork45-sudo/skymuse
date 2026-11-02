import { WORLDS, type GasMix, type StarSpec, type WorldSpec } from './worlds';
import { AU_KM, SUN_KM, stellarLuminosity } from './spectrum';
import { gasLorentzFactor } from './refraction';

export const CUSTOM_WORLD_ID = 'custom';
export const CUSTOM_STORAGE_KEY = 'skymuse.custom-world.v1';
export const GAS_CONSTANT = 8.314462618;

/** Conventional molecular masses, g/mol; NIST Chemistry WebBook, SRD 69. */
export const GAS_SPECIES = [
  { key: 'n2', label: 'Nitrogen (N₂)', molarMass: 28.0134 },
  { key: 'o2', label: 'Oxygen (O₂)', molarMass: 31.9988 },
  { key: 'ar', label: 'Argon (Ar)', molarMass: 39.948 },
  { key: 'co2', label: 'Carbon dioxide (CO₂)', molarMass: 44.0095 },
  { key: 'h2', label: 'Hydrogen (H₂)', molarMass: 2.01588 },
  { key: 'he', label: 'Helium (He)', molarMass: 4.002602 },
  { key: 'ch4', label: 'Methane (CH₄)', molarMass: 16.04246 },
  { key: 'h2o', label: 'Water vapour (H₂O)', molarMass: 18.01528 },
  { key: 'so2', label: 'Sulfur dioxide (SO₂)', molarMass: 64.0638 },
] as const;
export type GasKey = typeof GAS_SPECIES[number]['key'];
export type GasPercentages = Record<GasKey, string>;

const HOSTS: Record<string, string> = {
  'proxima-b': 'Proxima Cen', 'trappist-1e': 'TRAPPIST-1',
  'kepler-186f': 'Kepler-186', 'wasp-12b': 'WASP-12',
};
const seenStars = new Set<string>();
export const STAR_CHOICES = WORLDS.filter(world => {
  if (seenStars.has(world.star.name)) return false;
  seenStars.add(world.star.name);
  return true;
}).map(world => ({
  id: world.star.name === 'Sol' ? 'sol' : world.id,
  label: world.star.name === 'Sol' ? 'Sun (Sol)' : world.star.name,
  fictional: world.group === 'Sci-Fi' || world.group === 'BattleTech',
  star: {
    ...world.star,
    spectrum: world.star.name === 'Sol' ? 'solar' : 'blackbody',
    catalogueHost: HOSTS[world.id],
  } as StarSpec,
}));

export interface CustomWorldDraft {
  version: 1;
  templateId: string;
  name: string;
  starChoiceId: string;
  starName: string;
  starTempK: string;
  starRadiusSun: string;
  distanceAU: string;
  radiusKm: string;
  gravityMs2: string;
  temperatureK: string;
  densityMode: 'pressure' | 'density';
  pressureBar: string;
  densityKgM3: string;
  gases: GasPercentages;
  ozoneDU: string;
  aerosolOD: string;
  aerosolHeightKm: string;
  cloudOpticalDepth: string;
  cloudCentreKm: string;
  cloudSigmaKm: string;
  surfaceColor: string;
  groundAlbedo: string;
  cloudSurface: boolean;
}
export type DraftField = Exclude<keyof CustomWorldDraft, 'version' | 'gases'> | 'composition';
export interface CustomWorldResult {
  world?: WorldSpec;
  errors: Partial<Record<DraftField, string>>;
  totalPercent: number;
  molarMass: number;
  pressureBar: number;
  densityKgM3: number;
  scaleHeightKm: number;
}

export function mixtureMolarMass(gases: GasMix): number {
  let total = 0, mass = 0;
  for (const gas of GAS_SPECIES) {
    const fraction = gases[gas.key] ?? 0;
    total += fraction;
    mass += fraction * gas.molarMass;
  }
  return total > 0 ? mass / total : 0;
}

export function idealGasDensity(pressureBar: number, molarMass: number, temperatureK: number): number {
  return pressureBar * 1e5 * molarMass * 1e-3 / (GAS_CONSTANT * temperatureK);
}
export function idealGasPressure(densityKgM3: number, molarMass: number, temperatureK: number): number {
  return densityKgM3 * GAS_CONSTANT * temperatureK / (molarMass * 1e-3) / 1e5;
}

export function percentagesFromMix(gases: GasMix): GasPercentages {
  const total = Object.values(gases).reduce((sum, fraction) => sum + (fraction ?? 0), 0);
  return Object.fromEntries(GAS_SPECIES.map(gas => [gas.key,
    total > 0 ? String(Number(((gases[gas.key] ?? 0) / total * 100).toPrecision(9))) : '0',
  ])) as GasPercentages;
}

export function normalizePercentages(gases: GasPercentages): GasPercentages | null {
  const values = GAS_SPECIES.map(gas => Number(gases[gas.key]));
  if (values.some(value => !Number.isFinite(value) || value < 0)) return null;
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return null;
  return Object.fromEntries(GAS_SPECIES.map((gas, i) => [gas.key,
    String(Number((values[i] / total * 100).toPrecision(9))),
  ])) as GasPercentages;
}

export function draftFromWorld(world: WorldSpec): CustomWorldDraft {
  const choice = STAR_CHOICES.find(candidate => candidate.star.name === world.star.name);
  const molarMass = mixtureMolarMass(world.gases) || world.molarMass;
  // Airless presets use zero to suppress thermal emission, rather than a
  // measured temperature. Give the editor an explicit physical temperature.
  const temperatureK = world.temperatureK > 0 ? world.temperatureK : 273.15;
  return {
    version: 1, templateId: world.id, name: `${world.name} experiment`,
    starChoiceId: choice?.id ?? 'custom', starName: world.star.name,
    starTempK: String(world.star.tempK), starRadiusSun: String(world.star.radiusSun),
    distanceAU: String(world.distanceAU), radiusKm: String(world.radiusKm),
    gravityMs2: String(world.gravityMs2), temperatureK: String(Number(temperatureK.toPrecision(8))),
    densityMode: 'pressure', pressureBar: String(world.pressureBar),
    densityKgM3: String(idealGasDensity(world.pressureBar, molarMass, temperatureK)),
    gases: percentagesFromMix(world.gases), ozoneDU: String(world.ozoneDU),
    aerosolOD: String(world.aerosol.density), aerosolHeightKm: String(world.aerosolHeightKm),
    cloudOpticalDepth: String(world.clouds.opticalDepth), cloudCentreKm: String(world.clouds.centreKm),
    cloudSigmaKm: String(world.clouds.sigmaKm), surfaceColor: world.surfaceColor,
    groundAlbedo: String(world.groundAlbedo), cloudSurface: world.horizonDiffuse,
  };
}

/** Only validated scenarios reach the worker or replace the current scene. */
export function resolveCustomWorld(draft: CustomWorldDraft): CustomWorldResult {
  const errors: CustomWorldResult['errors'] = {};
  const number = (key: Exclude<DraftField, 'composition'>, min: number, max: number, label: string) => {
    const raw = draft[key];
    const value = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN;
    if (!Number.isFinite(value) || value < min || value > max) errors[key] = `${label} must be between ${min} and ${max}.`;
    return value;
  };
  const template = WORLDS.find(world => world.id === draft.templateId);
  if (!template) errors.templateId = 'Choose an existing world as a starting point.';
  if (!draft.name.trim() || draft.name.length > 80) errors.name = 'Enter a world name of 1–80 characters.';

  const choice = STAR_CHOICES.find(candidate => candidate.id === draft.starChoiceId);
  if (!choice && draft.starChoiceId !== 'custom') errors.starChoiceId = 'Choose a star or define a custom star.';
  const tempK = draft.starChoiceId === 'custom' ? number('starTempK', 1000, 50000, 'Stellar temperature') : choice?.star.tempK ?? NaN;
  const radiusSun = draft.starChoiceId === 'custom' ? number('starRadiusSun', .01, 1000, 'Stellar radius') : choice?.star.radiusSun ?? NaN;
  if (draft.starChoiceId === 'custom' && (!draft.starName.trim() || draft.starName.length > 80)) errors.starName = 'Enter a star name of 1–80 characters.';
  const distanceAU = number('distanceAU', .0001, 10000, 'Orbital distance in AU');
  const radiusKm = number('radiusKm', 100, 200000, 'Planet radius in km');
  const gravityMs2 = number('gravityMs2', .1, 300, 'Surface gravity in m/s²');
  const temperatureK = number('temperatureK', 30, 4000, 'Atmospheric temperature in K');
  const ozoneDU = number('ozoneDU', 0, 2000, 'Ozone column in DU');
  const aerosolOD = number('aerosolOD', 0, 10, 'Haze optical depth');
  const aerosolHeightKm = number('aerosolHeightKm', .1, 1000, 'Haze scale height in km');
  const cloudOpticalDepth = number('cloudOpticalDepth', 0, 100, 'Cloud optical depth');
  const cloudCentreKm = number('cloudCentreKm', 0, 5000, 'Cloud height in km');
  const cloudSigmaKm = number('cloudSigmaKm', .1, 1000, 'Cloud layer width in km');
  const groundAlbedo = number('groundAlbedo', 0, 1, 'Surface albedo');
  if (!/^#[0-9a-f]{6}$/i.test(draft.surfaceColor)) errors.surfaceColor = 'Choose a valid surface colour.';

  const gases: GasMix = {};
  let totalPercent = 0;
  for (const gas of GAS_SPECIES) {
    const raw = draft.gases[gas.key];
    const percent = raw.trim() === '' ? NaN : Number(raw);
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) errors.composition = 'Each gas percentage must be between 0 and 100.';
    totalPercent += percent;
    gases[gas.key] = percent / 100;
  }
  const molarMass = mixtureMolarMass(gases);
  const setting = draft.densityMode === 'density'
    ? number('densityKgM3', 0, 1000, 'Gas density in kg/m³')
    : number('pressureBar', 0, 300, 'Surface pressure in bar');
  let pressureBar = draft.densityMode === 'density'
    ? setting === 0 ? 0 : idealGasPressure(setting, molarMass, temperatureK)
    : setting;
  const densityKgM3 = draft.densityMode === 'density' ? setting : idealGasDensity(pressureBar, molarMass, temperatureK);
  if (setting > 0 && (!Number.isFinite(totalPercent) || Math.abs(totalPercent - 100) > .001)) {
    errors.composition ??= 'Gas percentages must total 100%. Use “Normalize to 100%” to balance them.';
  }
  if (setting > 0 && molarMass <= 0) errors.composition = 'Choose at least one gas for a non-zero atmosphere.';
  if (draft.densityMode === 'density' && setting > 0 && (!Number.isFinite(pressureBar) || pressureBar > 300)) {
    errors.densityKgM3 = 'This density gives a pressure above the editor’s 300 bar limit. Lower the density or temperature.';
  }
  const scaleHeightKm = GAS_CONSTANT * temperatureK / ((molarMass || 28.97) * gravityMs2);
  if(Number.isFinite(pressureBar)&&gasLorentzFactor({pressureBar,temperatureK,gases})>=.95){
    errors[draft.densityMode==='density'?'densityKgM3':'pressureBar']='These density, temperature and composition settings exceed the supported gas refractivity range.';
  }
  if (setting > 0 && Number.isFinite(scaleHeightKm) && (scaleHeightKm < .1 || scaleHeightKm > 1000 || scaleHeightKm > radiusKm / 4)) {
    errors.temperatureK ??= 'These temperature, composition and gravity settings give an atmosphere outside the supported scale-height range (0.1–1000 km, at most ¼ of the planet radius).';
  }
  if (Number.isFinite(distanceAU) && distanceAU * AU_KM <= radiusSun * SUN_KM + radiusKm) {
    errors.distanceAU = 'The planet would overlap the star. Increase the orbital distance.';
  }
  const derived = { errors, totalPercent, molarMass, pressureBar, densityKgM3, scaleHeightKm };
  if (Object.keys(errors).length > 0 || !template) return derived;

  // Normalize the accepted roundoff in percentages exactly for all consumers.
  if (totalPercent > 0) for (const gas of GAS_SPECIES) gases[gas.key]! *= 100 / totalPercent;
  const star: StarSpec = choice ? { ...choice.star } : {
    name: draft.starName.trim(), type: 'Custom blackbody', tempK, radiusSun,
    spectrum: 'blackbody', luminosity: stellarLuminosity({ tempK, radiusSun }),
  };
  star.luminosity = stellarLuminosity(star);
  pressureBar = Math.max(0, pressureBar);
  const vacuum = pressureBar === 0;
  const world: WorldSpec = {
    ...template, id: CUSTOM_WORLD_ID, name: draft.name.trim(), group: 'Custom',
    blurb: 'A custom planet with user-selected stellar, surface and atmospheric properties.',
    star, distanceAU, radiusKm, gravityMs2, temperatureK,
    pressureBar, molarMass: molarMass || 28.97,
    scaleHeightKm: vacuum ? Math.max(.1, Math.min(1000, scaleHeightKm)) : scaleHeightKm,
    gases, ozoneDU: vacuum ? 0 : ozoneDU,
    aerosol: { ...template.aerosol, density: vacuum ? 0 : aerosolOD, tint: [...template.aerosol.tint] },
    aerosolHeightKm,
    clouds: { ...template.clouds, opticalDepth: vacuum ? 0 : cloudOpticalDepth, centreKm: cloudCentreKm, sigmaKm: cloudSigmaKm },
    surfaceColor: draft.surfaceColor, groundAlbedo, horizonDiffuse: draft.cloudSurface,
    rings: false, habitableZone: undefined,
    provenance: {
      status: 'Custom scenario', epoch: 'User-defined scenario', sources: [],
      assumptions: `User-selected inputs based on ${template.name}. Gas fractions are mole/volume fractions. Density uses the ideal-gas law; scale height uses an isothermal hydrostatic atmosphere. Haze and cloud scattering properties are inherited from the starting world. Chemistry, condensation and radiative equilibrium are not solved.`,
    },
  };
  return { ...derived, world };
}

/** Switching the independent variable preserves the current physical atmosphere. */
export function changeDensityMode(draft: CustomWorldDraft, mode: CustomWorldDraft['densityMode']): CustomWorldDraft {
  const values = resolveCustomWorld(draft);
  return {
    ...draft, densityMode: mode,
    pressureBar: Number.isFinite(values.pressureBar) ? String(values.pressureBar) : draft.pressureBar,
    densityKgM3: Number.isFinite(values.densityKgM3) ? String(values.densityKgM3) : draft.densityKgM3,
  };
}

/** Saved browser data must pass the same validation as the editor. */
export function parseCustomWorldDraft(json: string | null): CustomWorldDraft | null {
  if (!json) return null;
  try {
    const value = JSON.parse(json);
    const shape = draftFromWorld(WORLDS[0]);
    if (!value || value.version !== 1 || typeof value.gases !== 'object' || !value.gases) return null;
    for (const key of Object.keys(shape) as (keyof CustomWorldDraft)[]) {
      if (key !== 'gases' && typeof value[key] !== typeof shape[key]) return null;
    }
    if (!['pressure', 'density'].includes(value.densityMode)) return null;
    if (GAS_SPECIES.some(gas => typeof value.gases[gas.key] !== 'string')) return null;
    return resolveCustomWorld(value).world ? value as CustomWorldDraft : null;
  } catch { return null; }
}
