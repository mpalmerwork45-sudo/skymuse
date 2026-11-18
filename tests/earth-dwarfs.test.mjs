import assert from 'node:assert/strict';
import test from 'node:test';
import { scienceModule } from './module.mjs';

const m = await scienceModule();
const earth = m.WORLDS.find(world => world.id === 'earth');
const ids = ['earth-k-dwarf', 'earth-m-dwarf', 'earth-f-dwarf', 'earth-a-dwarf'];
const variants = ids.map(id => m.WORLDS.find(world => world.id === id));
const options = { sunElevDeg: 45, sunAzDeg: 90, aerosolScale: 1, absorptionOn: true, eyeAdapted: false, exposure: 1 };
const close = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);

test('Earth dwarf variants follow Earth in the catalogue and retain its physical atmosphere', () => {
  assert.deepEqual(m.WORLDS.slice(0, 1 + ids.length).map(world => world.id), ['earth', ...ids]);
  const earthSky = m.computeSky(earth, options);
  for (const world of variants) {
    assert.equal(world.group, 'Earth variants');
    assert.equal(world.provenance.status, 'Hypothetical atmosphere');
    for (const key of ['radiusKm', 'gravityMs2', 'pressureBar', 'molarMass', 'temperatureK', 'scaleHeightKm', 'ozoneDU', 'groundAlbedo']) {
      assert.equal(world[key], earth[key], key);
    }
    assert.deepEqual(world.gases, earth.gases);
    assert.deepEqual(world.aerosol, earth.aerosol);
    assert.deepEqual(world.clouds, earth.clouds);
    const s = m.computeSky(world, options);
    assert.deepEqual(s.tauR, earthSky.tauR);
    assert.deepEqual(s.tauA, earthSky.tauA);
  }
});

test('all comparison orbits receive 0.8 Earth irradiance and lie within conservative habitable-zone bounds', () => {
  for (const world of variants) {
    const s = m.computeSky(world, options), zone = world.habitableZone;
    close(s.fluxRel, .8);
    close(s.fluxWm2, 1088.8);
    assert.ok(world.distanceAU > zone.innerAU && world.distanceAU < zone.outerAU);
    assert.ok(s.fluxRel > zone.minFluxEarth && s.fluxRel < zone.maxFluxEarth);
    if (world.star.tempK < earth.star.tempK) assert.ok(zone.maxFluxEarth < 1);
  }
  assert.ok(variants[0].distanceAU > .46 && variants[0].distanceAU < .47);
  assert.ok(variants[1].distanceAU > .14 && variants[1].distanceAU < .15);
  const [, , f, a] = variants;
  assert.ok(f.star.radiusSun > earth.star.radiusSun && a.star.radiusSun > f.star.radiusSun);
  close(f.distanceAU, 2.121, .001);
  close(a.distanceAU, 3.930, .001);
  close(a.habitableZone.innerAU, 2.960, .001);
  close(a.habitableZone.outerAU, 5.000, .001);
  assert.ok(m.computeSky(a, options).starAngularDeg < m.computeSky(f, options).starAngularDeg);
  assert.ok(m.computeSky(variants[1], options).directLux < m.computeSky(variants[0], options).directLux);
});

test('habitable-zone calculation reproduces published solar limits without changing spectral calibration', () => {
  // At the polynomial reference temperature, choose R for exactly unit luminosity.
  const star = { tempK: 5780, radiusSun: (5772 / 5780) ** 2 };
  const zone = m.conservativeHabitableZone(star);
  close(zone.maxFluxEarth, 1.107);
  close(zone.minFluxEarth, .356);
  close(zone.innerAU, 1 / Math.sqrt(1.107));
  close(zone.outerAU, 1 / Math.sqrt(.356));
  const extended = m.conservativeHabitableZone(star, 'ramirez2018');
  close(extended.maxFluxEarth, 1.1105);
  close(extended.minFluxEarth, .3587);
  assert.equal(m.conservativeHabitableZone({ tempK: 10001, radiusSun: 2 }, 'ramirez2018'), undefined);
  assert.equal(m.conservativeHabitableZone({ tempK: 2500, radiusSun: .1 }), undefined);
  assert.equal(m.conservativeHabitableZone({ tempK: 7500, radiusSun: 2 }), undefined);
});

test('Earth comparison orbits are not overwritten by ephemerides or inherited by edited custom worlds', () => {
  for (const world of variants) {
    const a = m.observe(world, { date: '2026-11-02T12:00:00Z', latitude: 0, longitude: 0, mode: 'ephemeris' }, 12, 90);
    assert.equal(a.hasEphemeris, false);
    assert.equal(a.distanceAU, world.distanceAU);
    assert.equal(a.sunElevDeg, 12);
    assert.deepEqual(a.bodies, []);
    const draft = m.draftFromWorld(world);
    assert.equal(draft.starChoiceId, world.id);
    draft.distanceAU = '10';
    const custom = m.resolveCustomWorld(draft).world;
    assert.ok(custom);
    assert.equal(custom.habitableZone, undefined);
    assert.equal(custom.distanceAU, 10);
  }
});
