import assert from 'node:assert/strict';
import test from 'node:test';
import {scienceModule} from './module.mjs';

const model = await scienceModule();
const close = (actual, expected, tolerance) =>
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} vs ${expected}`);

test('an isothermal layer emits its absorptivity times blackbody flux on each side', () => {
  for (const depth of [0.001, 1, 3, 10, 100]) {
    for (const albedo of [0, 0.3, 0.99]) {
      // Normalise the isotropic equilibrium flux pi B to 1. Kirchhoff's law
      // then requires layer emission = 1 - reflection - transmission.
      const source = 2 * depth * (1 - albedo);
      const layer = model.emittingLayer(depth, albedo, 0.7, source, source);
      const expected = 1 - layer.r - layer.t;
      close(layer.up, expected, 1e-12);
      close(layer.down, expected, 1e-12);
    }
  }
});

test('a uniformly distributed anisotropic source is invariant under layer subdivision', () => {
  for (const albedo of [0, 0.7, 1]) {
    const depth = 5, count = 64;
    const whole = model.emittingLayer(depth, albedo, 0.3, 0.2, 0.8);
    const sublayer = model.emittingLayer(depth/count, albedo, 0.3, 0.2/count, 0.8/count);
    const divided = model.solveLayers(Array(count).fill(sublayer), 0, 0);
    close(whole.up, divided.up[count], 1e-12);
    close(whole.down, divided.down[0], 1e-12);
  }
});

test('thin cloud optical depth agrees on viewing, observer and atmospheric illumination rays', () => {
  const earth=model.WORLDS.find(w=>w.id==='earth');
  const height=.0017, centre=12, sigma=.1;
  const world={...earth, clouds:{...earth.clouds,opticalDepth:1,centreKm:centre,sigmaKm:sigma}};
  const origin=[0,earth.radiusKm+height,0];
  for(const refraction of [false,true]){
    const geometry=model.atmosphereGeometry(world,refraction);
    close(model.pathColumns(geometry,origin,[0,1,0],48)[3],1,2e-6);
    close(model.observerRayLookup(world,height,refraction).sample([0,1,0]).columns[3],1,2e-6);
    // Incident paths begin inside the layer too. Exactly half of the
    // normalised Gaussian is above its centre at this height.
    const table=new model.ColumnLookup(geometry,24,32);
    close(table.sample([0,earth.radiusKm+centre,0],[0,1,0])[3],.5,.002);
  }
  // A straight ray crosses an infinitesimally thin spherical shell at
  // radial cosine sqrt(1-b²/r²), giving the analytic slant column.
  const angle=15*model.DEG,impact=(earth.radiusKm+height)*Math.cos(angle);
  const slant=1/Math.sqrt(1-(impact/(earth.radiusKm+centre))**2);
  close(model.pathColumns(model.atmosphereGeometry(world,false),origin,model.direction(0,15),48)[3],slant,.002);
});

test('zenith sky preserves each incident stellar spectrum in the thin Rayleigh limit', () => {
  const earth=model.WORLDS.find(w=>w.id==='earth');
  const options={sunElevDeg:90,sunAzDeg:0,exposure:1,eyeAdapted:false,absorptionOn:false,aerosolScale:0};
  const quality={width:4,height:4,steps:48,layers:32,discSamples:8};
  for(const id of ['earth','earth-k-dwarf','earth-m-dwarf','earth-f-dwarf','earth-a-dwarf']){
    const {star,distanceAU}=model.WORLDS.find(w=>w.id===id);
    const world={...earth,star,distanceAU,pressureBar:.0001,groundAlbedo:0};
    const sky=model.computeSky(world,options), output=model.computeTransport(world,options,quality);
    // For coincident vertical view and stellar beams every single scatter
    // traverses the same total optical depth. For the adopted thin column,
    // higher orders and the finite stellar cap affect this at sub-percent level.
    const vertical=Math.exp(-.0017/earth.scaleHeightKm)-Math.exp(-12);
    const expected=model.rgb(sky.spectrum.map((e,i)=>{
      const tau=vertical*sky.optics.rayleigh[i];
      return e*(3/(8*Math.PI))*tau*Math.exp(-tau);
    }));
    const zenith=4*quality.width*(quality.height-1);
    for(let c=0;c<3;c++)close(output.radiance[zenith+c]/expected[c],1,.003);
  }
});

test('straight incident rays retain their geometric angle and horizon inside the atmosphere', () => {
  const earth=model.WORLDS.find(w=>w.id==='earth');
  const geometry=model.atmosphereGeometry(earth,false);
  const table=new model.ColumnLookup(geometry,24,64);
  for(const altitude of [1,5,80]){
    const observer=[0,earth.radiusKm+altitude,0];
    const horizon=-Math.acos(earth.radiusKm/observer[1])/model.DEG;
    const visible=model.direction(90,horizon+.03);
    const incoming=table.sampleLight(observer,visible);
    assert.ok(incoming);
    close(model.length(model.sub(visible,incoming.direction)),0,1e-12);
    assert.equal(table.sampleLight(observer,model.direction(90,horizon-.03)),null);
  }
});
