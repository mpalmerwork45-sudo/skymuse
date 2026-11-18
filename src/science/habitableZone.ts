import type { StarSpec } from './worlds';
import { stellarLuminosity } from './spectrum';

export type HabitableZoneModel = 'kopparapu2014' | 'ramirez2018';

export interface HabitableZone {
  innerAU: number;
  outerAU: number;
  minFluxEarth: number;
  maxFluxEarth: number;
}

// Runaway-greenhouse inner and maximum-CO₂-greenhouse outer flux limits.
// Fourth-order fits in Teff − 5780 K. See the source tables linked in worlds.ts.
const FITS = {
  kopparapu2014: {
    maxTemperature: 7200,
    inner: [1.107, 1.332e-4, 1.58e-8, -8.308e-12, -1.931e-15],
    outer: [.356, 6.171e-5, 1.698e-9, -3.198e-12, -5.575e-16],
  },
  ramirez2018: {
    maxTemperature: 10000,
    // Ramirez (2018), corrected Table 1, Leconte and CO₂ maximum-greenhouse columns.
    inner: [1.1105, 1.1921e-4, 9.5932e-9, -2.6189e-12, 1.3710e-16],
    outer: [.3587, 5.8087e-5, 1.5393e-9, -8.3547e-13, 1.0319e-16],
  },
} as const;

export function conservativeHabitableZone(
  star: Pick<StarSpec, 'tempK' | 'radiusSun'>,
  model: HabitableZoneModel = 'kopparapu2014',
): HabitableZone | undefined {
  const fit = FITS[model];
  if (!Number.isFinite(star.tempK) || star.tempK < 2600 || star.tempK > fit.maxTemperature ||
      !Number.isFinite(star.radiusSun) || star.radiusSun <= 0) return undefined;
  const t = star.tempK - 5780;
  const fluxAtEdge = ([solar, a, b, c, d]: readonly [number, number, number, number, number]) =>
    solar + t * (a + t * (b + t * (c + t * d)));
  const maxFluxEarth = fluxAtEdge(fit.inner);
  const minFluxEarth = fluxAtEdge(fit.outer);
  const luminosity = stellarLuminosity(star);
  return {
    innerAU: Math.sqrt(luminosity / maxFluxEarth),
    outerAU: Math.sqrt(luminosity / minFluxEarth),
    minFluxEarth, maxFluxEarth,
  };
}
