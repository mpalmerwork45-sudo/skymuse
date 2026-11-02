import assert from 'node:assert/strict';
import test from 'node:test';
import { scienceModule } from './module.mjs';

const m = await scienceModule();
const earth = m.WORLDS.find(world => world.id === 'earth');
const initial = () => m.draftFromWorld(earth);
const build = draft => {
  const result = m.resolveCustomWorld(draft);
  assert.ok(result.world, JSON.stringify(result.errors));
  return result.world;
};
const relative = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual / expected - 1) < tolerance, `${actual} != ${expected}`);
const options = { sunElevDeg: 45, sunAzDeg: 90, aerosolScale: 1, absorptionOn: true, eyeAdapted: false, exposure: 1 };

test('every preset is a valid starting point, including airless and giant worlds', () => {
  for (const world of m.WORLDS) {
    const custom = build(m.draftFromWorld(world));
    assert.equal(custom.id, 'custom');
    assert.equal(custom.provenance.status, 'Custom scenario');
    assert.ok(Number.isFinite(custom.scaleHeightKm) && custom.scaleHeightKm > 0);
  }
});

test('customisation leaves the original preset intact and removes its named satellites/rings', () => {
  const saturn = m.WORLDS.find(world => world.id === 'saturn');
  const original = JSON.stringify(saturn);
  const draft = m.draftFromWorld(saturn);
  draft.distanceAU = '3';
  const custom = build(draft);
  const a = m.observe(custom, { date: '2026-11-02T12:00:00Z', latitude: 20, longitude: 0, mode: 'ephemeris' }, 12, 90);
  assert.equal(JSON.stringify(saturn), original);
  assert.equal(custom.rings, false);
  assert.deepEqual(a.bodies, []);
  assert.equal(a.hasEphemeris, false);
  assert.equal(a.distanceAU, 3);
  assert.equal(a.sunElevDeg, 12);
  relative(m.length(a.observerEQJ), 3);
});

test('choosing orbital distance changes irradiance and stellar size through the real sky model', () => {
  const draft = initial(); draft.distanceAU = '1';
  const a = m.computeSky(build(draft), options);
  draft.distanceAU = '2';
  const b = m.computeSky(build(draft), options);
  relative(a.fluxWm2 / b.fluxWm2, 4);
  relative(a.starAngularDeg / b.starAngularDeg, 2, .00001);
  assert.ok(a.directLux > b.directLux * 3.99);
});

test('density input gives the nitrogen STP reference and changes the optical column', () => {
  const draft = initial();
  draft.gases = m.percentagesFromMix({ n2: 1 });
  draft.temperatureK = '273.15';
  draft.pressureBar = '1.01325';
  const result = m.resolveCustomWorld(draft);
  // Nitrogen density at STP ≈1.25 kg/m³; ideal-gas versus real-gas difference is small here.
  relative(result.densityKgM3, 1.25, .002);
  const a = build(draft);
  const densityDraft = m.changeDensityMode(draft, 'density');
  relative(build(densityDraft).pressureBar, a.pressureBar);
  densityDraft.densityKgM3 = String(Number(densityDraft.densityKgM3) * 2);
  const b = build(densityDraft);
  relative(b.pressureBar, a.pressureBar * 2);
  relative(m.computeSky(b, options).tauR.g, m.computeSky(a, options).tauR.g * 2);
  relative(b.scaleHeightKm, a.scaleHeightKm);
});

test('temperature has the correct independent effect in pressure and density modes', () => {
  const draft = initial(); draft.temperatureK = '200';
  const first = m.resolveCustomWorld(draft);
  const densityDraft = m.changeDensityMode(draft, 'density');
  draft.temperatureK = '400'; densityDraft.temperatureK = '400';
  const atPressure = m.resolveCustomWorld(draft), atDensity = m.resolveCustomWorld(densityDraft);
  assert.ok(atPressure.world && atDensity.world);
  relative(atPressure.pressureBar, first.pressureBar);
  relative(atPressure.densityKgM3, first.densityKgM3 / 2);
  relative(atDensity.pressureBar, first.pressureBar * 2);
  relative(atDensity.densityKgM3, first.densityKgM3);
  relative(atPressure.scaleHeightKm, first.scaleHeightKm * 2);
});

test('gas composition consistently changes molecular mass, density, scale height and scattering', () => {
  const draft = initial();
  draft.gases = m.percentagesFromMix({ n2: 1 });
  const nitrogen = m.resolveCustomWorld(draft);
  draft.gases = m.percentagesFromMix({ co2: 1 });
  const carbon = m.resolveCustomWorld(draft);
  assert.ok(nitrogen.world && carbon.world);
  relative(nitrogen.molarMass, 28.0134);
  relative(carbon.molarMass, 44.0095);
  relative(carbon.densityKgM3 / nitrogen.densityKgM3, 44.0095 / 28.0134);
  relative(carbon.scaleHeightKm / nitrogen.scaleHeightKm, 28.0134 / 44.0095);
  relative(m.computeSky(carbon.world, options).tauR.g / m.computeSky(nitrogen.world, options).tauR.g, 1.464, .001);
});

test('custom stars use their own spectrum even if a user names one Sol', () => {
  const draft = initial();
  draft.starChoiceId = 'custom'; draft.starName = 'Sol'; draft.starTempK = '3000'; draft.starRadiusSun = '.2';
  const custom = build(draft);
  assert.equal(custom.star.spectrum, 'blackbody');
  relative(custom.star.luminosity, .2 ** 2 * (3000 / 5772) ** 4);
  const s = m.computeSky(custom, options);
  const efficacy = m.xyz(s.spectrum)[1] / s.fluxWm2;
  assert.ok(efficacy > 15 && efficacy < 30);
});

test('known stellar choices preserve the catalogue observer host when the planet is custom', () => {
  const draft = initial(); draft.starChoiceId = 'trappist-1e'; draft.distanceAU = '.05';
  const custom = build(draft);
  assert.equal(custom.star.name, 'TRAPPIST-1');
  assert.equal(custom.star.catalogueHost, 'TRAPPIST-1');
  draft.starChoiceId = 'sol';
  assert.equal(build(draft).star.catalogueHost, undefined);
});

test('invalid atmospheres and overlapping orbits cannot reach the renderer', () => {
  for (const pressureBar of ['', '-1', 'Infinity', 'NaN', '301']) {
    const result = m.resolveCustomWorld({ ...initial(), pressureBar });
    assert.equal(result.world, undefined);
    assert.ok(result.errors.pressureBar);
  }
  const draft = initial(); draft.gases.n2 = '50';
  assert.ok(m.resolveCustomWorld(draft).errors.composition);
  draft.gases = m.percentagesFromMix({});
  assert.ok(m.resolveCustomWorld(draft).errors.composition);
  const overlap = m.resolveCustomWorld({ ...initial(), distanceAU: '.001' });
  assert.equal(overlap.world, undefined);
  assert.ok(overlap.errors.distanceAU);
});

test('normalizing arbitrary positive gas proportions produces a usable mixture', () => {
  const draft = initial(); draft.gases = { ...m.percentagesFromMix({}), n2: '4', o2: '1' };
  assert.equal(m.resolveCustomWorld(draft).world, undefined);
  draft.gases = m.normalizePercentages(draft.gases);
  const custom = build(draft);
  relative(custom.gases.n2, .8); relative(custom.gases.o2, .2);
  assert.equal(m.normalizePercentages(m.percentagesFromMix({})), null);
});

test('zero density means vacuum, including no leftover haze, ozone or clouds', () => {
  const draft = m.draftFromWorld(m.WORLDS.find(world => world.id === 'venus'));
  draft.densityMode = 'density'; draft.densityKgM3 = '0';
  const custom = build(draft);
  assert.equal(custom.pressureBar, 0);
  assert.equal(custom.aerosol.density, 0);
  assert.equal(custom.ozoneDU, 0);
  assert.equal(custom.clouds.opticalDepth, 0);
  const s = m.computeSky(custom, options);
  assert.equal(s.tauT.g, 0);
  const t = m.computeTransport(custom, options, { width: 8, height: 8, steps: 32, layers: 64, discSamples: 16 });
  assert.equal(t.diffuseLux, 0);
  assert.ok(t.radiance.every(Number.isFinite));
});

test('saved custom settings round-trip and malformed or stale browser data are rejected', () => {
  const draft = initial(); draft.name = 'My planet'; draft.starChoiceId = 'proxima-b';
  assert.deepEqual(m.parseCustomWorldDraft(JSON.stringify(draft)), draft);
  for (const raw of [null, '', '{}', '{', 'null', '[]', JSON.stringify({ ...draft, version: 99 }),
    JSON.stringify({ ...draft, gases: null }), JSON.stringify({ ...draft, pressureBar: '-2' }),
    JSON.stringify({ ...draft, starChoiceId: 'no-such-star' })]) {
    assert.equal(m.parseCustomWorldDraft(raw), null);
  }
});

test('custom surface tints retain the requested reflected energy, including black and saturated colours', () => {
  const incoming = m.xyz(m.SOLAR)[1];
  for (const colour of ['#000000', '#0000ff', '#ff0000', '#ffffff']) {
    for (const albedo of [.1, .8, 1]) {
      const rho = m.reflectance(colour, albedo);
      assert.ok(rho.every(value => value >= 0 && value <= 1));
      const reflected = m.xyz(Float64Array.from(m.SOLAR, (e, i) => e * rho[i]))[1];
      relative(reflected / incoming, albedo, 1e-7);
    }
  }
});
