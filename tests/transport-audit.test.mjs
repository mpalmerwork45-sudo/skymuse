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
