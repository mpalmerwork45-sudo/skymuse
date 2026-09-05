/**
 * CPU-side atmospheric radiative transfer.
 *
 * Mirrors the GLSL skydome model so the telemetry deck shows the same numbers
 * that drive the pixels: wavelength-dependent optical depth at 680/550/440 nm,
 * Rayleigh 1/lambda^4 scattering scaled by gas polarizability, Henyey-Greenstein
 * Mie aerosols, CH4/O3 absorption, multi-scattering saturation, cloud-deck
 * albedo dimming, stellar flux falloff, and human retinal adaptation gain.
 */
import type { WorldSpec } from './worlds';

/** Standard RGB wavelengths (nm): red, green, blue. */
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
  /** Human-eye logarithmic adaptation vs fixed camera sensor. */
  eyeAdapted: boolean;
  /** User exposure control (stops-ish multiplier). */
  exposure: number;
}

export interface SkyState extends SkyOptions {
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
  /**
   * Diffuse downwelling flux at the surface, relative to Earth's solar
   * constant. Eddington-style: direct beam plus a diffusion term that keeps
   * carrying light down through optically thick atmospheres (Venus gloom).
   */
  downwell: number;
  /** Retinal adaptation gain applied when eyeAdapted (1 for fixed camera). */
  adaptGain: number;
  /** Final exposure = user exposure x adaptation gain. */
  exposureFinal: number;
  /** Diffuse skylight tint for terrain ambient (linear RGB, normalized). */
  groundSkyTint: [number, number, number];
  /** Attenuated direct-sun tint (linear RGB, normalized). */
  sunTint: [number, number, number];
  /** Star color (linear RGB, normalized). */
  starColor: [number, number, number];
  /** Apparent stellar angular diameter, degrees. */
  starAngularDeg: number;
  /** 0 in daylight, 1 in deep night — drives starfield + terrain darkness. */
  nightFactor: number;
  /** Multi-scattering saturation value S(tau) at 550 nm (diagnostic). */
  saturation550: number;
}

/** Kasten-Young airmass, clamped. Handles sun below horizon via clamp. */
export function airMass(elevDeg: number): number {
  const e = Math.max(elevDeg, -3);
  const sinE = Math.sin(Math.max(e, 0.5) * DEG);
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
  return pressure * molecules * gravity * weightedXsec(world);
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
 * CH4 eats red; O3 Chappuis bands eat orange/green (peaking mid-visible,
 * weak at both ends — R must stay below B's total slope or long-path light
 * would invert and kill red sunsets).
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

  const mSun = airMass(Math.max(opts.sunElevDeg, 1));
  // Twilight falloff: once the sun drops past the horizon, the whole sky
  // (beam and diffuse alike) fades fast — ~40 lux at -6°, starlight by -12°.
  const twilightDim = Math.exp(-Math.max(-opts.sunElevDeg, 0) / 0.8);
  // Low-sun diffuse fade: near the horizon the diffuse field is fed through
  // much longer paths, so skylight drops even before sunset.
  const diffuseLight = Math.exp(-Math.max(mSun - 1, 0) * 0.11);
  const tDir = Math.exp(-tauT.g * mSun);
  const tDiff = Math.exp(-tauT.g * 1.8);
  // Deep-diffusion: multiple scattering still delivers light to the surface
  // of optically thick atmospheres long after the direct beam is gone.
  const deep = (1 - world.cloudAlbedo) / (1 + tauT.g * 0.4);
  // Global horizontal illuminance: direct beam + diffuse skylight, twilight-aware.
  const lux = Math.max(
    133000 * fluxRel * (0.6 * tDir + (0.35 * tDiff + 0.3 * deep) * diffuseLight) * twilightDim,
    1e-4,
  );
  // Diffuse downwelling flux (relative): direct beam + Eddington diffusion.
  const downwell = Math.max(
    fluxRel *
      (0.55 * tDir + ((0.45 * (1 - world.cloudAlbedo)) / (1 + 0.6 * tauT.g)) * diffuseLight) *
      twilightDim,
    1e-6,
  );

  // Human photopic adaptation: logarithmic gain across ~20..100000 lux.
  const adaptGain = opts.eyeAdapted
    ? Math.max(0.03, Math.min(60, Math.pow(20000 / lux, 0.72)))
    : 1;
  // Night dimming on the FINAL exposure (not the gain): otherwise the clamped
  // 60x gain would amplify the residual 1.5% night sky back to gray. Stars
  // stay visible because they are added pre-exposure inside the shader.
  const nightFactor = Math.max(0, Math.min(1, -opts.sunElevDeg / 12));
  const exposureFinal = opts.exposure * adaptGain * (1 - nightFactor * 0.995);

  // Direct-sun tint after one sun-path attenuation (for sun disc + terrain sun).
  const trans = (tau: number) => Math.exp(-tau * mSun);
  const starColor = kelvinToLinear(world.star.tempK);
  const sunTint = normalize([
    trans(tauT.r) * starColor[0],
    trans(tauT.g) * starColor[1] * (world.sodiumSunset && opts.sunElevDeg < 15 ? 0.72 : 1.0),
    trans(tauT.b) * starColor[2] * (world.sodiumSunset && opts.sunElevDeg < 15 ? 0.35 : 1.0),
  ]);

  // Diffuse skylight tint: saturated single-scatter proxy, dimmed by cloud deck.
  const cloudDim = 1 - world.cloudAlbedo * 0.75;
  const sky = (tau: number) => saturation(tau) * cloudDim;
  const groundSkyTint = normalize([
    (sky(tauR.r) + sky(tauM.r) * world.aerosol.albedo * world.aerosol.tint[0]) * starColor[0] + 1e-4,
    (sky(tauR.g) + sky(tauM.g) * world.aerosol.albedo * world.aerosol.tint[1]) * starColor[1] + 1e-4,
    (sky(tauR.b) + sky(tauM.b) * world.aerosol.albedo * world.aerosol.tint[2]) * starColor[2] + 1e-4,
  ]);

  // Apparent stellar diameter: theta = 2*atan(R_star / d).
  const starDistKm = world.distanceAU * 1.496e8;
  const starRadKm = world.star.radiusSun * 696000;
  const starAngularDeg = (2 * Math.atan(starRadKm / starDistKm)) / DEG;

  return {
    ...opts,
    tauR, tauM, tauA, tauT,
    columnFactor: columnFactor(world),
    fluxWm2, fluxRel, lux, downwell, diffuseLight, adaptGain, exposureFinal,
    groundSkyTint, sunTint, starColor, starAngularDeg, nightFactor,
    saturation550: saturation(tauT.g),
  };
}
