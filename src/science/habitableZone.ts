import type { StarSpec } from './worlds';
import { stellarLuminosity } from './spectrum';

export interface HabitableZone {
  innerAU: number;
  outerAU: number;
  minFluxEarth: number;
  maxFluxEarth: number;
}

/** Kopparapu et al. (2014), Eq. 4–5 and Table 1, one Earth-mass planet.
 * Runaway greenhouse inner edge; maximum greenhouse outer edge.
 * https://arxiv.org/abs/1404.5292 — fit valid for 2600–7200 K.
 * This is a climate-model placement criterion, not a solved surface climate.
 */
export function conservativeHabitableZone(star: Pick<StarSpec, 'tempK' | 'radiusSun'>): HabitableZone | undefined {
  if (!Number.isFinite(star.tempK) || star.tempK < 2600 || star.tempK > 7200 ||
      !Number.isFinite(star.radiusSun) || star.radiusSun <= 0) return undefined;
  const t = star.tempK - 5780;
  const maxFluxEarth = 1.107 + t * (1.332e-4 + t * (1.58e-8 + t * (-8.308e-12 + t * -1.931e-15)));
  const minFluxEarth = .356 + t * (6.171e-5 + t * (1.698e-9 + t * (-3.198e-12 + t * -5.575e-16)));
  const luminosity = stellarLuminosity(star);
  return {
    innerAU: Math.sqrt(luminosity / maxFluxEarth),
    outerAU: Math.sqrt(luminosity / minFluxEarth),
    minFluxEarth, maxFluxEarth,
  };
}
