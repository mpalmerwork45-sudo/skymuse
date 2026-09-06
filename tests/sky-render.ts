import * as THREE from 'three';
import { computeSky, type SkyOptions } from '../src/science/atmosphere';
import { WORLDS, type WorldSpec } from '../src/science/worlds';
import { createSkyMaterial, updateSkyUniforms } from '../src/three/skyShader';

const checks: { name: string; passed: boolean }[] = [];
const check = (name: string, passed: boolean) => checks.push({ name, passed });
const DEG = Math.PI / 180;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(640, 400);
const shaderErrors: string[] = [];
renderer.debug.onShaderError = (gl, program, vertex, fragment) => {
  shaderErrors.push([gl.getProgramInfoLog(program), gl.getShaderInfoLog(vertex), gl.getShaderInfoLog(fragment)].join('\n'));
};
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 1.6, 0.1, 20000);
camera.position.set(0, 1.7, 0);
const { material, uniforms } = createSkyMaterial();
const dome = new THREE.Mesh(new THREE.SphereGeometry(8000, 48, 32), material);
dome.position.y = 1.7;
scene.add(dome);
const gl = renderer.getContext();
const world = (id: string) => WORLDS.find(w => w.id === id)!;
function render(w: WorldSpec, elevation: number, changes: Partial<SkyOptions> = {}, gallery = false) {
  const s = computeSky(w, {
    sunElevDeg: elevation, sunAzDeg: 90, aerosolScale: 1,
    absorptionOn: true, eyeAdapted: true, exposure: 1, ...changes,
  });
  uniforms.uCamPos.value.copy(camera.position);
  uniforms.uSunDir.value.set(Math.cos(elevation * DEG), Math.sin(elevation * DEG), 0);
  updateSkyUniforms(uniforms, w, s);
  const pitch = elevation > 10 ? 25 : 3;
  camera.lookAt(Math.cos(pitch * DEG), 1.7 + Math.sin(pitch * DEG), 0);
  renderer.render(scene, camera);
  const pixel = (x: number, y: number) => {
    const rgba = new Uint8Array(4);
    gl.readPixels(Math.floor(x * gl.drawingBufferWidth / 640), Math.floor(y * gl.drawingBufferHeight / 400), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
    return Array.from(rgba).slice(0, 3);
  };
  if (gallery) {
    const figure = document.createElement('figure');
    const img = document.createElement('img');
    img.src = renderer.domElement.toDataURL();
    const caption = document.createElement('figcaption');
    caption.textContent = `${w.name} · Sun ${elevation}° · ${s.lux.toFixed(2)} approximate lux`;
    figure.append(img, caption);
    document.querySelector('#gallery')!.append(figure);
  }
  return { center: pixel(320, 200), side: pixel(100, 200), top: pixel(320, 350), ground: pixel(320, 30) };
}
try {
  const noon = render(world('earth'), 45, {}, true);
  const dawn = render(world('earth'), 2, {}, true);
  const horizon = render(world('earth'), 0, {}, true);
  const dusk = render(world('earth'), -6, {}, true);
  const night = render(world('earth'), -12, {}, true);
  check('Earth daytime sky is blue', noon.side[2] > noon.side[0] + 20);
  check('Earth low sun warms the horizon', dawn.center[0] > dawn.center[2] + 10);
  check('Earth upper sky stays cooler than its sunset horizon', dawn.top[2] > dawn.top[0] + 10);
  const brightness = (p: number[]) => p.reduce((sum, v) => sum + v, 0);
  check('Adapted twilight gets darker, without a white flare', brightness(dusk.side) < brightness(horizon.side) * 0.5);
  check('Late twilight fades further', brightness(night.side) < brightness(dusk.side) * 0.1);
  const mars = render(world('mars'), 2, {}, true);
  check('Mars dust makes a blue sunward glow', mars.center[2] > mars.center[0] + 15);
  check('Mars surrounding dust sky stays warm', mars.side[0] > mars.side[2] + 40);
  const moon = render(world('moon'), 2, {}, true);
  check('Airless sky is black', brightness(moon.top) === 0 && brightness(moon.side) === 0);
  const absorber: WorldSpec = { ...world('moon'), aerosol: { ...world('moon').aerosol, density: 0.5, albedo: 0 } };
  const absorbed = render(absorber, 2);
  check('Pure absorption creates no sky glow', brightness(absorbed.top) === 0 && brightness(absorbed.side) === 0);
  const venus = render(world('venus'), 2, {}, true);
  check('Cloud diffusion lights Venus terrain despite extinguished direct beam', brightness(venus.ground) > 20);
  const uranus = render(world('uranus'), 2, {}, true);
  check('Methane suppresses red in Uranus sky', uranus.side[2] > uranus.side[0] + 10);
  const clearMethane = render(world('uranus'), 2, { absorptionOn: false });
  check('Absorption toggle changes the rendered spectrum', clearMethane.side[0] > uranus.side[0]);

  // Exercise every world and alternate control states with the production
  // uniform binding. Smaller frames keep this smoke sweep inexpensive.
  renderer.setSize(64, 40);
  for (const w of WORLDS) for (const elevation of [-15, 0, 85]) {
    render(w, elevation, { aerosolScale: elevation === 0 ? 4 : 0, absorptionOn: elevation !== 85, eyeAdapted: false });
  }
  check('All presets render without WebGL errors', gl.getError() === gl.NO_ERROR);
  check('Shaders compile and link', shaderErrors.length === 0);
} catch (error) {
  check(String(error), false);
} finally {
  renderer.dispose(); material.dispose(); dome.geometry.dispose();
  const result = { passed: checks.every(c => c.passed), checks, shaderErrors };
  (window as unknown as { skyRenderResults: typeof result }).skyRenderResults = result;
  document.querySelector('#results')!.textContent = checks.map(c => `${c.passed ? 'PASS' : 'FAIL'} ${c.name}`).join('\n');
  document.title = `${result.passed ? 'PASS' : 'FAIL'} — Skymuse rendered-colour checks`;
}
