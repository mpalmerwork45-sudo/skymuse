# Reflected companion illumination verification

Recorded on 2026-11-02 after adding moonlight/planetshine to spectral atmospheric transfer and ground lighting. These tests check internal physical consistency; the companion materials and atmospheric profiles remain assumed.

- `lighting.tap`: seven additional numerical tests, including independent projected-disc integration at four phases, scaling laws, parent and mutual shadows, airless ground illumination, directional sky superposition and counting thermal emission once. The full suite now has 58 numerical checks; `suite.txt` records its run. The previous 51 individual checks are recorded in `../refraction-evidence/`.
- `render-checks.json`: all 19 production GPU checks pass. Reflected sphere flux is checked against both the equivalent Lambert illuminant and independent finite-sphere integration. Surface pixels are checked against independent ray/sphere normals. Sky glow follows the companion's azimuth, and reflected light reaches night terrain.
- `gallery.png`: the browser harness scene gallery. `moonlit-ground.png` and `moonlit-fisheye.png` show the actual app, rather than only the test page.
- `ui-checks.json`: a known Earth/Moon geometry with a manually positioned star at −80°. The Moon is near +82.3° elevation. Its modeled direct horizontal illumination is 0.204 lx; diffuse illumination is 0.0275 lx, for 0.2311 lx total. This is a diagnostic manual configuration, not the real solar position at that date.
- `preset-smoke.json`: all 25 presets at −20° and +45°, with their astronomical companions passed through reflected illumination and transport. Checks finite outputs, nonnegative spectral sky radiance and consistent direct/diffuse totals at low resolution. Reproduce with `node docs/companion-evidence/preset-smoke.mjs`.
- `build.txt`: successful TypeScript and production build.

At the recorded resolution, the reference companion's integrated red-channel flux is within 0.05% of direct finite-sphere integration. The far-field Lambert illumination approximation differs by about 0.47%, mostly the finite-distance correction explicitly omitted from the illumination formula. Calculating normals relative to the body centre avoids loss of precision when subtracting distant sphere-intersection positions.

Run `npm test`, `npm run build`, then open `/tests/sky-render.html` on the dev server. The page exposes `window.skyRenderResults`. For the app capture, use Earth, manual geometry, UTC 2026-10-30 06:00, latitude +20°, longitude −35°, stellar elevation −80°, azimuth 174°, refraction enabled and default atmospheric controls. Allow display adaptation to settle. Model equations, primary sources and limitations are in [the model notes](../science-model.md#moonlight-and-planetshine).
