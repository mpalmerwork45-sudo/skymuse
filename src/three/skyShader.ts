/**
 * Full-dome, three-channel scattering approximation.
 *
 * One inverted sphere handles both sky (dir.y > 0) and terrain (dir.y < 0),
 * so the horizon is a single crisp fwidth anti-aliased edge rather than two
 * blended meshes. Per-pixel model:
 * - wavelength-dependent optical depth at 680/550/440 nm (uniforms from
 *   src/science/atmosphere.ts so telemetry and pixels agree),
 * - Rayleigh 1/lambda^4 phase + Henyey-Greenstein Mie phase,
 * - single scattering along view and sun paths,
 * - multi-scattering equilibrium fill S(tau)=tau/(1+c*tau) that bathes the
 *   WHOLE dome (no fade to black away from the sun),
 * - overcast mixing toward uniform gloom for high cloud-albedo worlds,
 * - ACES filmic tone mapping + gamma in-shader.
 */
import * as THREE from 'three';
import type { SkyState } from '../science/atmosphere';
import type { WorldSpec } from '../science/worlds';

export const SKY_VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

export const SKY_FRAG = /* glsl */ `
precision highp float;
varying vec3 vWorld;

uniform vec3 uCamPos;
uniform vec3 uSunDir;
uniform vec3 uTauR;
uniform vec3 uTauM;
uniform vec3 uTauA;
uniform vec3 uTauSun;
uniform float uFlux;
uniform float uDownwell;
uniform float uExposure;
uniform vec3 uMieG;
uniform float uMieAlbedo;
uniform float uCloudAlbedo;
uniform float uSunAngRad;
uniform float uNight;
uniform float uTime;
uniform float uDiffuseHorizon;
uniform float uSunPath;
uniform float uDiffuseLight;
uniform float uTwilight;
uniform vec3 uStarColor;
uniform vec3 uSunBeam;
uniform vec3 uMieTint;
uniform vec3 uGroundColor;

// Display gain mapping physical radiance to tone-mapper input.
const float DISPLAY = 8.0;

float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash13(vec3(i, 1.0));
  float b = hash13(vec3(i + vec2(1.0, 0.0), 1.0));
  float c = hash13(vec3(i + vec2(0.0, 1.0), 1.0));
  float d = hash13(vec3(i + vec2(1.0, 1.0), 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
  return vnoise(p) * 0.65 + vnoise(p * 2.13 + 7.7) * 0.35;
}
float hgPhase(float c, float g) {
  float g2 = g * g;
  // Mean-one convention, matching Rayleigh below (both integrate to 4*pi).
  return (1.0 - g2) / pow(max(1.0 + g2 - 2.0 * g * c, 1e-4), 1.5);
}
// Integrated single scattering through a uniform optical-depth slab.
// Stable also when sun and view paths coincide or extinction tends to zero.
vec3 scatterPath(vec3 tau, float viewPath, float sunPath) {
  vec3 a = tau * viewPath;
  vec3 b = tau * sunPath;
  vec3 delta = abs(a - b);
  vec3 small = 1.0 - delta * 0.5 + delta * delta / 6.0;
  vec3 ratio = mix((1.0 - exp(-delta)) / max(delta, vec3(1e-6)), small,
    lessThan(delta, vec3(0.001)));
  return viewPath * exp(-min(a, b)) * ratio;
}
vec3 aces(vec3 x) {
  const float a = 2.51;
  const float b = 0.03;
  const float c = 2.43;
  const float d = 0.59;
  const float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

void main() {
  vec3 dir = normalize(vWorld - uCamPos);
  float cosT = dot(dir, uSunDir);
  float y = dir.y;
  vec3 tauT = uTauR + uTauM + uTauA;

  // ---- view-path optical depth (limb-brightened at horizon) ----
  float m = 1.0 / (max(y, 0.0) * 0.85 + 0.15);
  m *= 1.0 + 1.5 * pow(clamp(1.0 - max(y, 0.0), 0.0, 1.0), 8.0);
  vec3 Tsun = exp(-uTauSun);

  // ---- single scattering (view x sun path transmittance) ----
  float PR = 0.75 * (1.0 + cosT * cosT);
  vec3 PM = vec3(hgPhase(cosT, uMieG.r), hgPhase(cosT, uMieG.g), hgPhase(cosT, uMieG.b));
  vec3 scatterCoeff = uTauR * PR + uTauM * uMieAlbedo * uMieTint * PM;
  vec3 single = uFlux * uStarColor * scatterCoeff * scatterPath(tauT, m, uSunPath);

  // ---- sun-angle reddening: a low sun feeds the diffuse field through a
  // long path that has already lost its blue, so skylight warms toward
  // orange/red at sunset (and stays neutral at noon). ----
  // Under overcast the diffuse field is already well-mixed, so directional
  // reddening is tempered (Venus sunsets dim to amber-brown, never crimson).
  float pathRed = (1.0 - exp(-max(uSunPath - 1.0, 0.0) * 0.15)) * (1.0 - uCloudAlbedo * 0.5);
  // Strongest toward the sunlit horizon; a red beam does not turn the entire
  // hemisphere red. Higher, shorter view paths retain a cooler diffuse sky.
  pathRed *= exp(-max(y, 0.0) * 4.0) * (0.3 + 0.7 * pow(clamp(cosT * 0.5 + 0.5, 0.0, 1.0), 2.0));
  // Small floor: keeps a tint direction when the beam is nearly extinguished
  // without washing it back to white.
  vec3 beamTint = (Tsun + vec3(0.003)) / max((Tsun.r + Tsun.g + Tsun.b) / 3.0 + 0.003, 1e-3);
  vec3 scatterTint = mix(vec3(1.0), beamTint, pathRed);

  // ---- multi-scattering equilibrium fill: whole-dome diffuse light ----
  vec3 tauScat = uTauR + uTauM * uMieAlbedo * uMieTint;
  vec3 S = tauScat / (1.0 + 0.55 * tauScat);
  vec3 Tesc = exp(-tauT * 0.9);
  float domeShape = 0.45 + 0.55 * pow(clamp(y * 0.5 + 0.5, 0.0, 1.0), 0.6);
  vec3 multi = uFlux * uStarColor * S * Tesc * domeShape * 1.6
    * (1.0 - uCloudAlbedo * 0.55) * uDiffuseLight * scatterTint;

  vec3 sky = single * 0.2 + multi;

  // No air, no glow: forward-scattered terms fade out with the scatterers,
  // so airless worlds show only the bare sun disc (no corona/haze).
  float airGlow = 1.0 - exp(-tauScat.g * 8.0);

  // Forward glow represents scattering distributed along the path, so it sees
  // roughly a quarter-path beam (high-altitude light), not the TOA flux at a
  // saturated tint: dims and warms correctly as the beam dies. Overcast decks
  // wash out directional glow.
  vec3 pathGlow = exp(-tauT * min(uSunPath, 30.0) * 0.25);
  float cloudGlow = exp(-uCloudAlbedo * 2.0);

  // ---- forward-scattered horizon band near the sun ----
  float horizonBand = pow(clamp(1.0 - abs(y) * 3.0, 0.0, 1.0), 2.0);
  float sunward = pow(clamp(cosT * 0.5 + 0.5, 0.0, 1.0), 6.0);
  vec3 forwardTint = scatterCoeff / max(max(scatterCoeff.r, scatterCoeff.g), max(scatterCoeff.b, 1e-6));
  sky += uFlux * uStarColor * forwardTint * horizonBand * sunward * 0.35 * (tauScat.g * 2.0 + 0.12)
    * airGlow * pathGlow * cloudGlow;

  // ---- overcast: mix toward uniform cloud-deck gloom ----
  vec3 gloomTint = mix(vec3(0.62, 0.57, 0.52), uMieTint, 0.65) * scatterTint;
  // uDownwell already includes twilight; apply it to the other solar terms
  // here, once, before mixing in this cloud contribution.
  sky *= uTwilight;
  vec3 gloom = uStarColor * gloomTint * uDownwell * 0.9 * max(domeShape, 0.65);
  sky = mix(sky, gloom, uCloudAlbedo * 0.85);

  // ---- sun disc + glow ----
  float sunFlux = min(uFlux, 8.0);
  float ang = acos(clamp(cosT, -1.0, 1.0));
  float aa = fwidth(ang) + 1e-4;
  float disc = 1.0 - smoothstep(uSunAngRad - aa, uSunAngRad + aa, ang);
  // Direct-beam extinction and cloud attenuation hide an obscured disc.
  float cloudDim = exp(-uCloudAlbedo * 3.0);
  // The horizon mask clips the actual disc; do not fade the entire disc just
  // because its centre crosses the horizon, or normalize away extinction.
  sky += uSunBeam * disc * 750.0 * sunFlux * cloudDim;
  float glowT = clamp(cosT, 0.0, 1.0);
  sky += uStarColor * forwardTint * (pow(glowT, 800.0) * 3.0 + pow(glowT, 24.0) * 0.22)
    * (0.35 + tauScat.g * 3.0) * min(sunFlux, 3.0) * uTwilight * airGlow * pathGlow * cloudGlow;

  // ---- night: fade sky, reveal stars ----
  vec3 cell = floor(dir * 220.0);
  float h = hash13(cell);
  float star = smoothstep(0.994, 1.0, h);
  float tw = 0.6 + 0.4 * sin(uTime * 3.0 + h * 40.0);
  sky += vec3(0.9, 0.95, 1.0) * star * tw * uNight * (1.0 - uCloudAlbedo) * 0.002;

  // ---- terrain / cloud deck below the horizon ----
  float tHit = -uCamPos.y / min(y, -1e-4);
  vec2 gp = uCamPos.xz + dir.xz * tHit;
  float n = fbm(gp * 0.08);
  float n2 = vnoise(gp * 0.6);
  vec3 alb = uGroundColor * (0.82 + 0.30 * n) * (0.92 + 0.16 * n2);
  float sunElev = max(uSunDir.y, 0.0);
  vec3 amb = uFlux * uStarColor * S * Tesc * 0.9
    * (1.0 - uCloudAlbedo * 0.4) * uDiffuseLight * uTwilight * scatterTint;
  amb = mix(amb, uStarColor * gloomTint * uDownwell, uCloudAlbedo * 0.85);
  vec3 beam = uFlux * uSunBeam * sunElev * cloudDim;
  vec3 ground = alb * (amb + beam * 1.4);
  ground += alb * 0.000004 * uNight;

  // ---- crisp (or diffuse) horizon demarcation ----
  float edgeAA = fwidth(y) * 1.5 + 1e-4;
  float skyM = mix(
    smoothstep(-edgeAA, edgeAA, y),
    smoothstep(-0.05, 0.05, y),
    uDiffuseHorizon
  );
  ground = mix(ground, sky * (0.55 + 0.45 * domeShape), uDiffuseHorizon * smoothstep(-0.3, 0.0, y) * 0.7);
  vec3 col = mix(ground, sky, skyM);

  // Chromaticity-preserving tone map: compress luminance, keep hue. Per-channel
  // ACES would crush sunset chroma toward white wherever the adapted exposure
  // pushes highlights into the shoulder.
  vec3 hdr = col * uExposure * DISPLAY;
  float lum = dot(hdr, vec3(0.2126, 0.7152, 0.0722));
  float nlum = aces(vec3(lum)).r / max(lum, 1e-4);
  col = max(hdr * nlum, 0.0);
  // Fit highlights into the display gamut without clipping channels
  // independently (which changes hue), then encode linear RGB to sRGB once.
  col /= max(1.0, max(col.r, max(col.g, col.b)));
  col = mix(1.055 * pow(col, vec3(1.0 / 2.4)) - 0.055, col * 12.92,
    lessThanEqual(col, vec3(0.0031308)));
  gl_FragColor = vec4(col, 1.0);
}
`;

export interface SkyUniforms {
  uCamPos: { value: THREE.Vector3 };
  uSunDir: { value: THREE.Vector3 };
  uTauR: { value: THREE.Vector3 };
  uTauM: { value: THREE.Vector3 };
  uTauA: { value: THREE.Vector3 };
  uTauSun: { value: THREE.Vector3 };
  uFlux: { value: number };
  uDownwell: { value: number };
  uExposure: { value: number };
  uMieG: { value: THREE.Vector3 };
  uMieAlbedo: { value: number };
  uCloudAlbedo: { value: number };
  uSunAngRad: { value: number };
  uNight: { value: number };
  uTime: { value: number };
  uDiffuseHorizon: { value: number };
  uSunPath: { value: number };
  uDiffuseLight: { value: number };
  uTwilight: { value: number };
  uStarColor: { value: THREE.Color };
  uSunBeam: { value: THREE.Color };
  uMieTint: { value: THREE.Color };
  uGroundColor: { value: THREE.Color };
}

export function createSkyMaterial(): { material: THREE.ShaderMaterial; uniforms: SkyUniforms } {
  const uniforms = {
    uCamPos: { value: new THREE.Vector3() },
    uSunDir: { value: new THREE.Vector3(0, 0, 1) },
    uTauR: { value: new THREE.Vector3() },
    uTauM: { value: new THREE.Vector3() },
    uTauA: { value: new THREE.Vector3() },
    uTauSun: { value: new THREE.Vector3() },
    uFlux: { value: 1 },
    uDownwell: { value: 1 },
    uExposure: { value: 1 },
    uMieG: { value: new THREE.Vector3(0.65, 0.65, 0.65) },
    uMieAlbedo: { value: 0.95 },
    uCloudAlbedo: { value: 0 },
    uSunAngRad: { value: 0.00465 },
    uNight: { value: 0 },
    uTime: { value: 0 },
    uDiffuseHorizon: { value: 0 },
    uSunPath: { value: 1 },
    uDiffuseLight: { value: 1 },
    uTwilight: { value: 1 },
    uStarColor: { value: new THREE.Color(1, 1, 1) },
    uSunBeam: { value: new THREE.Color(1, 1, 1) },
    uMieTint: { value: new THREE.Color(1, 1, 1) },
    uGroundColor: { value: new THREE.Color(0.3, 0.3, 0.3) },
  };
  const material = new THREE.ShaderMaterial({
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
  });
  return { material, uniforms };
}

/** Linear-space color from a hex string (sRGB input). */
export function hexToLinear(hex: string): THREE.Color {
  return new THREE.Color(hex);
}

/** Shared CPU-to-GPU binding, also exercised by the rendered-colour checks. */
export function updateSkyUniforms(uniforms: SkyUniforms, w: WorldSpec, s: SkyState): void {
  const DEG = Math.PI / 180;
  uniforms.uTauR.value.set(s.tauR.r, s.tauR.g, s.tauR.b);
  uniforms.uTauM.value.set(s.tauM.r, s.tauM.g, s.tauM.b);
  uniforms.uTauA.value.set(s.tauA.r, s.tauA.g, s.tauA.b);
  const mSun = s.sunPath;
  uniforms.uTauSun.value.set(s.tauT.r * mSun, s.tauT.g * mSun, s.tauT.b * mSun);
  uniforms.uSunPath.value = mSun;
  uniforms.uDiffuseLight.value = s.diffuseLight;
  uniforms.uTwilight.value = s.twilightLight;
  uniforms.uFlux.value = s.fluxRel;
  uniforms.uDownwell.value = s.downwell;
  uniforms.uExposure.value = s.exposureFinal;
  uniforms.uMieG.value.set(...(w.aerosol.gRGB ?? [w.aerosol.g, w.aerosol.g, w.aerosol.g]));
  uniforms.uMieAlbedo.value = w.aerosol.albedo;
  uniforms.uCloudAlbedo.value = w.cloudAlbedo;
  uniforms.uSunAngRad.value = (s.starAngularDeg / 2) * DEG;
  uniforms.uNight.value = s.nightFactor;
  uniforms.uDiffuseHorizon.value = w.horizonDiffuse ? 1 : 0;
  uniforms.uStarColor.value.setRGB(s.starColor[0], s.starColor[1], s.starColor[2]);
  uniforms.uSunBeam.value.setRGB(...s.sunBeam);
  uniforms.uMieTint.value.setRGB(w.aerosol.tint[0], w.aerosol.tint[1], w.aerosol.tint[2]);
  uniforms.uGroundColor.value.copy(hexToLinear(w.surfaceColor));
}
