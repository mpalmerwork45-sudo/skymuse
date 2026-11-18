/**
 * World catalog — physical + optical parameters for every simulatable sky.
 *
 * Sources & conventions (approximate, documented per field):
 * - Solar System pressures, gravities, molar masses: NASA planetary fact sheets.
 * - Scale heights: H = R*T/(M*g); values below are the canonical quoted H.
 * - Gas-giant entries are evaluated at the 1-bar upper-troposphere level.
 * - Rayleigh cross-sections are relative to N2 at 550 nm (CO2 ~= 2.3x N2).
 * - Aerosol `density` is the vertical Mie optical depth at 550 nm (clear-day baseline).
 */
import { conservativeHabitableZone, type HabitableZone } from './habitableZone';
import { stellarLuminosity } from './spectrum';

export type WorldGroup =
  | 'Custom'
  | 'Earth variants'
  | 'Solar System'
  | 'Gas Giants'
  | 'Moons & Dwarf'
  | 'Exoplanets'
  | 'Sci-Fi'
  | 'BattleTech';

export interface StarSpec {
  /** Explicit spectrum selection for user-defined stars, including stars named Sol. */
  spectrum?: 'solar' | 'blackbody';
  /** Known stellar host for the background catalogue's observer location. */
  catalogueHost?: string;
  /** Display name, e.g. "Sol", "Proxima Centauri" */
  name: string;
  /** Spectral class label */
  type: string;
  /** Bolometric luminosity in units of L_sun, derived from radius and temperature */
  luminosity: number;
  /** Effective temperature (K) — drives star color */
  tempK: number;
  /** Stellar radius in R_sun — drives apparent sun disc size */
  radiusSun: number;
}

export interface AerosolSpec {
  /** Human-readable particle description */
  name: string;
  /** Vertical Mie optical depth at 550 nm under default conditions */
  density: number;
  /** Henyey-Greenstein asymmetry factor g (-1 back .. +1 forward) */
  g: number;
  /** Optional RGB asymmetry; qualitative wavelength-dependent dust scattering. */
  gRGB?: [number, number, number];
  /** Single-scattering albedo (1 = conservative scattering) */
  albedo: number;
  /** Angstrom wavelength exponent: tau ~ lambda^-angstrom */
  angstrom: number;
  /** Scattering tint (linear RGB) — e.g. iron-oxide dust is red */
  tint: [number, number, number];
}

/** Rayleigh-active gases as volume mixing ratios (need not sum to 1). */
export interface GasMix {
  n2?: number;
  o2?: number;
  ar?: number;
  co2?: number;
  h2?: number;
  he?: number;
  ch4?: number;
  h2o?: number;
  so2?: number;
}

interface Preset {
  id: string;
  name: string;
  group: WorldGroup;
  blurb: string;
  star: Omit<StarSpec, 'luminosity'>;
  /** Orbital distance in AU */
  distanceAU: number;
  /** Surface (or 1-bar level) pressure in bar */
  pressureBar: number;
  /** Pressure scale height in km */
  scaleHeightKm: number;
  /** Surface gravity m/s^2 */
  gravityMs2: number;
  /** Mean molar mass g/mol */
  molarMass: number;
  gases: GasMix;
  aerosol: AerosolSpec;
  /** Ozone column in Dobson units. */
  ozoneDU: number;
  /** Ground / cloud-deck color (hex) */
  surfaceColor: string;
  /** Solar photopic mean reflectance, 0..1; assumed surface material. */
  groundAlbedo: number;
  /** True for gas-giant cloud decks: horizon blends diffusely instead of a crisp edge */
  horizonDiffuse: boolean;
  rings?: boolean;
}

const SOL: Omit<StarSpec, 'luminosity'> = { name: 'Sol', type: 'G2V', tempK: 5772, radiusSun: 1 };

const PRESETS: Preset[] = [
  // ---------------- Solar System ----------------
  {
    id: 'earth', name: 'Earth', group: 'Solar System',
    blurb: 'Nitrogen–oxygen air. Blue Rayleigh dome by day, ozone-warmed twilight.',
    star: SOL, distanceAU: 1, pressureBar: 1.013, scaleHeightKm: 8.4, gravityMs2: 9.81, molarMass: 28.97,
    gases: { n2: 0.78, o2: 0.21, ar: 0.01 },
    aerosol: { name: 'Background sulfate + water', density: 0.06, g: 0.65, albedo: 0.95, angstrom: 1.3, tint: [1, 0.98, 0.95] },
    ozoneDU: 300, surfaceColor: '#55603f', groundAlbedo: 0.3, horizonDiffuse: false,
  },
  {
    id: 'mars', name: 'Mars', group: 'Solar System',
    blurb: 'Butterscotch dust-scattered day; dust sends a blue sunset glow close to the sun (approximate colours).',
    star: SOL, distanceAU: 1.524, pressureBar: 0.006, scaleHeightKm: 11.1, gravityMs2: 3.71, molarMass: 43.34,
    gases: { co2: 0.95, n2: 0.027, ar: 0.016 },
    // Near-grey extinction and a narrower blue forward lobe reproduce the
    // observed *direction* of the sunset colour change. These are qualitative
    // fit parameters, not measured Martian dust optical constants.
    aerosol: { name: 'Iron-oxide dust', density: 0.5, g: 0.7, gRGB: [0.65, 0.75, 0.85], albedo: 0.86, angstrom: 0, tint: [1, 0.6, 0.36] },
    ozoneDU: 0, surfaceColor: '#a05c38', groundAlbedo: 0.25, horizonDiffuse: false,
  },
  {
    id: 'venus', name: 'Venus', group: 'Solar System',
    blurb: 'A solid surface beneath a dense CO₂ atmosphere and an optically thick cloud layer. Cloud and absorber profiles remain approximate.',
    star: SOL, distanceAU: 0.723, pressureBar: 92, scaleHeightKm: 15.9, gravityMs2: 8.87, molarMass: 43.45,
    gases: { co2: 0.965, n2: 0.035 },
    aerosol: { name: 'Sulfuric-acid droplets', density: 2.5, g: 0.75, albedo: 0.99, angstrom: 0.8, tint: [1, 0.84, 0.58] },
    ozoneDU: 0, surfaceColor: '#7d6242', groundAlbedo: 0.1, horizonDiffuse: false,
  },
  {
    id: 'mercury', name: 'Mercury', group: 'Solar System',
    blurb: 'Airless: black noon sky, blazing white sun, gray regolith to a razor horizon.',
    star: SOL, distanceAU: 0.387, pressureBar: 0, scaleHeightKm: 0, gravityMs2: 3.7, molarMass: 29,
    gases: {},
    aerosol: { name: 'None (exosphere)', density: 0, g: 0, albedo: 1, angstrom: 1, tint: [1, 1, 1] },
    ozoneDU: 0, surfaceColor: '#8a8883', groundAlbedo: 0.12, horizonDiffuse: false,
  },
  {
    id: 'moon', name: 'Moon', group: 'Solar System',
    blurb: 'Airless regolith and a black sky. Earth appears above the horizon from the lunar near side.',
    star: SOL, distanceAU: 1, pressureBar: 0, scaleHeightKm: 0, gravityMs2: 1.62, molarMass: 29,
    gases: {},
    aerosol: { name: 'None (exosphere)', density: 0, g: 0, albedo: 1, angstrom: 1, tint: [1, 1, 1] },
    ozoneDU: 0, surfaceColor: '#9a9a98', groundAlbedo: 0.12, horizonDiffuse: false,
  },
  // ---------------- Gas giants (1-bar level) ----------------
  {
    id: 'jupiter', name: 'Jupiter', group: 'Gas Giants',
    blurb: 'Floating at the 1-bar deck: ammonia haze over salmon belts, dimmed distant sun.',
    star: SOL, distanceAU: 5.2, pressureBar: 1, scaleHeightKm: 27, gravityMs2: 24.79, molarMass: 2.2,
    gases: { h2: 0.898, he: 0.1, ch4: 0.002 },
    aerosol: { name: 'Ammonia haze', density: 0.35, g: 0.7, albedo: 0.98, angstrom: 1, tint: [0.98, 0.9, 0.78] },
    ozoneDU: 0, surfaceColor: '#c2a67e', groundAlbedo: 0.4, horizonDiffuse: true,
  },
  {
    id: 'saturn', name: 'Saturn', group: 'Gas Giants',
    blurb: 'Pale-gold 1-bar haze beneath the grand ring arch, with Titan and Rhea in attendance.',
    star: SOL, distanceAU: 9.58, pressureBar: 1, scaleHeightKm: 59.5, gravityMs2: 10.44, molarMass: 2.07,
    gases: { h2: 0.96, he: 0.03, ch4: 0.005 },
    aerosol: { name: 'Ammonia / phosphine haze', density: 0.3, g: 0.7, albedo: 0.98, angstrom: 1, tint: [1, 0.93, 0.78] },
    ozoneDU: 0, surfaceColor: '#d3bf96', groundAlbedo: 0.4, horizonDiffuse: true,
    rings: true,
  },
  {
    id: 'uranus', name: 'Uranus', group: 'Gas Giants',
    blurb: 'Methane-scrubbed red light leaves a clear robin-egg cyan dome.',
    star: SOL, distanceAU: 19.2, pressureBar: 1, scaleHeightKm: 27.7, gravityMs2: 8.87, molarMass: 2.3,
    gases: { h2: 0.83, he: 0.15, ch4: 0.02 },
    aerosol: { name: 'Thin methane haze', density: 0.12, g: 0.65, albedo: 0.97, angstrom: 1.1, tint: [0.9, 0.98, 1] },
    ozoneDU: 0, surfaceColor: '#8fd8d4', groundAlbedo: 0.35, horizonDiffuse: true,
  },
  {
    id: 'neptune', name: 'Neptune', group: 'Gas Giants',
    blurb: 'Methane absorption in an assumed 1-bar atmosphere. Haze and cloud profiles determine the local colour.',
    star: SOL, distanceAU: 30.07, pressureBar: 1, scaleHeightKm: 19, gravityMs2: 11.15, molarMass: 2.3,
    gases: { h2: 0.8, he: 0.19, ch4: 0.01 },
    aerosol: { name: 'Hydrocarbon haze', density: 0.18, g: 0.68, albedo: 0.96, angstrom: 1.1, tint: [0.85, 0.92, 1] },
    ozoneDU: 0, surfaceColor: '#4d6fc4', groundAlbedo: 0.35, horizonDiffuse: true,
  },
  // ---------------- Moons & dwarf ----------------
  {
    id: 'titan', name: 'Titan', group: 'Moons & Dwarf',
    blurb: 'Deep-orange organic tholin smog; noon is a burnt-ember twilight.',
    star: SOL, distanceAU: 9.58, pressureBar: 1.45, scaleHeightKm: 21, gravityMs2: 1.35, molarMass: 27.3,
    gases: { n2: 0.95, ch4: 0.05 },
    aerosol: { name: 'Organic tholin smog', density: 2.2, g: 0.72, albedo: 0.9, angstrom: 1.6, tint: [1, 0.48, 0.14] },
    ozoneDU: 0, surfaceColor: '#6b4a2e', groundAlbedo: 0.2, horizonDiffuse: false,
  },
  {
    id: 'triton', name: 'Triton', group: 'Moons & Dwarf',
    blurb: 'A whisper of nitrogen over pink cantaloupe ice; near-black sky, hard sun.',
    star: SOL, distanceAU: 30.07, pressureBar: 0.000014, scaleHeightKm: 14, gravityMs2: 0.78, molarMass: 28,
    gases: { n2: 1 },
    aerosol: { name: 'Trace nitrogen haze', density: 0.02, g: 0.6, albedo: 0.95, angstrom: 1.2, tint: [0.95, 0.97, 1] },
    ozoneDU: 0, surfaceColor: '#d3c2bc', groundAlbedo: 0.6, horizonDiffuse: false,
  },
  {
    id: 'pluto', name: 'Pluto', group: 'Moons & Dwarf',
    blurb: 'Distant sunlight and a tenuous blue haze. Haze optical depth follows New Horizons; layer structure is simplified.',
    star: SOL, distanceAU: 39.5, pressureBar: 0.00001, scaleHeightKm: 20, gravityMs2: 0.62, molarMass: 28,
    gases: { n2: 0.99, ch4: 0.005 },
    aerosol: { name: 'New Horizons haze (vertical mean)', density: 0.013, g: 0.6, albedo: 0.95, angstrom: 1.4, tint: [0.6, 0.75, 1] },
    ozoneDU: 0, surfaceColor: '#b09d8c', groundAlbedo: 0.4, horizonDiffuse: false,
  },
  // ---------------- Exoplanets ----------------
  {
    id: 'proxima-b', name: 'Proxima Centauri b', group: 'Exoplanets',
    blurb: 'An assumed terrestrial atmosphere. Surface pressure, composition and rotation are unmeasured.',
    star: { name: 'Proxima Centauri', type: 'M5.5V', tempK: 3042, radiusSun: 0.154 },
    distanceAU: 0.0485, pressureBar: 1, scaleHeightKm: 8, gravityMs2: 10.9, molarMass: 29,
    gases: { n2: 0.8, o2: 0.15, co2: 0.05 },
    aerosol: { name: 'Thin water haze', density: 0.08, g: 0.65, albedo: 0.95, angstrom: 1.3, tint: [1, 0.9, 0.8] },
    ozoneDU: 180, surfaceColor: '#4a5a52', groundAlbedo: 0.25, horizonDiffuse: false,
  },
  {
    id: 'trappist-1e', name: 'TRAPPIST-1e', group: 'Exoplanets',
    blurb: 'An assumed nitrogen–CO₂ atmosphere beneath a cool dwarf. Whether this planet has an atmosphere or oceans is unknown.',
    star: { name: 'TRAPPIST-1', type: 'M8V', tempK: 2566, radiusSun: 0.119 },
    distanceAU: 0.028, pressureBar: 1, scaleHeightKm: 8.2, gravityMs2: 9.0, molarMass: 29,
    gases: { n2: 0.85, co2: 0.1, h2o: 0.05 },
    aerosol: { name: 'Humid haze', density: 0.12, g: 0.65, albedo: 0.94, angstrom: 1.2, tint: [1, 0.85, 0.72] },
    ozoneDU: 90, surfaceColor: '#3f5a5c', groundAlbedo: 0.2, horizonDiffuse: false,
  },
  {
    id: 'kepler-186f', name: 'Kepler-186f', group: 'Exoplanets',
    blurb: 'An assumed terrestrial atmosphere illuminated by a cool star; surface conditions are unknown.',
    star: { name: 'Kepler-186', type: 'M1V', tempK: 3788, radiusSun: 0.52 },
    distanceAU: 0.432, pressureBar: 1.2, scaleHeightKm: 8.6, gravityMs2: 9.2, molarMass: 28.5,
    gases: { n2: 0.8, o2: 0.18, co2: 0.02 },
    aerosol: { name: 'Light continental haze', density: 0.1, g: 0.65, albedo: 0.95, angstrom: 1.3, tint: [1, 0.95, 0.85] },
    ozoneDU: 240, surfaceColor: '#4f6b46', groundAlbedo: 0.3, horizonDiffuse: false,
  },
  {
    id: 'wasp-12b', name: 'WASP-12b (hot Jupiter)', group: 'Exoplanets',
    blurb: 'A 37° stellar disc above an assumed hot, absorbing atmosphere. Thermal glow uses an illustrative 2500 K profile.',
    star: { name: 'WASP-12', type: 'G0V', tempK: 6300, radiusSun: 1.57 },
    distanceAU: 0.0229, pressureBar: 1, scaleHeightKm: 300, gravityMs2: 11.3, molarMass: 2.3,
    gases: { h2: 0.9, he: 0.1 },
    aerosol: { name: 'Absorbing silicate haze', density: 0.5, g: 0.7, albedo: 0.6, angstrom: 0.7, tint: [0.9, 0.85, 0.8] },
    ozoneDU: 0, surfaceColor: '#3a3a44', groundAlbedo: 0.15, horizonDiffuse: true,
  },
  // ---------------- Sci-fi ----------------
  {
    id: 'lv426-pre', name: 'LV-426 — Pre-Terraforming', group: 'Sci-Fi',
    blurb: 'Primordial nitrogen–methane superstorm: bruised violet murk, ammonia lightning skies.',
    star: { name: 'Zeta Reticuli', type: 'G2V', tempK: 5700, radiusSun: 0.95 },
    distanceAU: 1.2, pressureBar: 4, scaleHeightKm: 12, gravityMs2: 8.5, molarMass: 27,
    gases: { n2: 0.8, ch4: 0.18, co2: 0.02 },
    aerosol: { name: 'Storm-lofted silicate dust', density: 1.6, g: 0.8, albedo: 0.8, angstrom: 1, tint: [0.72, 0.6, 0.52] },
    ozoneDU: 0, surfaceColor: '#3d3a36', groundAlbedo: 0.12, horizonDiffuse: false,
  },
  {
    id: 'lv426-post', name: 'LV-426 — Post-Terraforming', group: 'Sci-Fi',
    blurb: 'Atmospheric processors done: breathable, overcast, drizzle-gray dawn over basalt.',
    star: { name: 'Zeta Reticuli', type: 'G2V', tempK: 5700, radiusSun: 0.95 },
    distanceAU: 1.2, pressureBar: 1, scaleHeightKm: 9, gravityMs2: 8.5, molarMass: 29,
    gases: { n2: 0.78, o2: 0.21, h2o: 0.01 },
    aerosol: { name: 'Processor water overcast', density: 0.7, g: 0.75, albedo: 0.97, angstrom: 1, tint: [0.85, 0.87, 0.9] },
    ozoneDU: 120, surfaceColor: '#5c6b52', groundAlbedo: 0.25, horizonDiffuse: false,
  },
  {
    id: 'arrakis', name: 'Arrakis (Dune)', group: 'Sci-Fi',
    blurb: 'An authored desert atmosphere and fictional stellar analogue; no sodium spectrum or canonical climate is claimed.',
    star: { name: 'Fictional Canopus analogue', type: 'assumed F star', tempK: 6500, radiusSun: 1.5 },
    distanceAU: 1.4, pressureBar: 1.1, scaleHeightKm: 9, gravityMs2: 9.86, molarMass: 29,
    gases: { n2: 0.9, o2: 0.08, co2: 0.02 },
    aerosol: { name: 'Coriolis spice-dust', density: 0.9, g: 0.75, albedo: 0.88, angstrom: 1.1, tint: [1, 0.8, 0.42] },
    ozoneDU: 60, surfaceColor: '#d9a84e', groundAlbedo: 0.35, horizonDiffuse: false,
  },
  // ---------------- BattleTech ----------------
  {
    id: 'solaris', name: 'Solaris VII', group: 'BattleTech',
    blurb: 'Game-world smog: arena floodlights under a brown-coal noon haze.',
    star: { name: 'Solaris', type: 'G8V', tempK: 5400, radiusSun: 0.9 },
    distanceAU: 0.95, pressureBar: 1.05, scaleHeightKm: 8.2, gravityMs2: 10.2, molarMass: 29,
    gases: { n2: 0.78, o2: 0.2, so2: 0.02 },
    aerosol: { name: 'Industrial coal smog', density: 0.8, g: 0.7, albedo: 0.85, angstrom: 1.2, tint: [0.75, 0.65, 0.5] },
    ozoneDU: 60, surfaceColor: '#6b6259', groundAlbedo: 0.2, horizonDiffuse: false,
  },
  {
    id: 'tukayyid', name: 'Tukayyid', group: 'BattleTech',
    blurb: 'Cool orange sun over broad prairie; crisp clear air before the storm season.',
    star: { name: 'Tukayyid', type: 'K2V', tempK: 4900, radiusSun: 0.8 },
    distanceAU: 0.7, pressureBar: 0.9, scaleHeightKm: 8.5, gravityMs2: 9.4, molarMass: 28.8,
    gases: { n2: 0.8, o2: 0.19, co2: 0.01 },
    aerosol: { name: 'Prairie pollen haze', density: 0.15, g: 0.65, albedo: 0.94, angstrom: 1.3, tint: [1, 0.95, 0.8] },
    ozoneDU: 210, surfaceColor: '#5f7048', groundAlbedo: 0.3, horizonDiffuse: false,
  },
  {
    id: 'outreach', name: 'Outreach', group: 'BattleTech',
    blurb: 'Mercenary capital: pale industrial noon, thin high cirrus of a working world.',
    star: { name: 'Outreach', type: 'G5V', tempK: 5600, radiusSun: 1.0 },
    distanceAU: 1.0, pressureBar: 1, scaleHeightKm: 8.4, gravityMs2: 9.9, molarMass: 29,
    gases: { n2: 0.78, o2: 0.21, co2: 0.01 },
    aerosol: { name: 'Urban-industrial haze', density: 0.25, g: 0.68, albedo: 0.9, angstrom: 1.2, tint: [0.9, 0.87, 0.8] },
    ozoneDU: 150, surfaceColor: '#6a6f66', groundAlbedo: 0.25, horizonDiffuse: false,
  },
  {
    id: 'luthien', name: 'Luthien', group: 'BattleTech',
    blurb: 'Black-dragon smog: acidic amber haze swallowing a watery sun.',
    star: { name: 'Luthien', type: 'K0V', tempK: 5200, radiusSun: 0.85 },
    distanceAU: 0.8, pressureBar: 1.3, scaleHeightKm: 8, gravityMs2: 10.5, molarMass: 29.5,
    gases: { n2: 0.75, o2: 0.18, so2: 0.05, co2: 0.02 },
    aerosol: { name: 'Acidic factory haze', density: 1.1, g: 0.72, albedo: 0.8, angstrom: 1.1, tint: [0.8, 0.7, 0.55] },
    ozoneDU: 30, surfaceColor: '#55524e', groundAlbedo: 0.15, horizonDiffuse: false,
  },
];

export const WORLD_GROUPS: WorldGroup[] = [
  'Solar System', 'Earth variants', 'Gas Giants', 'Moons & Dwarf', 'Exoplanets', 'Sci-Fi', 'BattleTech',
];


export interface CloudSpec {
  /** Vertical extinction optical depth at visible wavelengths; never a reflectance. */
  opticalDepth: number;
  centreKm: number;
  sigmaKm: number;
  singleScatteringAlbedo: number;
  g: number;
}
export interface Provenance {
  status: 'Observed world / assumed weather' | 'Hypothetical atmosphere' | 'Fictional scenario' | 'Custom scenario';
  epoch: string;
  sources: { label: string; url: string }[];
  assumptions: string;
}
export interface WorldSpec extends Omit<Preset, 'star'> {
  star: StarSpec;
  radiusKm: number;
  ozoneDU: number;
  aerosolHeightKm: number;
  clouds: CloudSpec;
  temperatureK: number;
  provenance: Provenance;
  /** Conservative one-Earth-mass habitable-zone limits for comparison presets. */
  habitableZone?: HabitableZone;
}

// Mean radii, except Saturn: equatorial reference radius for ring geometry.
const RADII: Record<string, number> = {
  earth:6371, mars:3389.5, venus:6051.8, mercury:2439.7, moon:1737.4,
  jupiter:69911, saturn:60268, uranus:25362, neptune:24622,
  titan:2574.76, triton:1353.4, pluto:1188.3,
  'proxima-b':7000, 'trappist-1e':5840, 'kepler-186f':7430, 'wasp-12b':128000,
};
const CLOUDS: Record<string, [number, number, number, number]> = {
  venus:[30,58,5,.999], jupiter:[4,12,5,.999], saturn:[3,25,10,.999],
  uranus:[2,12,5,.999], neptune:[2,10,4,.999], titan:[1,25,7,.99],
  'trappist-1e':[2,3,1,.999], 'wasp-12b':[1,200,80,.8],
  'lv426-pre':[8,7,2,.98], 'lv426-post':[12,4,1,.999],
  solaris:[2,3,1,.99], outreach:[1,7,1,.999], luthien:[4,4,1,.98],
};
const CATALOGUE: WorldSpec[] = PRESETS.map(p => {
  const base = p;
  const fictional = p.group === 'Sci-Fi' || p.group === 'BattleTech';
  const exoplanet = p.group === 'Exoplanets';
  const cloud = CLOUDS[p.id] ?? [0,3,1,.999];
  const luminosity = p.star.radiusSun ** 2 * (p.star.tempK / 5772) ** 4;
  return {
    ...base, star: {...p.star, luminosity}, radiusKm: RADII[p.id] ?? 6371,
    ozoneDU: p.ozoneDU,
    aerosolHeightKm: p.id === 'earth' ? 1.2 : p.id === 'pluto' ? 50 : p.id === 'titan' ? 40 : Math.max(1,p.scaleHeightKm*.55),
    clouds: {opticalDepth:cloud[0], centreKm:cloud[1], sigmaKm:cloud[2], singleScatteringAlbedo:cloud[3], g:.85},
    temperatureK: p.id === 'wasp-12b' ? 2500 : p.id === 'venus' ? 735 : p.scaleHeightKm*1000*p.molarMass/1000*p.gravityMs2/8.314462618,
    provenance: {
      status: fictional ? 'Fictional scenario' : exoplanet ? 'Hypothetical atmosphere' : 'Observed world / assumed weather',
      epoch: 'Catalogue reference values; not a live weather observation',
      sources: fictional ? [] : exoplanet
        ? [{label:'NASA Exoplanet Archive',url:'https://exoplanetarchive.ipac.caltech.edu/'}]
        : [{label:'JPL physical parameters',url:'https://ssd.jpl.nasa.gov/planets/phys_par.html'},
           {label:'JPL satellite parameters',url:'https://ssd.jpl.nasa.gov/sats/phys_par/'}],
      assumptions: (fictional ? 'All planetary and stellar parameters are authored assumptions. ' : exoplanet ? 'Atmosphere, weather, rotation, observer frame and surface are assumed. Stellar spectra are blackbodies. ' : '') +
        'Spherical exponential gas and haze profiles; prescribed cloud layer. Aerosol optical properties and surface reflectance are approximate. See model notes for accuracy limits.',
    },
  };
});

// Representative dwarf parameters from the Pecaut & Mamajek sequence.
const DWARF_SEQUENCE = 'https://raw.githubusercontent.com/emamajek/SpectralType/master/EEM_dwarf_UBVIJHK_colors_Teff.txt';
const HZ_SOURCE = 'https://arxiv.org/abs/1404.5292';
const EARTH = CATALOGUE.find(world => world.id === 'earth')!;
const EARTH_DWARFS: WorldSpec[] = [
  { id: 'earth-k-dwarf', name: 'Earth with K Dwarf', star: { name: 'Representative K dwarf', type: 'K5V', tempK: 4440, radiusSun: .701 } },
  { id: 'earth-m-dwarf', name: 'Earth with M Dwarf', star: { name: 'Representative M dwarf', type: 'M3V', tempK: 3430, radiusSun: .361 } },
  { id: 'earth-f-dwarf', name: 'Earth with F Dwarf', star: { name: 'Representative F dwarf', type: 'F5V', tempK: 6550, radiusSun: 1.473 } },
  { id: 'earth-a-dwarf', name: 'Earth with A Dwarf', star: { name: 'Representative A dwarf', type: 'A5V', tempK: 8100, radiusSun: 1.785 } },
].map(preset => {
  const luminosity = stellarLuminosity(preset.star);
  const star: StarSpec = { ...preset.star, spectrum: 'blackbody', luminosity };
  // Each comparison receives the same total stellar flux. The A star lies
  // outside the Kopparapu fit, so use the classical HZ fit calibrated through 10,000 K.
  const useExtendedFit = star.tempK > 7200;
  const distanceAU = Math.sqrt(luminosity / .8);
  return {
    ...EARTH, id: preset.id, name: preset.name, group: 'Earth variants', star, distanceAU,
    gases: { ...EARTH.gases },
    aerosol: { ...EARTH.aerosol, tint: [...EARTH.aerosol.tint] },
    clouds: { ...EARTH.clouds },
    blurb: `Earth's atmosphere under a ${star.type} dwarf, at 80% of Earth's stellar energy inside the modelled Goldilocks zone.`,
    habitableZone: conservativeHabitableZone(star, useExtendedFit ? 'ramirez2018' : 'kopparapu2014'),
    provenance: {
      status: 'Hypothetical atmosphere', epoch: 'Representative dwarf sequence, 2024.05.15',
      sources: [
        { label: 'Pecaut & Mamajek stellar sequence', url: DWARF_SEQUENCE },
        useExtendedFit
          ? { label: 'Ramirez classical habitable zones, Table 1', url: 'https://doi.org/10.3390/geosciences8080280' }
          : { label: 'Kopparapu et al. habitable zones', url: HZ_SOURCE },
      ],
      assumptions: 'An Earth comparison scenario with unchanged radius, gravity, pressure, composition, ozone, haze, surface and prescribed temperature. The representative dwarf uses a blackbody spectrum. Distance is chosen for 0.8 Earth bolometric irradiance, within the conservative one-Earth-mass runaway/maximum-greenhouse limits. Climate, photochemistry, stellar activity and tidal locking are not solved; habitable-zone placement does not establish actual habitability. Observer rotation and sky frame are assumed, with no Solar System ephemeris or inherited Moon.',
    },
  };
});

// Keep the comparison worlds next to Earth in editors and in the world picker.
export const WORLDS: WorldSpec[] = [EARTH, ...EARTH_DWARFS, ...CATALOGUE.filter(world => world.id !== EARTH.id)];
