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

export type WorldGroup =
  | 'Solar System'
  | 'Gas Giants'
  | 'Moons & Dwarf'
  | 'Exoplanets'
  | 'Sci-Fi'
  | 'BattleTech';

export interface StarSpec {
  /** Display name, e.g. "Sol", "Proxima Centauri" */
  name: string;
  /** Spectral class label */
  type: string;
  /** Bolometric luminosity in units of L_sun */
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

export interface MoonSpec {
  name: string;
  /** Azimuth degrees (0=N, 90=E) */
  azDeg: number;
  /** Elevation degrees */
  elevDeg: number;
  /** Apparent size multiplier (1 ~= Earth's Moon from Earth) */
  size: number;
  color: string;
}

export interface WorldSpec {
  id: string;
  name: string;
  group: WorldGroup;
  blurb: string;
  star: StarSpec;
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
  /** Methane red-band absorption strength (Uranus/Neptune ~= 2-3) */
  ch4: number;
  /** Ozone Chappuis-band strength (Earth = 1) */
  o3: number;
  /** Top-of-atmosphere cloud-deck reflectance 0..1 (Venus ~= 0.8) */
  cloudAlbedo: number;
  /** Ground / cloud-deck color (hex) */
  surfaceColor: string;
  /** Ground Bond-ish albedo 0..1 */
  groundAlbedo: number;
  /** True for gas-giant cloud decks: horizon blends diffusely instead of a crisp edge */
  horizonDiffuse: boolean;
  /** Sodium-tinted sunsets (Arrakis) */
  sodiumSunset?: boolean;
  rings?: boolean;
  moons?: MoonSpec[];
}

const SOL: StarSpec = { name: 'Sol', type: 'G2V', luminosity: 1, tempK: 5778, radiusSun: 1 };

export const WORLDS: WorldSpec[] = [
  // ---------------- Solar System ----------------
  {
    id: 'earth', name: 'Earth', group: 'Solar System',
    blurb: 'Nitrogen–oxygen air. Blue Rayleigh dome by day, ozone-warmed twilight.',
    star: SOL, distanceAU: 1, pressureBar: 1.013, scaleHeightKm: 8.4, gravityMs2: 9.81, molarMass: 28.97,
    gases: { n2: 0.78, o2: 0.21, ar: 0.01 },
    aerosol: { name: 'Background sulfate + water', density: 0.06, g: 0.65, albedo: 0.95, angstrom: 1.3, tint: [1, 0.98, 0.95] },
    ch4: 0, o3: 1, cloudAlbedo: 0, surfaceColor: '#55603f', groundAlbedo: 0.3, horizonDiffuse: false,
    moons: [{ name: 'Moon', azDeg: 250, elevDeg: 22, size: 1, color: '#cfcfcf' }],
  },
  {
    id: 'mars', name: 'Mars', group: 'Solar System',
    blurb: 'Butterscotch dust-scattered day; blue-rayleigh sunset glow around the sun.',
    star: SOL, distanceAU: 1.524, pressureBar: 0.006, scaleHeightKm: 11.1, gravityMs2: 3.71, molarMass: 43.34,
    gases: { co2: 0.95, n2: 0.027, ar: 0.016 },
    aerosol: { name: 'Iron-oxide dust', density: 0.5, g: 0.7, albedo: 0.86, angstrom: 1.2, tint: [1, 0.6, 0.36] },
    ch4: 0, o3: 0, cloudAlbedo: 0, surfaceColor: '#a05c38', groundAlbedo: 0.25, horizonDiffuse: false,
  },
  {
    id: 'venus', name: 'Venus', group: 'Solar System',
    blurb: '92-bar CO2 furnace under a sulfuric-acid cloud deck: dim sulfur-amber gloom, as the Venera landers saw.',
    star: SOL, distanceAU: 0.723, pressureBar: 92, scaleHeightKm: 15.9, gravityMs2: 8.87, molarMass: 43.45,
    gases: { co2: 0.965, n2: 0.035 },
    aerosol: { name: 'Sulfuric-acid droplets', density: 2.5, g: 0.75, albedo: 0.99, angstrom: 0.8, tint: [1, 0.84, 0.58] },
    ch4: 0, o3: 0, cloudAlbedo: 0.8, surfaceColor: '#7d6242', groundAlbedo: 0.1, horizonDiffuse: true,
  },
  {
    id: 'mercury', name: 'Mercury', group: 'Solar System',
    blurb: 'Airless: black noon sky, blazing white sun, gray regolith to a razor horizon.',
    star: SOL, distanceAU: 0.387, pressureBar: 0, scaleHeightKm: 0, gravityMs2: 3.7, molarMass: 29,
    gases: {},
    aerosol: { name: 'None (exosphere)', density: 0, g: 0, albedo: 1, angstrom: 1, tint: [1, 1, 1] },
    ch4: 0, o3: 0, cloudAlbedo: 0, surfaceColor: '#8a8883', groundAlbedo: 0.12, horizonDiffuse: false,
  },
  {
    id: 'moon', name: 'Moon', group: 'Solar System',
    blurb: 'Airless highlands: pitch-black sky at noon, hard shadows, Earth hanging overhead.',
    star: SOL, distanceAU: 1, pressureBar: 0, scaleHeightKm: 0, gravityMs2: 1.62, molarMass: 29,
    gases: {},
    aerosol: { name: 'None (exosphere)', density: 0, g: 0, albedo: 1, angstrom: 1, tint: [1, 1, 1] },
    ch4: 0, o3: 0, cloudAlbedo: 0, surfaceColor: '#9a9a98', groundAlbedo: 0.12, horizonDiffuse: false,
  },
  // ---------------- Gas giants (1-bar level) ----------------
  {
    id: 'jupiter', name: 'Jupiter', group: 'Gas Giants',
    blurb: 'Floating at the 1-bar deck: ammonia haze over salmon belts, dimmed distant sun.',
    star: SOL, distanceAU: 5.2, pressureBar: 1, scaleHeightKm: 27, gravityMs2: 24.79, molarMass: 2.2,
    gases: { h2: 0.9, he: 0.1 },
    aerosol: { name: 'Ammonia haze', density: 0.35, g: 0.7, albedo: 0.98, angstrom: 1, tint: [0.98, 0.9, 0.78] },
    ch4: 0.25, o3: 0, cloudAlbedo: 0.35, surfaceColor: '#c2a67e', groundAlbedo: 0.4, horizonDiffuse: true,
    moons: [
      { name: 'Io', azDeg: 130, elevDeg: 14, size: 1.2, color: '#e8d878' },
      { name: 'Europa', azDeg: 215, elevDeg: 26, size: 1.0, color: '#d8cfc0' },
    ],
  },
  {
    id: 'saturn', name: 'Saturn', group: 'Gas Giants',
    blurb: 'Pale-gold 1-bar haze beneath the grand ring arch, with Titan and Rhea in attendance.',
    star: SOL, distanceAU: 9.58, pressureBar: 1, scaleHeightKm: 59.5, gravityMs2: 10.44, molarMass: 2.07,
    gases: { h2: 0.96, he: 0.03, ch4: 0.005 },
    aerosol: { name: 'Ammonia / phosphine haze', density: 0.3, g: 0.7, albedo: 0.98, angstrom: 1, tint: [1, 0.93, 0.78] },
    ch4: 0.35, o3: 0, cloudAlbedo: 0.3, surfaceColor: '#d3bf96', groundAlbedo: 0.4, horizonDiffuse: true,
    rings: true,
    moons: [
      { name: 'Titan', azDeg: 140, elevDeg: 17, size: 1.5, color: '#d8a84e' },
      { name: 'Rhea', azDeg: 208, elevDeg: 31, size: 0.9, color: '#cfcfcf' },
    ],
  },
  {
    id: 'uranus', name: 'Uranus', group: 'Gas Giants',
    blurb: 'Methane-scrubbed red light leaves a clear robin-egg cyan dome.',
    star: SOL, distanceAU: 19.2, pressureBar: 1, scaleHeightKm: 27.7, gravityMs2: 8.87, molarMass: 2.3,
    gases: { h2: 0.83, he: 0.15, ch4: 0.02 },
    aerosol: { name: 'Thin methane haze', density: 0.12, g: 0.65, albedo: 0.97, angstrom: 1.1, tint: [0.9, 0.98, 1] },
    ch4: 2.2, o3: 0, cloudAlbedo: 0.25, surfaceColor: '#8fd8d4', groundAlbedo: 0.35, horizonDiffuse: true,
  },
  {
    id: 'neptune', name: 'Neptune', group: 'Gas Giants',
    blurb: 'Deepest methane absorption: vivid azure skies over a cobalt deck.',
    star: SOL, distanceAU: 30.07, pressureBar: 1, scaleHeightKm: 19, gravityMs2: 11.15, molarMass: 2.3,
    gases: { h2: 0.8, he: 0.19, ch4: 0.01 },
    aerosol: { name: 'Hydrocarbon haze', density: 0.18, g: 0.68, albedo: 0.96, angstrom: 1.1, tint: [0.85, 0.92, 1] },
    ch4: 3.0, o3: 0, cloudAlbedo: 0.25, surfaceColor: '#4d6fc4', groundAlbedo: 0.35, horizonDiffuse: true,
  },
  // ---------------- Moons & dwarf ----------------
  {
    id: 'titan', name: 'Titan', group: 'Moons & Dwarf',
    blurb: 'Deep-orange organic tholin smog; noon is a burnt-ember twilight.',
    star: SOL, distanceAU: 9.58, pressureBar: 1.45, scaleHeightKm: 21, gravityMs2: 1.35, molarMass: 27.3,
    gases: { n2: 0.95, ch4: 0.05 },
    aerosol: { name: 'Organic tholin smog', density: 2.2, g: 0.72, albedo: 0.9, angstrom: 1.6, tint: [1, 0.48, 0.14] },
    ch4: 0.6, o3: 0, cloudAlbedo: 0.2, surfaceColor: '#6b4a2e', groundAlbedo: 0.2, horizonDiffuse: false,
  },
  {
    id: 'triton', name: 'Triton', group: 'Moons & Dwarf',
    blurb: 'A whisper of nitrogen over pink cantaloupe ice; near-black sky, hard sun.',
    star: SOL, distanceAU: 30.07, pressureBar: 0.000014, scaleHeightKm: 14, gravityMs2: 0.78, molarMass: 28,
    gases: { n2: 1 },
    aerosol: { name: 'Trace nitrogen haze', density: 0.02, g: 0.6, albedo: 0.95, angstrom: 1.2, tint: [0.95, 0.97, 1] },
    ch4: 0, o3: 0, cloudAlbedo: 0, surfaceColor: '#d3c2bc', groundAlbedo: 0.6, horizonDiffuse: false,
  },
  {
    id: 'pluto', name: 'Pluto', group: 'Moons & Dwarf',
    blurb: '"Pluto time" all day: perpetual honey-twilight under a blue detached haze.',
    star: SOL, distanceAU: 39.5, pressureBar: 0.00001, scaleHeightKm: 20, gravityMs2: 0.62, molarMass: 28,
    gases: { n2: 0.99, ch4: 0.005 },
    aerosol: { name: 'Blue detached haze', density: 0.08, g: 0.6, albedo: 0.95, angstrom: 1.4, tint: [0.6, 0.75, 1] },
    ch4: 0.3, o3: 0, cloudAlbedo: 0, surfaceColor: '#b09d8c', groundAlbedo: 0.4, horizonDiffuse: false,
  },
  // ---------------- Exoplanets ----------------
  {
    id: 'proxima-b', name: 'Proxima Centauri b', group: 'Exoplanets',
    blurb: 'A small ember-red sun that never seems to set, over a temperate rocky world.',
    star: { name: 'Proxima Centauri', type: 'M5.5V', luminosity: 0.0017, tempK: 3042, radiusSun: 0.154 },
    distanceAU: 0.0485, pressureBar: 1, scaleHeightKm: 8, gravityMs2: 10.9, molarMass: 29,
    gases: { n2: 0.8, o2: 0.15, co2: 0.05 },
    aerosol: { name: 'Thin water haze', density: 0.08, g: 0.65, albedo: 0.95, angstrom: 1.3, tint: [1, 0.9, 0.8] },
    ch4: 0, o3: 0.6, cloudAlbedo: 0, surfaceColor: '#4a5a52', groundAlbedo: 0.25, horizonDiffuse: false,
  },
  {
    id: 'trappist-1e', name: 'TRAPPIST-1e', group: 'Exoplanets',
    blurb: 'Deep-crimson dwarf light on a likely ocean world; salmon-pink daylight.',
    star: { name: 'TRAPPIST-1', type: 'M8V', luminosity: 0.000553, tempK: 2566, radiusSun: 0.119 },
    distanceAU: 0.028, pressureBar: 1, scaleHeightKm: 8.2, gravityMs2: 9.0, molarMass: 29,
    gases: { n2: 0.85, co2: 0.1, h2o: 0.05 },
    aerosol: { name: 'Humid haze', density: 0.12, g: 0.65, albedo: 0.94, angstrom: 1.2, tint: [1, 0.85, 0.72] },
    ch4: 0.1, o3: 0.3, cloudAlbedo: 0.1, surfaceColor: '#3f5a5c', groundAlbedo: 0.2, horizonDiffuse: false,
  },
  {
    id: 'kepler-186f', name: 'Kepler-186f', group: 'Exoplanets',
    blurb: 'Earth-cousin under an orange dwarf: soft amber noon, violet dusk.',
    star: { name: 'Kepler-186', type: 'M1V', luminosity: 0.041, tempK: 3788, radiusSun: 0.52 },
    distanceAU: 0.432, pressureBar: 1.2, scaleHeightKm: 8.6, gravityMs2: 9.2, molarMass: 28.5,
    gases: { n2: 0.8, o2: 0.18, co2: 0.02 },
    aerosol: { name: 'Light continental haze', density: 0.1, g: 0.65, albedo: 0.95, angstrom: 1.3, tint: [1, 0.95, 0.85] },
    ch4: 0, o3: 0.8, cloudAlbedo: 0, surfaceColor: '#4f6b46', groundAlbedo: 0.3, horizonDiffuse: false,
  },
  {
    id: 'wasp-12b', name: 'WASP-12b (hot Jupiter)', group: 'Exoplanets',
    blurb: 'Skimming a white-hot star that fills a third of the sky; silicate haze aglow.',
    star: { name: 'WASP-12', type: 'G0V', luminosity: 1.6, tempK: 6300, radiusSun: 1.57 },
    distanceAU: 0.0229, pressureBar: 1, scaleHeightKm: 300, gravityMs2: 11.3, molarMass: 2.3,
    gases: { h2: 0.9, he: 0.1 },
    aerosol: { name: 'Absorbing silicate haze', density: 0.5, g: 0.7, albedo: 0.6, angstrom: 0.7, tint: [0.9, 0.85, 0.8] },
    ch4: 0, o3: 0, cloudAlbedo: 0.1, surfaceColor: '#3a3a44', groundAlbedo: 0.15, horizonDiffuse: true,
  },
  // ---------------- Sci-fi ----------------
  {
    id: 'lv426-pre', name: 'LV-426 — Pre-Terraforming', group: 'Sci-Fi',
    blurb: 'Primordial nitrogen–methane superstorm: bruised violet murk, ammonia lightning skies.',
    star: { name: 'Zeta Reticuli', type: 'G2V', luminosity: 0.9, tempK: 5700, radiusSun: 0.95 },
    distanceAU: 1.2, pressureBar: 4, scaleHeightKm: 12, gravityMs2: 8.5, molarMass: 27,
    gases: { n2: 0.8, ch4: 0.18, co2: 0.02 },
    aerosol: { name: 'Storm-lofted silicate dust', density: 1.6, g: 0.8, albedo: 0.8, angstrom: 1, tint: [0.72, 0.6, 0.52] },
    ch4: 1.2, o3: 0, cloudAlbedo: 0.4, surfaceColor: '#3d3a36', groundAlbedo: 0.12, horizonDiffuse: false,
  },
  {
    id: 'lv426-post', name: 'LV-426 — Post-Terraforming', group: 'Sci-Fi',
    blurb: 'Atmospheric processors done: breathable, overcast, drizzle-gray dawn over basalt.',
    star: { name: 'Zeta Reticuli', type: 'G2V', luminosity: 0.9, tempK: 5700, radiusSun: 0.95 },
    distanceAU: 1.2, pressureBar: 1, scaleHeightKm: 9, gravityMs2: 8.5, molarMass: 29,
    gases: { n2: 0.78, o2: 0.21, h2o: 0.01 },
    aerosol: { name: 'Processor water overcast', density: 0.7, g: 0.75, albedo: 0.97, angstrom: 1, tint: [0.85, 0.87, 0.9] },
    ch4: 0, o3: 0.4, cloudAlbedo: 0.55, surfaceColor: '#5c6b52', groundAlbedo: 0.25, horizonDiffuse: false,
  },
  {
    id: 'arrakis', name: 'Arrakis (Dune)', group: 'Sci-Fi',
    blurb: 'Canary-yellow day under a white Canopus; sodium sunsets and Coriolis dust.',
    star: { name: 'Canopus', type: 'F0II', luminosity: 2.5, tempK: 6500, radiusSun: 1.5 },
    distanceAU: 1.4, pressureBar: 1.1, scaleHeightKm: 9, gravityMs2: 9.86, molarMass: 29,
    gases: { n2: 0.9, o2: 0.08, co2: 0.02 },
    aerosol: { name: 'Coriolis spice-dust', density: 0.9, g: 0.75, albedo: 0.88, angstrom: 1.1, tint: [1, 0.8, 0.42] },
    ch4: 0, o3: 0.2, cloudAlbedo: 0, surfaceColor: '#d9a84e', groundAlbedo: 0.35, horizonDiffuse: false,
    sodiumSunset: true,
  },
  // ---------------- BattleTech ----------------
  {
    id: 'solaris', name: 'Solaris VII', group: 'BattleTech',
    blurb: 'Game-world smog: arena floodlights under a brown-coal noon haze.',
    star: { name: 'Solaris', type: 'G8V', luminosity: 0.7, tempK: 5400, radiusSun: 0.9 },
    distanceAU: 0.95, pressureBar: 1.05, scaleHeightKm: 8.2, gravityMs2: 10.2, molarMass: 29,
    gases: { n2: 0.78, o2: 0.2, so2: 0.02 },
    aerosol: { name: 'Industrial coal smog', density: 0.8, g: 0.7, albedo: 0.85, angstrom: 1.2, tint: [0.75, 0.65, 0.5] },
    ch4: 0, o3: 0.2, cloudAlbedo: 0.15, surfaceColor: '#6b6259', groundAlbedo: 0.2, horizonDiffuse: false,
  },
  {
    id: 'tukayyid', name: 'Tukayyid', group: 'BattleTech',
    blurb: 'Cool orange sun over broad prairie; crisp clear air before the storm season.',
    star: { name: 'Tukayyid', type: 'K2V', luminosity: 0.35, tempK: 4900, radiusSun: 0.8 },
    distanceAU: 0.7, pressureBar: 0.9, scaleHeightKm: 8.5, gravityMs2: 9.4, molarMass: 28.8,
    gases: { n2: 0.8, o2: 0.19, co2: 0.01 },
    aerosol: { name: 'Prairie pollen haze', density: 0.15, g: 0.65, albedo: 0.94, angstrom: 1.3, tint: [1, 0.95, 0.8] },
    ch4: 0, o3: 0.7, cloudAlbedo: 0, surfaceColor: '#5f7048', groundAlbedo: 0.3, horizonDiffuse: false,
  },
  {
    id: 'outreach', name: 'Outreach', group: 'BattleTech',
    blurb: 'Mercenary capital: pale industrial noon, thin high cirrus of a working world.',
    star: { name: 'Outreach', type: 'G5V', luminosity: 1.0, tempK: 5600, radiusSun: 1.0 },
    distanceAU: 1.0, pressureBar: 1, scaleHeightKm: 8.4, gravityMs2: 9.9, molarMass: 29,
    gases: { n2: 0.78, o2: 0.21, co2: 0.01 },
    aerosol: { name: 'Urban-industrial haze', density: 0.25, g: 0.68, albedo: 0.9, angstrom: 1.2, tint: [0.9, 0.87, 0.8] },
    ch4: 0, o3: 0.5, cloudAlbedo: 0.1, surfaceColor: '#6a6f66', groundAlbedo: 0.25, horizonDiffuse: false,
  },
  {
    id: 'luthien', name: 'Luthien', group: 'BattleTech',
    blurb: 'Black-dragon smog: acidic amber haze swallowing a watery sun.',
    star: { name: 'Luthien', type: 'K0V', luminosity: 0.5, tempK: 5200, radiusSun: 0.85 },
    distanceAU: 0.8, pressureBar: 1.3, scaleHeightKm: 8, gravityMs2: 10.5, molarMass: 29.5,
    gases: { n2: 0.75, o2: 0.18, so2: 0.05, co2: 0.02 },
    aerosol: { name: 'Acidic factory haze', density: 1.1, g: 0.72, albedo: 0.8, angstrom: 1.1, tint: [0.8, 0.7, 0.55] },
    ch4: 0, o3: 0.1, cloudAlbedo: 0.3, surfaceColor: '#55524e', groundAlbedo: 0.15, horizonDiffuse: false,
  },
];

export const WORLD_GROUPS: WorldGroup[] = [
  'Solar System', 'Gas Giants', 'Moons & Dwarf', 'Exoplanets', 'Sci-Fi', 'BattleTech',
];
