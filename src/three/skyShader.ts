/**
 * Full-dome radiative-transfer skydome shader.
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
uniform float uMieG;
uniform float uMieAlbedo;
uniform float uCloudAlbedo;
uniform float uSunAngRad;
uniform float uNight;
uniform float uTime;
uniform float uDiffuseHorizon;
uniform float uSunPath;
uniform float uDiffuseLight;
uniform vec3 uStarColor;
uniform vec3 uSunTint;
uniform vec3 uMieTint;
uniform vec3 uGroundColor;
uniform vec3 uGroundSkyTint;

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
  return (1.0 - g2) / pow(max(1.0 + g2 - 2.0 * g * c, 1e-4), 1.5) * 0.07957747;
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
  vec3 Tview = exp(-tauT * m);
  vec3 Tsun = exp(-uTauSun);

  // ---- single scattering (view x sun path transmittance) ----
  float PR = 0.75 * (1.0 + cosT * cosT);
  float PM = hgPhase(cosT, uMieG);
  vec3 scatterCoeff = uTauR * PR + uTauM * uMieAlbedo * uMieTint * PM * 3.0;
  vec3 single = uFlux * uStarColor * scatterCoeff * Tview * Tsun;

  // ---- sun-angle reddening: a low sun feeds the diffuse field through a
  // long path that has already lost its blue, so skylight warms toward
  // orange/red at sunset (and stays neutral at noon). ----
  float pathRed = 1.0 - exp(-max(uSunPath - 1.0, 0.0) * 0.15);
  // Small floor: keeps a tint direction when the beam is nearly extinguished
  // without washing it back to white.
  vec3 beamTint = (Tsun + vec3(0.003)) / max((Tsun.r + Tsun.g + Tsun.b) / 3.0 + 0.003, 1e-3);
  vec3 scatterTint = mix(vec3(1.0), beamTint, pathRed);

  // ---- multi-scattering equilibrium fill: whole-dome diffuse light ----
  vec3 tauScat = uTauR + uTauM * uMieAlbedo;
  vec3 S = tauScat / (1.0 + 0.55 * tauScat);
  vec3 Tesc = exp(-tauT * 0.9);
  float domeShape = 0.45 + 0.55 * pow(clamp(y * 0.5 + 0.5, 0.0, 1.0), 0.6);
  vec3 multi = uFlux * uStarColor * S * Tesc * domeShape * 1.6
    * (1.0 - uCloudAlbedo * 0.55) * uDiffuseLight * scatterTint;

  vec3 sky = single * 1.6 + multi;

  // ---- forward-scattered horizon band near the sun ----
  float horizonBand = pow(clamp(1.0 - abs(y) * 3.0, 0.0, 1.0), 2.0);
  float sunward = pow(clamp(cosT * 0.5 + 0.5, 0.0, 1.0), 6.0);
  sky += uFlux * uSunTint * horizonBand * sunward * 0.35 * (uTauM.g * 2.0 + 0.12);

  // ---- overcast: mix toward uniform cloud-deck gloom ----
  vec3 gloomTint = mix(vec3(0.62, 0.57, 0.52), uMieTint, 0.65) * scatterTint;
  vec3 gloom = uStarColor * gloomTint * uDownwell * 0.9 * max(domeShape, 0.65);
  sky = mix(sky, gloom, uCloudAlbedo * 0.85);

  // ---- sun disc + glow ----
  float sunFlux = min(uFlux, 8.0);
  float ang = acos(clamp(cosT, -1.0, 1.0));
  float aa = fwidth(ang) + 1e-4;
  float disc = 1.0 - smoothstep(uSunAngRad - aa, uSunAngRad + aa, ang);
  vec3 sunCol = uSunTint * uStarColor;
  // Disc fades as the sun sinks past the horizon; below-horizon pixels are
  // covered by the ground branch via the horizon mask below.
  float sunUp = smoothstep(-uSunAngRad - 0.004, 0.002, uSunDir.y);
  sky += sunCol * disc * 25.0 * max(sunFlux, 0.03) * sunUp;
  float glowT = clamp(cosT, 0.0, 1.0);
  sky += sunCol * (pow(glowT, 800.0) * 3.0 + pow(glowT, 24.0) * 0.22)
    * (0.35 + uTauM.g * 3.0) * min(sunFlux, 3.0) * (1.0 - uNight);

  // ---- night: fade sky, reveal stars ----
  sky *= 1.0 - uNight * 0.985;
  vec3 cell = floor(dir * 220.0);
  float h = hash13(cell);
  float star = smoothstep(0.994, 1.0, h);
  float tw = 0.6 + 0.4 * sin(uTime * 3.0 + h * 40.0);
  sky += vec3(0.9, 0.95, 1.0) * star * tw * uNight * (1.0 - uCloudAlbedo) * 2.0;

  // ---- terrain / cloud deck below the horizon ----
  float tHit = -uCamPos.y / min(y, -1e-4);
  vec2 gp = uCamPos.xz + dir.xz * tHit;
  float n = fbm(gp * 0.08);
  float n2 = vnoise(gp * 0.6);
  vec3 alb = uGroundColor * (0.82 + 0.30 * n) * (0.92 + 0.16 * n2);
  float sunElev = max(uSunDir.y, 0.0);
  vec3 amb = uFlux * uGroundSkyTint * (S * Tesc * 0.9 + 0.02)
    * (1.0 - uCloudAlbedo * 0.4) * uDiffuseLight * scatterTint;
  vec3 beam = uFlux * sunCol * Tsun * sunElev;
  vec3 ground = alb * (amb + beam * 1.4);
  ground *= 1.0 - uNight * 0.97;
  ground += alb * 0.004;

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
  col = pow(max(hdr * nlum, 0.0), vec3(1.0 / 2.2));
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
  uMieG: { value: number };
  uMieAlbedo: { value: number };
  uCloudAlbedo: { value: number };
  uSunAngRad: { value: number };
  uNight: { value: number };
  uTime: { value: number };
  uDiffuseHorizon: { value: number };
  uSunPath: { value: number };
  uDiffuseLight: { value: number };
  uStarColor: { value: THREE.Color };
  uSunTint: { value: THREE.Color };
  uMieTint: { value: THREE.Color };
  uGroundColor: { value: THREE.Color };
  uGroundSkyTint: { value: THREE.Color };
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
    uMieG: { value: 0.65 },
    uMieAlbedo: { value: 0.95 },
    uCloudAlbedo: { value: 0 },
    uSunAngRad: { value: 0.00465 },
    uNight: { value: 0 },
    uTime: { value: 0 },
    uDiffuseHorizon: { value: 0 },
    uSunPath: { value: 1 },
    uDiffuseLight: { value: 1 },
    uStarColor: { value: new THREE.Color(1, 1, 1) },
    uSunTint: { value: new THREE.Color(1, 1, 1) },
    uMieTint: { value: new THREE.Color(1, 1, 1) },
    uGroundColor: { value: new THREE.Color(0.3, 0.3, 0.3) },
    uGroundSkyTint: { value: new THREE.Color(0.5, 0.6, 0.8) },
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
  return new THREE.Color(hex).convertSRGBToLinear();
}
