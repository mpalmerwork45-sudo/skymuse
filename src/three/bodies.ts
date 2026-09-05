/**
 * Procedural celestial companions: Saturn's ring ribbon + moon sprites.
 *
 * Rings are a parametric ribbon arching east -> overhead -> west (as seen by
 * an observer on the 1-bar deck), textured with C / B / Cassini / A structure
 * including the Encke gap. Moons are canvas-shaded discs.
 */
import * as THREE from 'three';

const DEG = Math.PI / 180;

function dirFromAzElev(azDeg: number, elevDeg: number): THREE.Vector3 {
  const az = azDeg * DEG;
  const el = elevDeg * DEG;
  return new THREE.Vector3(
    Math.sin(az) * Math.cos(el),
    Math.sin(el),
    -Math.cos(az) * Math.cos(el),
  );
}

/** Ribbon from the eastern horizon, cresting high south, to the west. */
export function buildRingGeometry(radius = 7500): THREE.BufferGeometry {
  const segs = 160;
  const positions: number[] = [];
  const uvs: number[] = [];
  const index: number[] = [];
  const halfWidthDeg = 3.6;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const az = 90 + 180 * t; // east -> south -> west
    const elev = 2 + Math.sin(Math.PI * t) * 70;
    for (let k = 0; k <= 1; k++) {
      const e = elev + (k === 0 ? -halfWidthDeg : halfWidthDeg);
      const p = dirFromAzElev(az, Math.max(e, 0.4)).multiplyScalar(radius);
      positions.push(p.x, p.y, p.z);
      uvs.push(k, t);
    }
  }
  for (let i = 0; i < segs; i++) {
    const a = i * 2;
    index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(index);
  return g;
}

/** Radial ring profile: C, B, Cassini Division, A, Encke gap. x = inner->outer. */
export function makeRingTexture(): THREE.CanvasTexture {
  const W = 1024;
  const H = 8;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = ctx2d(cv);
  const img = ctx.createImageData(W, H);
  for (let x = 0; x < W; x++) {
    const v = x / (W - 1);
    const [r, g, b, a] = ringProfile(v, x);
    for (let yy = 0; yy < H; yy++) {
      const o = (yy * W + x) * 4;
      img.data[o] = r;
      img.data[o + 1] = g;
      img.data[o + 2] = b;
      img.data[o + 3] = a;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function ringProfile(v: number, x: number): [number, number, number, number] {
  // Fine radial banding so the ribbon doesn't look flat.
  const band = 0.92 + 0.08 * Math.sin(x * 0.35) * Math.sin(x * 0.061 + 1.3);
  let c: [number, number, number] = [205, 188, 150];
  let a = 0;
  if (v < 0.02) {
    a = 0;
  } else if (v < 0.14) {
    c = [168, 152, 120]; a = 70; // C ring
  } else if (v < 0.17) {
    a = 12;
  } else if (v < 0.55) {
    c = [224, 205, 168]; a = 242; // B ring
  } else if (v < 0.62) {
    c = [150, 140, 125]; a = 22; // Cassini Division
  } else if (v < 0.86) {
    c = [200, 183, 148]; a = 180; // A ring
    if (v > 0.862 && v < 0.874) a = 14; // Encke gap
  } else if (v < 0.97) {
    c = [190, 175, 145]; a = 90;
  } else {
    a = 0;
  }
  return [
    Math.round(c[0] * band),
    Math.round(c[1] * band),
    Math.round(c[2] * band),
    Math.round(a),
  ];
}

/** Soft shaded disc for moons; highlight offset toward the sun side. */
export function makeMoonTexture(color: string): THREE.CanvasTexture {
  const S = 128;
  const cv = document.createElement('canvas');
  cv.width = S;
  cv.height = S;
  const ctx = ctx2d(cv);
  const grad = ctx.createRadialGradient(S * 0.38, S * 0.42, S * 0.05, S * 0.5, S * 0.5, S * 0.52);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.25, color);
  grad.addColorStop(0.75, shade(color, 0.55));
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * f);
  const g = Math.round(((n >> 8) & 255) * f);
  const b = Math.round((n & 255) * f);
  return `rgb(${r},${g},${b})`;
}

function ctx2d(cv: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = cv.getContext('2d');
  if (!ctx) throw new Error('2d canvas context unavailable');
  return ctx;
}

export { dirFromAzElev };
