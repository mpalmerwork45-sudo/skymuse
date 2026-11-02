import assert from 'node:assert/strict';
import test from 'node:test';
import { scienceModule } from './module.mjs';

const m = await scienceModule();
const world = id => m.WORLDS.find(w => w.id === id);
const profile = w => ({ ...m.atmosphereGeometry(w), refractiveQ0: m.gasLorentzFactor(w) });
const close = (actual, expected, tolerance) => assert.ok(Math.abs(actual-expected) < tolerance, `${actual} != ${expected} ± ${tolerance}`);

test('reference refractivity follows composition and ideal molecular density', () => {
  const base = { pressureBar: 1.01325, temperatureK: 273.15, gases: { n2: 1 } };
  const q = m.gasLorentzFactor(base);
  const g = { ...profile(world('earth')), refractiveQ0: q };
  close(m.refractiveIndex(g,0),1.0002971,1e-12);
  close(m.gasLorentzFactor({...base,pressureBar:2.0265}),2*q,1e-15);
  close(m.gasLorentzFactor({...base,temperatureK:546.3}),q/2,1e-15);
  assert.equal(m.gasLorentzFactor({...base,pressureBar:0}),0);
  assert.equal(m.gasLorentzFactor({...base,gases:{}}),0);
  assert.ok(m.gasLorentzFactor({...base,gases:{co2:1}})>q);
  assert.ok(m.gasLorentzFactor({...base,gases:{he:1}})<q/5);
});

test('spherical radial quadrature reduces to the straight-ray solution in vacuum', () => {
  const g = {...profile(world('earth')),refractiveQ0:0},p=[0,g.radius+.0017,0];
  for(const elevation of [-.03,0,.1,1,30,90]) {
    const dir=m.direction(90,elevation),ray=m.traceRefractedRay(g,p,dir,128);
    assert.equal(ray.ground,false);
    close(m.dot(ray.exitDirection,dir),1,1e-11);
    const outer=m.sphereHit(p,dir,g.radius+g.top);
    close(ray.distance,outer,.002);
    const expected=m.add(p,m.scale(dir,outer));
    close(m.length(m.sub(ray.exitPoint,expected)),0,.003);
  }
  assert.equal(m.traceRefractedRay(g,p,[0,-1,0]).ground,true);
});

test('Bouguer invariant and unit direction are preserved along every curved ray segment', () => {
  for(const id of ['earth','titan','neptune','venus']) {
    const g=profile(world(id)),p=[0,g.radius+.0017,0];
    for(const elevation of [0,1,10,60,90]) {
      const ray=m.traceRefractedRay(g,p,m.direction(80,elevation),96);
      assert.ok(Number.isFinite(ray.distance) && ray.distance>0);
      for(const node of ray.nodes) {
        close(m.length(node.direction),1,1e-12);
        const value=m.refractiveIndex(g,node.h)*m.length(m.cross(node.p,node.direction));
        close(value,ray.invariant,1e-7);
        assert.ok(node.samples.every(sample=>Number.isFinite(sample.ds)&&sample.ds>=0&&sample.height>=-1e-8));
      }
    }
  }
});

// Independent Cartesian RK4 integration of d(n d)/ds = grad n. This does not
// use the radial quadrature or its invariant to advance the trajectory.
function cartesianExit(g,elevation) {
  let p=[0,g.radius+.0017,0],d=m.direction(90,elevation);
  const outer=g.radius+g.top;
  const derivative=(p,d)=>{
    const up=m.unit(p),grad=m.scale(up,m.refractiveGradient(g,m.length(p)-g.radius));
    return {p:d,d:m.sub(grad,m.scale(d,m.dot(d,grad)))};
  };
  for(let step=0;step<50000;step++) {
    const remaining=outer-m.length(p);
    if(remaining<1e-8)return d;
    const ds=Math.min(g.gasH/40,1,remaining/Math.max(.02,m.dot(m.unit(p),d)));
    const a=derivative(p,d),b=derivative(m.add(p,m.scale(a.p,ds/2)),m.add(d,m.scale(a.d,ds/2)));
    const c=derivative(m.add(p,m.scale(b.p,ds/2)),m.add(d,m.scale(b.d,ds/2)));
    const e=derivative(m.add(p,m.scale(c.p,ds)),m.add(d,m.scale(c.d,ds)));
    p=m.add(p,m.scale(m.add(m.add(a.p,m.scale(m.add(b.p,c.p),2)),e.p),ds/6));
    d=m.unit(m.add(d,m.scale(m.add(m.add(a.d,m.scale(m.add(b.d,c.d),2)),e.d),ds/6)));
  }
  throw Error('RK4 integration did not reach the boundary');
}

test('radial refraction agrees with independent Cartesian integration', () => {
  for(const id of ['earth','titan']) {
    const g=profile(world(id)),p=[0,g.radius+.0017,0];
    for(const elevation of [0,1,10,30,60]) {
      const expected=cartesianExit(g,elevation),actual=m.traceRefractedRay(g,p,m.direction(90,elevation),128).exitDirection;
      close(m.length(m.sub(actual,expected)),0,2e-7);
    }
  }
});

test('Earth refraction lifts horizon sources and approaches the plane-parallel limit at altitude', () => {
  const g=profile(world('earth')),p=[0,g.radius+.0017,0];
  const horizon=m.traceRefractedRay(g,p,[1,0,0],192);
  assert.ok(horizon.geometricElevation/m.DEG<-.4&&horizon.geometricElevation/m.DEG>-.8);
  const high=m.traceRefractedRay(g,p,m.direction(90,30),128);
  const correction=(30*m.DEG-high.geometricElevation)*180/Math.PI*60;
  assert.ok(correction>1.4&&correction<1.9,`30° correction ${correction} arcmin`);
  const zenith=m.traceRefractedRay(g,p,[0,1,0],64);
  close(zenith.geometricElevation,Math.PI/2,1e-12);
});

test('strong refractive gradients produce returning rays without a fabricated celestial horizon', () => {
  const g=profile(world('venus')),p=[0,g.radius+.0017,0];
  assert.ok(m.criticalRadius(g)>g.radius);
  assert.ok(m.minimumEscapeElevation(g,m.length(p))>0);
  const trapped=m.traceRefractedRay(g,p,[1,0,0],128);
  assert.equal(trapped.ground,true);
  close(m.length(trapped.exitPoint),g.radius,1e-8);
  assert.equal(m.traceRefractedRay(g,p,[0,1,0],128).ground,false);
});
