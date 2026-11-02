/** Achromatic primary-ray refraction through a spherical, exponential gas.
 * Distances are km. The Lorentz–Lorenz factor follows gas number density.
 * Ray integration preserves Bouguer's invariant n(r) r sin(zenith angle).
 * Sources, reference conditions and approximation limits: docs/science-model.md.
 */
import type { WorldSpec } from './worlds';
import type { Vec3 } from './spectrum';
import { add, sub, dot, scale, length, unit, cross } from './vectors';

export const REFRACTION_WAVELENGTH_NM = 589;
// Edwards (1919), NBS Technologic Paper 131, Table 1, ideal-gas column:
// (n−1) at 0°C and 760 mmHg, sodium D reference wavelength.
// This reference table is deliberately not presented as modern metrology.
const REFRACTIVITY: Record<string, number> = {
  n2: 297.1e-6, o2: 270.4e-6, ar: 280.7e-6, co2: 446.7e-6,
  h2: 138.8e-6, he: 34.2e-6, ch4: 440.8e-6, so2: 662.8e-6,
};
// Ciddor's water-vapour dispersion expression, reduced from 293.15 K / 1333 Pa
// to the same ideal number density. No claim of gaseous water stability at STP.
const sigma2 = (1000 / REFRACTION_WAVELENGTH_NM) ** 2;
REFRACTIVITY.h2o = 1.022e-8 * (295.235 + sigma2 * (2.6422 + sigma2 * (-.032380 + sigma2 * .004028)))
  * (101325 / 1333) * (293.15 / 273.15);

export function gasLorentzFactor(world: Pick<WorldSpec, 'pressureBar' | 'temperatureK' | 'gases'>): number {
  if (world.pressureBar <= 0 || world.temperatureK <= 0) return 0;
  let total = 0, q = 0;
  for (const [name, fraction] of Object.entries(world.gases)) {
    const x = fraction ?? 0, n = 1 + (REFRACTIVITY[name] ?? 0);
    total += x;
    q += x * (n*n - 1) / (n*n + 2);
  }
  return total > 0 ? q / total * (world.pressureBar / 1.01325) * (273.15 / world.temperatureK) : 0;
}

export interface RefractiveProfile {
  radius: number;
  top: number;
  gasH: number;
  refractiveQ0: number;
}

export function refractiveIndex(g: RefractiveProfile, heightKm: number): number {
  const q = g.refractiveQ0 * Math.exp(-Math.max(0, heightKm) / g.gasH);
  return Math.sqrt((1 + 2*q) / (1 - q));
}
/** Radial derivative of ln n, per km. */
export function refractiveGradient(g: RefractiveProfile, heightKm: number): number {
  const q = g.refractiveQ0 * Math.exp(-Math.max(0, heightKm) / g.gasH);
  return -q / g.gasH * (1 / (1 + 2*q) + .5 / (1 - q));
}
const nr = (g: RefractiveProfile, r: number) => r * refractiveIndex(g, r - g.radius);
const criticalCache = new WeakMap<RefractiveProfile, number>();

/** Minimum of n(r)r: a ray cannot cross an outer turning level below its invariant. */
export function criticalRadius(g: RefractiveProfile): number {
  const cached = criticalCache.get(g);
  if (cached !== undefined) return cached;
  const derivative = (r: number) => 1 + r * refractiveGradient(g, r - g.radius);
  let low = g.radius, high = g.radius + g.top;
  if (derivative(low) >= 0) high = low;
  else for (let i = 0; i < 52; i++) {
    const mid = (low + high) / 2;
    if (derivative(mid) < 0) low = mid; else high = mid;
  }
  const result = (low + high) / 2;
  criticalCache.set(g, result);
  return result;
}

export function minimumEscapeElevation(g: RefractiveProfile, radius: number): number {
  const critical = criticalRadius(g), ratio = Math.min(1, nr(g, critical) / nr(g, radius));
  const angle = Math.acos(ratio);
  return critical > radius ? angle : -angle;
}

export interface RadialSample { height: number; ds: number; }
export interface RefractedNode {
  p: Vec3; direction: Vec3; h: number; ds: number;
  samples: RadialSample[];
}
export interface RefractedPath {
  nodes: RefractedNode[];
  ground: boolean;
  distance: number;
  exitDirection: Vec3;
  exitPoint: Vec3;
  /** Unwrapped asymptotic elevation relative to the starting point's up axis. */
  geometricElevation: number;
  invariant: number;
}

const GAUSS = [
  [-.8611363115940526, .3478548451374538],
  [-.3399810435848563, .6521451548625461],
  [.3399810435848563, .6521451548625461],
  [.8611363115940526, .3478548451374538],
] as const;

function turningRadius(g: RefractiveProfile, invariant: number, low: number, high: number, increasing: boolean): number {
  for (let i = 0; i < 54; i++) {
    const mid = (low + high) / 2;
    if ((nr(g, mid) < invariant) === increasing) low = mid; else high = mid;
  }
  return (low + high) / 2;
}

/** Radial quadrature avoids Cartesian step drift and resolves grazing tangencies.
 * Density quadrature nodes are returned so extinction uses the identical path.
 * Paths that turn outward and return to the surface are represented explicitly.
 */
export function traceRefractedRay(g: RefractiveProfile, origin: Vec3, apparentDirection: Vec3, count = 64): RefractedPath {
  const r0 = length(origin), up = scale(origin, 1/r0), d0 = unit(apparentDirection);
  const mu = Math.max(-1, Math.min(1, dot(up, d0)));
  const horizontal = sub(d0, scale(up, mu));
  const tangent = length(horizontal) > 1e-12 ? unit(horizontal) : unit(cross(up, Math.abs(up[0]) < .9 ? [1,0,0] : [0,0,1]));
  const invariant = nr(g, r0) * Math.sqrt(Math.max(0, 1 - mu*mu));
  const critical = criticalRadius(g), outer = g.radius + g.top;
  if (r0 >= outer - 1e-8 && mu >= 0) return {
    nodes: [], ground: false, distance: 0, exitDirection: d0, exitPoint: origin,
    geometricElevation: Math.asin(mu), invariant,
  };
  let ground = false;
  const legs: [number, number][] = [];
  if (mu < 0) {
    if (critical < r0 && invariant > nr(g, critical) * (1 + 1e-13)) {
      const turn = turningRadius(g, invariant, critical, r0, true);
      legs.push([r0, turn], [turn, outer]);
    } else { ground = true; legs.push([r0, g.radius]); }
  } else if (critical > r0 && invariant >= nr(g, critical) * (1 - 1e-13)) {
    const turn = turningRadius(g, invariant, r0, critical, false);
    ground = true;
    legs.push([r0, turn], [turn, g.radius]);
  } else legs.push([r0, outer]);

  const nodes: RefractedNode[] = [];
  let phi = 0, distance = 0, lastRadius = r0, lastSign = mu < 0 ? -1 : 1;
  const positionAt = (r: number, angle: number) => add(scale(up, r*Math.cos(angle)), scale(tangent, r*Math.sin(angle)));
  const directionAt = (r: number, angle: number, sign: number): Vec3 => {
    const tangential = Math.max(0, Math.min(1, invariant/nr(g, r)));
    const radial = sign * Math.sqrt(Math.max(0, 1-tangential*tangential));
    return add(scale(up, radial*Math.cos(angle)-tangential*Math.sin(angle)), scale(tangent, radial*Math.sin(angle)+tangential*Math.cos(angle)));
  };
  for (const [a,b] of legs) {
    if (Math.abs(b-a) < 1e-10) continue;
    const sign = b > a ? 1 : -1;
    for (let j = 0; j < count; j++) {
      const t0 = j/count, t1 = (j+1)/count, dt = (t1-t0)/2, tm = (t0+t1)/2;
      const samples: RadialSample[] = [];
      let ds = 0, dphi = 0;
      for (const [x,w] of GAUSS) {
        const t = tm + x*dt, r = a + (b-a)*Math.sin(t*Math.PI/2)**2;
        const drdt = Math.abs((b-a)*Math.PI/2*Math.sin(Math.PI*t));
        const q = invariant / nr(g,r), radial = Math.sqrt(Math.max(1e-24, 1-q*q));
        const step = w*dt*drdt/radial;
        ds += step; dphi += step*q/r;
        samples.push({height: r-g.radius, ds: step});
      }
      const r = a + (b-a)*Math.sin(tm*Math.PI/2)**2, angle = phi + dphi/2;
      nodes.push({p: positionAt(r,angle), direction: directionAt(r,angle,sign), h:r-g.radius, ds, samples});
      phi += dphi; distance += ds; lastRadius = b; lastSign = sign;
    }
  }
  const exitPoint = positionAt(lastRadius,phi);
  const exitDirection = ground ? directionAt(lastRadius,phi,lastSign) :
    add(scale(up,Math.sin(Math.acos(Math.min(1,invariant/outer))-phi)),scale(tangent,Math.cos(Math.acos(Math.min(1,invariant/outer))-phi)));
  return {nodes,ground,distance,exitPoint,exitDirection,invariant,
    geometricElevation: Math.acos(Math.min(1,invariant/outer))-phi};
}
