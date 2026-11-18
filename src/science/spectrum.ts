import { SPECTRAL_DATA } from './data/spectral';
import phoenixRows from './data/phoenix.json';
import type { StarSpec } from './worlds';

export type Vec3 = [number, number, number];
export const NM = SPECTRAL_DATA.map(d => d[0]);
export const BANDS = NM.length;
export const CIE = SPECTRAL_DATA.map((d, i) => d.slice(1, 4).map(x => x * 683 * 10 * (i === 0 || i === BANDS - 1 ? 0.5 : 1)) as Vec3);
export const SOLAR = SPECTRAL_DATA.map(d => d[4]);
export const OZONE = SPECTRAL_DATA.map(d => d[5]);
export const AU_KM = 149597870.7;
export const SUN_KM = 695700;
export const SOLAR_T = 5772;
export const SIGMA = 5.670374419e-8;

/** Spectral radiance, W m⁻² sr⁻¹ nm⁻¹; SI Planck constants. */
export function planck(nm: number, kelvin: number): number {
  if (kelvin <= 0) return 0;
  const metres = nm * 1e-9;
  return 1.1910429723971884e-16 / (metres ** 5 * Math.expm1(0.014387768775039337 / (metres * kelvin))) * 1e-9;
}

export function stellarLuminosity(star: Pick<StarSpec, 'tempK' | 'radiusSun'>): number {
  return star.radiusSun ** 2 * (star.tempK / SOLAR_T) ** 4;
}

const phoenix: Readonly<Record<number, readonly number[]>> = phoenixRows;

/** Top-of-atmosphere normal spectral irradiance at the chosen orbital distance. */
export function stellarSpectrum(star: StarSpec, distanceAU: number): Float64Array {
  const flux = 1361 * stellarLuminosity(star) / distanceAU ** 2;
  if (star.spectrum === 'phoenix') {
    const fractionsPerNm = phoenix[star.tempK];
    if (!fractionsPerNm) throw new RangeError(`No PHOENIX template for ${star.tempK} K`);
    return Float64Array.from(fractionsPerNm, fraction => flux * fraction);
  }
  const solar = star.spectrum === 'solar' || (star.spectrum === undefined && star.name === 'Sol');
  return Float64Array.from(NM, (nm, i) => solar
    ? SOLAR[i] * flux / 1361
    : flux * Math.PI * planck(nm, star.tempK) / (SIGMA * star.tempK ** 4));
}

export function xyz(spectrum: ArrayLike<number>): Vec3 {
  const out: Vec3 = [0, 0, 0];
  for (let i = 0; i < BANDS; i++) for (let c = 0; c < 3; c++) out[c] += spectrum[i] * CIE[i][c];
  return out;
}

/** Photometric linear sRGB: Y = .2126 R + .7152 G + .0722 B, in cd/m² or lux. */
export function xyzToRGB([x, y, z]: Vec3): Vec3 {
  return [3.2406*x - 1.5372*y - .4986*z, -.9689*x + 1.8758*y + .0415*z, .0557*x - .2040*y + 1.0570*z];
}
export function rgb(spectrum: ArrayLike<number>): Vec3 { return xyzToRGB(xyz(spectrum)); }
export const BAND_RGB = CIE.map(xyzToRGB);
export function luminance(v: ArrayLike<number>): number { return .2126*v[0] + .7152*v[1] + .0722*v[2]; }
export function linearHex(hex: string): Vec3 {
  const n = Number.parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255].map(c => c/255 <= .04045 ? c/255/12.92 : ((c/255+.055)/1.055)**2.4) as Vec3;
}

/** A smooth assumed reflectance, not recovered material spectroscopy. */
export function reflectance(hex: string, albedo: number): Float64Array {
  if(albedo<=0)return new Float64Array(BANDS);
  if(albedo>=1)return new Float64Array(BANDS).fill(1);
  const c = linearHex(hex);
  const shape = NM.map(nm => {
    if (nm <= 440) return c[2];
    if (nm < 550) return c[2] + (c[1]-c[2])*(nm-440)/110;
    if (nm < 680) return c[1] + (c[0]-c[1])*(nm-550)/130;
    return c[0];
  }).map(value => Math.max(1e-6, value));
  // A tiny neutral component makes every requested albedo attainable. Highly
  // saturated tints consequently desaturate at high reflectance; black with
  // non-zero albedo is an achromatic reflector rather than a zero-energy trap.
  // Solve for a bounded spectrum with the requested solar photopic reflectance.
  const norm = SOLAR.reduce((s, e, i) => s + e*CIE[i][1], 0);
  let low = 0, high = 1e6;
  for (let k=0; k<48; k++) {
    const mid = (low+high)/2;
    const mean = shape.reduce((s, r, i) => s + Math.min(1, r*mid)*SOLAR[i]*CIE[i][1], 0)/norm;
    if (mean < albedo) low=mid; else high=mid;
  }
  return Float64Array.from(shape, r => Math.min(1, r*(low+high)/2));
}

/** Ballesteros B−V approximation; catalogue colours are approximate blackbodies. */
export function temperatureBV(bv: number): number {
  return Math.max(2000, Math.min(30000, 4600*(1/(.92*bv+1.7)+1/(.92*bv+.62))));
}
