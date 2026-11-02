# Refraction verification

Recorded on 2026-11-02 after integrating spherical primary-ray refraction into transport, illumination, celestial rendering and the controls. These are numerical and rendering consistency checks, not measured planetary validation.

- The four `*.tap` files contain 51 individual passing checks: 23 atmospheric/spectral, 14 custom-world, 4 Earth dwarf and 10 refraction checks. Run each corresponding `tests/*.test.mjs` file directly to reproduce the individual TAP output, or run `npm test` for the suite.
- `render-checks.json` contains 15 checks from the production GPU shaders in `/tests/sky-render.html`, captured with Chrome/SwiftShader and floating-point targets. The horizon reference removes extinction deliberately to isolate refractive image shape and radiometry.
- `gallery.png` records that page, including the lifted, flattened reference stellar disc. Its white disc is a transparent-medium diagnostic, not an Earth sunset prediction.
- `preset-smoke.json` checks all 25 presets at −0.5° and +45° true stellar elevation. A small grid checks finite outputs and nonnegative spectral sky radiance; it does not establish convergence. Reproduce with `node docs/refraction-evidence/preset-smoke.mjs`.
- `ui-checks.json` records browser interactions with the refraction switch, true/apparent and occulted-centre telemetry, both habitable Earth dwarf presets, custom-editor starting points and mobile selection. `earth-ui.png` captures the app at true solar elevation 0° with refraction enabled.
- `build.txt` records the successful TypeScript and production build.

For the prescribed Earth profile, a true solar centre of 0° appears at +0.49245°. The rendered disc's vertical/horizontal ratio is 0.84076. Its integrated red-channel flux differs from incident-cap quadrature by 0.0397%; the resolved radiance includes the index-squared gain. The agreement checks two implementations of the same physical model and does not remove its profile, spectral or multiple-scattering approximations.

The older `science-fix-evidence` and `science-audit-evidence` results retain their original checkpoints. See [the model notes](../science-model.md#atmospheric-refraction) for the equations, primary sources and approximation limits.
