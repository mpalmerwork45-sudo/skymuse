/**
 * CPU-side three-channel atmospheric approximation (not a spectral solver).
 *
 * Supplies the shader's optical depths, stellar flux, direct beam and twilight
 * factor. Scalar illuminance and RGB sky radiance are separate approximations;
 * lux is not a photometric integral of the rendered sky.
 */
import type { WorldSpec } from './worlds';

/** Representative wavelengths (nm), used as a coarse RGB proxy. */
export const WAVELENGTHS = [680, 550, 440] as const;

export interface ChannelSet {
  r: number;
  g: number;
  b: number;
}

/** Rayleigh cross-section relative to N2 at 550 nm (CO2 ~= 2.3x N2). */
const RAYLEIGH_XSEC: Record<string, number> = {
  n2: 1.0, o2: 0.9, ar: 0.85, co2: 2.3, h2: 0.18,
  he: 0.035, ch4: 1.6, h2o: 0.65, so2: 3.2,
};

/** Earth zenith Rayleigh optical depth at 550 nm. Everything scales from here. */
const EARTH_TAU_R_550 = 0.099;

const DEG = Math.PI / 180;

export interface SkyOptions {
  sunElevDeg: number;
  sunAzDeg: number;
  /** Multiplier on the world's baseline aerosol density (slider). */
  aerosolScale: number;
  /** Master switch for molecular absorption (CH4 + O3). */
  absorptionOn: boolean;
  /** Heuristic brightness adaptation vs fixed camera exposure. */
  eyeAdapted: boolean;
  /** Linear user exposure multiplier (not stops). */
  exposure: number;
}

export interface SkyState extends SkyOptions {
  /** Shared near-horizon path proxy, including the horizon below sunset. */
  sunPath: number;
  /** Empirical twilight attenuation, applied once to scattered solar light. */
  twilightLight: number;
  /** Direct beam RGB: stellar colour times Beer–Lambert transmission, once. */
  sunBeam: [number, number, number];
  tauR: ChannelSet;
  tauM: ChannelSet;
  tauA: ChannelSet;
  tauT: ChannelSet;
  /** Column air-mass factor relative to Earth (pressure/mass/gravity/chemistry). */
  columnFactor: number;
  /** Top-of-atmosphere stellar flux, W/m^2. */
  fluxWm2: number;
  /** Stellar flux relative to Earth's solar constant. */
  fluxRel: number;
  /** Approx horizontal illuminance in lux (direct + diffuse, twilight-aware). */
  lux: number;
  /**
   * Low-sun diffuse factor 0..1: skylight fades as the sun sinks because the
   * whole diffuse field is fed through longer atmospheric paths. 1 when the
   * sun is high (also passed to the shader as uDiffuseLight).
   */
  diffuseLight: number;
  /** Approximate diffuse surface flux relative to Earth's solar constant. */
  downwell: number;
  /** Retinal adaptation gain applied when eyeAdapted (1 for fixed camera). */
  adaptGain: number;
  /** Final exposure = user exposure x adaptation gain. */
  exposureFinal: number;
  /** Attenuated direct-sun tint (linear RGB, normalized). */
  sunTint: [number, number, number];
  /** Star color (linear RGB, normalized). */
  starColor: [number, number, number];
  /** Apparent stellar angular diameter, degrees. */
  starAngularDeg: number;
  /** 0 in daylight, 1 by -12 degrees — drives the illustrative starfield. */
  nightFactor: number;
  /** Multi-scattering saturation value S(tau) at 550 nm (diagnostic). */
  saturation550: number;
}

/**
 * Kasten–Young (1989), for apparent elevation 0..90 degrees.
 * Below the horizon we retain the horizon path as a twilight proxy; the
 * formula itself is not valid there. This Earth fit is approximate elsewhere.
 */
export function airMass(elevDeg: number): number {
  const e = Math.max(0, Math.min(90, elevDeg));
  const sinE = Math.sin(e * DEG);
  const m = 1 / (sinE + 0.50572 * Math.pow(e + 6.07995, -1.6364));
  return Math.min(m, 38);
}

function chan(r: number, g: number, b: number): ChannelSet {
  return { r, g, b };
}

/** Approximate blackbody color -> linear RGB, normalized to max 1. */
export function kelvinToLinear(tempK: number): [number, number, number] {
  const t = Math.max(1000, Math.min(12000, tempK)) / 100;
  let r: number, g: number, b: number;
  r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
  g = t <= 66
    ? 99.4708025861 * Math.log(t) - 161.1195681661
    : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  const cl = (x: number) => Math.max(0, Math.min(255, x)) / 255;
  const srgb: [number, number, number] = [cl(r), cl(g), cl(b)];
  // sRGB -> linear
  const lin = srgb.map((c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  const m = Math.max(lin[0], lin[1], lin[2], 1e-6);
  return [lin[0] / m, lin[1] / m, lin[2] / m];
}

/** Mixing-weighted Rayleigh cross-section relative to N2. */
function weightedXsec(world: WorldSpec): number {
  const gases = world.gases as Record<string, number | undefined>;
  let num = 0;
  let den = 0;
  for (const [gas, x] of Object.entries(RAYLEIGH_XSEC)) {
    const mix = gases[gas] ?? 0;
    num += mix * x;
    den += mix;
  }
  if (den <= 0) return 0;
  return num / den;
}

export function columnFactor(world: WorldSpec): number {
  if (world.pressureBar <= 0) return 0;
  const pressure = world.pressureBar / 1.01325;
  const molecules = 28.97 / world.molarMass;
  const gravity = 9.81 / world.gravityMs2;
  // EARTH_TAU_R_550 already describes air, rather than pure nitrogen.
  const earthAirXsec = 0.78 + 0.21 * RAYLEIGH_XSEC.o2 + 0.01 * RAYLEIGH_XSEC.ar;
  return pressure * molecules * gravity * weightedXsec(world) / earthAirXsec;
}

export function rayleighOD(world: WorldSpec): ChannelSet {
  const col = columnFactor(world);
  const t550 = EARTH_TAU_R_550 * col;
  const s = (wl: number) => t550 * Math.pow(550 / wl, 4);
  return chan(s(680), s(550), s(440));
}

export function mieOD(world: WorldSpec, aerosolScale: number): ChannelSet {
  const t550 = world.aerosol.density * aerosolScale;
  const a = world.aerosol.angstrom;
  const s = (wl: number) => t550 * Math.pow(550 / wl, a);
  return chan(s(680), s(550), s(440));
}

/**
 * Phenomenological CH4/O3 RGB absorption strengths retained from the presets.
 * These are colour controls, not measured spectral cross-sections or gas
 * columns; exact methane/ozone colours require a spectral absorption model.
 */
export function absorptionOD(world: WorldSpec, on: boolean): ChannelSet {
  if (!on) return chan(0, 0, 0);
  const c = world.ch4;
  const o = world.o3;
  return chan(2.4 * c + 0.12 * o, 0.38 * c + 0.1 * o, 0.05 * c + 0.015 * o);
}

/** Asymptotic multi-scattering saturation S(tau) = tau / (1 + c*tau). */
export function saturation(tau: number, c = 0.55): number {
  return tau / (1 + c * tau);
}

function normalize(v: [number, number, number]): [number, number, number] {
  const m = Math.max(v[0], v[1], v[2], 1e-9);
  return [v[0] / m, v[1] / m, v[2] / m];
}

export function computeSky(world: WorldSpec, opts: SkyOptions): SkyState {
  const tauR = rayleighOD(world);
  const tauM = mieOD(world, opts.aerosolScale);
  const tauA = absorptionOD(world, opts.absorptionOn);
  const tauT = chan(tauR.r + tauM.r + tauA.r, tauR.g + tauM.g + tauA.g, tauR.b + tauM.b + tauA.b);

  const fluxWm2 = (1361 * world.star.luminosity) / (world.distanceAU * world.distanceAU);
  const fluxRel = fluxWm2 / 1361;

  const mSun = airMass(opts.sunElevDeg);
  // Empirical Earth-like twilight, not a geometric planetary shadow model.
  const twilightLight = Math.exp(-Math.max(-opts.sunElevDeg, 0) / 1.2);
  // Low-sun diffuse fade: near the horizon the diffuse field is fed through
  // much longer paths, so skylight drops even before sunset.
  const diffuseLight = Math.exp(-Math.max(mSun - 1, 0) * 0.11);
  const tDir = Math.exp(-tauT.g * mSun);
  const tauScatG = tauR.g + tauM.g * world.aerosol.albedo * world.aerosol.tint[1];
  const scatterFraction = tauScatG / Math.max(tauT.g, 1e-9);
  // A diffuse source must vanish in vacuum and for purely absorbing material.
  const intercepted = (1 - Math.exp(-tauT.g * 1.8)) * scatterFraction;
  // Deep-diffusion: multiple scattering still delivers light to the surface
  // of optically thick atmospheres long after the direct beam is gone.
  const deep = (1 - world.cloudAlbedo) * intercepted / (1 + tauT.g * 0.4);
  const sunElevation = Math.max(Math.sin(opts.sunElevDeg * DEG), 0);
  const directHorizontal = tDir * sunElevation * Math.exp(-world.cloudAlbedo * 3);
  const diffuse = (0.35 * intercepted * Math.exp(-tauT.g * 1.8) + 0.3 * deep)
    * diffuseLight * twilightLight;
  // Global horizontal illuminance: direct beam + diffuse skylight, twilight-aware.
  const lux = Math.max(
    133000 * fluxRel * (directHorizontal + diffuse),
    0,
  );
  const downwell = fluxRel * diffuse;

  // Heuristic power-law brightness adaptation with bounded gain.
  const adaptGain = opts.eyeAdapted
    ? Math.max(0.03, Math.min(60, Math.pow(20000 / Math.max(lux, 1e-4), 0.72)))
    : 1;
  // Fixed-camera exposure must remain fixed through sunset. Twilight belongs
  // in the incoming light, not in a second, hidden exposure adjustment.
  const nightFactor = Math.max(0, Math.min(1, -opts.sunElevDeg / 12));
  const exposureFinal = opts.exposure * adaptGain;

  // Direct-sun tint after one sun-path attenuation (for sun disc + terrain sun).
  const trans = (tau: number) => Math.exp(-tau * mSun);
  const starColor = kelvinToLinear(world.star.tempK);
  // Smooth fictional sodium styling, with no colour jump at 15 degrees.
  const sodium = world.sodiumSunset ? Math.max(0, Math.min(1, (15 - opts.sunElevDeg) / 15)) : 0;
  const sunBeam: [number, number, number] = [
    trans(tauT.r) * starColor[0],
    trans(tauT.g) * starColor[1] * (1 - 0.28 * sodium),
    trans(tauT.b) * starColor[2] * (1 - 0.65 * sodium),
  ];
  const sunTint = normalize(sunBeam);

  // Angular diameter of a sphere at centre distance d: 2*asin(R_star / d).
  const starDistKm = world.distanceAU * 1.496e8;
  const starRadKm = world.star.radiusSun * 696000;
  const starAngularDeg = (2 * Math.asin(Math.min(1, starRadKm / starDistKm))) / DEG;

  return {
    ...opts,
    sunPath: mSun, twilightLight, sunBeam,
    tauR, tauM, tauA, tauT,
    columnFactor: columnFactor(world),
    fluxWm2, fluxRel, lux, downwell, diffuseLight, adaptGain, exposureFinal,
    sunTint, starColor, starAngularDeg, nightFactor,
    saturation550: saturation(tauScatG),
  };
}
