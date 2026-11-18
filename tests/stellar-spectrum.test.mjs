import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {scienceModule} from './module.mjs';

const m = await scienceModule();
const reference = JSON.parse(await readFile(new URL('../docs/stellar-sky-audit/stellar-reference.json', import.meta.url)));
const earth = m.WORLDS.find(world => world.id === 'earth');

test('band-averaged PHOENIX templates reproduce full-resolution source photometry', () => {
  const hosts = m.WORLDS.filter(world => world.star.spectrum === 'phoenix');
  assert.equal(hosts.length, Object.keys(reference.models).length);
  for (const {star} of hosts) {
    // At sqrt(L/Lsun) AU every host delivers 1361 bolometric W/m².
    const orbit = Math.sqrt(m.stellarLuminosity(star));
    const spectrum = m.stellarSpectrum(star, orbit);
    const xyz = m.xyz(spectrum).map(value => value/1361);
    const ref = reference.models[star.tempK].referenceXYZPerBolometricWatt;
    assert.ok(spectrum.every(value => value >= 0 && Number.isFinite(value)));
    assert.ok(Math.abs(xyz[1]/ref[1] - 1) < .001, star.name + ' photopic efficacy');
    for (let c=0; c<3; c++) assert.ok(Math.abs(xyz[c]/ref[c]-1) < .01, star.name + ' tristimulus');
    const twiceAsFar = m.stellarSpectrum(star, 2*orbit);
    assert.ok(spectrum.every((value, i) => Math.abs(twiceAsFar[i]*4/value-1) < 1e-12));
  }
});

test('clear Earth direct beam is consistent with the ASTM G173 air mass 1.5 reference', () => {
  const world = {...earth, pressureBar:1.01325, ozoneDU:340,
    aerosol:{...earth.aerosol, density:.084 * (500/550)**earth.aerosol.angstrom}};
  const o = {sunElevDeg:41.81, sunAzDeg:0, aerosolScale:1, absorptionOn:true, eyeAdapted:false, exposure:1};
  const sky = m.computeSky(world, o);
  // Independent SMARTS direct + circumsolar reference integrated with 1 nm CIE Y.
  const beamLux = m.luminance(sky.directNormalRGB);
  assert.ok(Math.abs(beamLux/97142.25-1) < .025, String(beamLux));
  const centre = m.observerRayLookup(world).sample(m.direction(0,o.sunElevDeg));
  // Reference transmissions from ratios of the two ASTM spectra integrated in 10 nm bins.
  for (const [nm, reference] of [[440,.60100],[550,.73199],[680,.84659]]) {
    const direct = centre.focusing * Math.exp(-m.opticalDepth(sky.optics, (nm-360)/10, centre.columns));
    assert.ok(Math.abs(direct-reference) < .015, nm + ' nm transmission');
  }
});
