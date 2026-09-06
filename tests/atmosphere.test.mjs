import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

// Run the real TypeScript modules using the existing compiler, without adding
// a test framework or leaving generated files in the working tree.
async function sourceModule(path) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext },
  });
  const resolved = outputText.replace("from 'three'", `from '${import.meta.resolve('three')}'`);
  return import(`data:text/javascript;base64,${Buffer.from(resolved).toString('base64')}`);
}
const { computeSky, airMass, rayleighOD, columnFactor, absorptionOD } = await sourceModule('../src/science/atmosphere.ts');
const { WORLDS } = await sourceModule('../src/science/worlds.ts');
const { hexToLinear, createSkyMaterial, updateSkyUniforms } = await sourceModule('../src/three/skyShader.ts');
const earth = WORLDS.find(w => w.id === 'earth');
const moon = WORLDS.find(w => w.id === 'moon');
const options = { sunElevDeg: 45, sunAzDeg: 90, aerosolScale: 1, absorptionOn: true, eyeAdapted: true, exposure: 1 };
const sky = (w = earth, changes = {}) => computeSky(w, { ...options, ...changes });
const close = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);

test('Kasten–Young reference paths and monotonic horizon limit', () => {
  // Reference formula: pvlib.atmosphere.get_relative_airmass, Kasten–Young 1989.
  close(airMass(90), 0.99971199, 1e-8);
  close(airMass(30), 1.99429285, 1e-8);
  close(airMass(0), 37.91960838, 1e-8);
  let previous = 0;
  for (let e = 90; e >= -15; e -= 0.1) {
    const m = airMass(e);
    assert.ok(Number.isFinite(m) && m >= previous - 1e-9 && m <= 38);
    previous = m;
  }
  close(airMass(-15), airMass(0));
  assert.ok(sky(earth, { sunElevDeg: 0 }).sunPath > sky(earth, { sunElevDeg: 1 }).sunPath);
});

test('Earth calibration, hydrostatic column scaling, and lambda^-4', () => {
  const standard = { ...earth, pressureBar: 1.01325 };
  close(columnFactor(standard), 1);
  close(rayleighOD(standard).g, 0.099);
  close(columnFactor({ ...standard, pressureBar: 2.0265 }), 2);
  close(columnFactor({ ...standard, gravityMs2: 19.62 }), 0.5);
  close(columnFactor({ ...standard, molarMass: 57.94 }), 0.5);
  const od = rayleighOD(standard);
  close(od.b / od.r, (680 / 440) ** 4);
});

test('vacuum has no diffuse light and horizontal direct light follows sine of elevation', () => {
  const noon = sky(moon, { sunElevDeg: 90 });
  const low = sky(moon, { sunElevDeg: 2 });
  close(noon.lux, 133000);
  close(low.lux / noon.lux, Math.sin(2 * Math.PI / 180));
  for (const elevation of [-15, -6, 0, 2, 45, 90]) {
    const s = sky(moon, { sunElevDeg: elevation });
    close(s.downwell, 0);
    close(s.saturation550, 0);
    if (elevation <= 0) close(s.lux, 0);
    s.sunBeam.forEach((v, i) => close(v, s.starColor[i]));
  }
});

test('direct RGB retains absolute Beer–Lambert attenuation and stellar colour once', () => {
  const w = WORLDS.find(w => w.id === 'proxima-b');
  const s = sky(w, { sunElevDeg: 2 });
  ['r', 'g', 'b'].forEach((c, i) => close(s.sunBeam[i] / s.starColor[i], Math.exp(-s.tauT[c] * s.sunPath)));
  const horizon = sky(earth, { sunElevDeg: 0 });
  const noon = sky(earth, { sunElevDeg: 85 });
  assert.ok(horizon.sunBeam[2] / horizon.sunBeam[0] < noon.sunBeam[2] / noon.sunBeam[0]);
});

test('inverse-square stellar flux and surface light', () => {
  const a = sky(earth), b = sky({ ...earth, distanceAU: 2 });
  close(a.fluxWm2, 1361);
  close(a.fluxWm2 / b.fluxWm2, 4);
  close(a.lux / b.lux, 4);
});

test('stellar angular diameter uses sphere geometry and retains tiny distant stars', () => {
  const w = { ...moon, distanceAU: 696000 / (0.5 * 1.496e8) };
  close(sky(w).starAngularDeg, 60);
  close(sky(moon).starAngularDeg, 0.53312843, 1e-7);
  assert.ok(sky(WORLDS.find(w => w.id === 'pluto')).starAngularDeg < 0.014);
});

test('fixed camera has no hidden sunset exposure adjustment', () => {
  for (const e of [85, 2, 0, -6, -12, -15]) {
    const s = sky(earth, { sunElevDeg: e, eyeAdapted: false, exposure: 1.7 });
    close(s.adaptGain, 1);
    close(s.exposureFinal, 1.7);
  }
});

test('GPU binding preserves horizon paths, faint beams, and small stellar discs', () => {
  const { uniforms, material } = createSkyMaterial();
  for (const id of ['earth', 'venus', 'pluto', 'mars']) {
    const w = WORLDS.find(w => w.id === id);
    const s = sky(w, { sunElevDeg: 0 });
    updateSkyUniforms(uniforms, w, s);
    close(uniforms.uSunPath.value, airMass(0));
    close(uniforms.uTwilight.value, s.twilightLight);
    close(uniforms.uSunAngRad.value, s.starAngularDeg * Math.PI / 360);
    assert.deepEqual(uniforms.uSunBeam.value.toArray(), s.sunBeam);
  }
  material.dispose();
});

test('twilight attenuation is shared with diffuse telemetry and fades monotonically', () => {
  const horizon = sky(earth, { sunElevDeg: 0 });
  let last = Infinity;
  for (let e = 85; e >= -15; e -= 0.25) {
    const s = sky(earth, { sunElevDeg: e });
    assert.ok(s.lux <= last + 1e-8);
    if (e < 0) close(s.downwell / horizon.downwell, s.twilightLight);
    last = s.lux;
  }
});

test('absorption does not create scatterers or a diffuse source', () => {
  const absorber = { ...moon, ch4: 1 };
  close(sky(absorber).downwell, 0);
  close(sky(absorber).saturation550, 0);
  const blackDust = { ...moon, aerosol: { ...moon.aerosol, density: 1, albedo: 0 } };
  close(sky(blackDust).downwell, 0);
  close(sky(blackDust).saturation550, 0);
  close(sky(earth).saturation550, sky(earth, { absorptionOn: false }).saturation550);
  assert.deepEqual(absorptionOD(earth, false), { r: 0, g: 0, b: 0 });
});

test('fictional sodium colour remains continuous through 15 degrees', () => {
  const w = WORLDS.find(w => w.id === 'arrakis');
  const a = sky(w, { sunElevDeg: 15 - 1e-6 });
  const b = sky(w, { sunElevDeg: 15 + 1e-6 });
  a.sunTint.forEach((v, i) => close(v, b.sunTint[i], 1e-6));
});

test('hex colours undergo exactly one sRGB-to-linear conversion', () => {
  const c = hexToLinear('#808080');
  close(c.r, 0.2158605001, 1e-9);
  close(c.g, c.r); close(c.b, c.r);
});

test('all catalogue worlds remain finite through supported controls', () => {
  const finite = v => {
    if (typeof v === 'number') assert.ok(Number.isFinite(v));
    else if (v && typeof v === 'object') Object.values(v).forEach(finite);
  };
  for (const w of WORLDS) for (const e of [-15, -12, -6, -0.01, 0, 0.01, 1, 2, 15, 45, 85]) {
    for (const aerosolScale of [0, 1, 4]) for (const absorptionOn of [false, true]) {
      const s = sky(w, { sunElevDeg: e, aerosolScale, absorptionOn });
      finite(s);
      assert.ok(s.lux >= 0 && s.downwell >= 0 && s.adaptGain >= 0.03 && s.adaptGain <= 60);
      s.sunBeam.forEach(v => assert.ok(v >= 0 && v <= 1));
    }
  }
});
