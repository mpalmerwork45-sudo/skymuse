# Verification of the spectral rewrite

These results describe the initial spectral rewrite, before the two Earth dwarf comparisons and atmospheric refraction were added. Later checks are in [`../refraction-evidence/`](../refraction-evidence/). The sibling `science-audit-evidence` directory is the preserved pre-fix baseline.

- `numerical-checks.tap`: direct Node test output from `node tests/atmosphere.test.mjs`.
- `render-checks.json`: 11 production-shader checks, including floating-point radiance and integrated angular flux, captured from `/tests/sky-render.html` in headless Chrome with SwiftShader.
- `gallery.png`: output from that same page. Images demonstrate behaviour; they do not establish measured planetary colour accuracy.
- `preset-smoke.json`: all 23 presets at −15° and +45° (46 cases), exercising transport and astronomy with a deliberately small integration grid. This checks finite outputs and valid geometry, not convergence.
- `ui-checks.json`: browser interaction through Earth, Moon, Venus, Saturn and WASP-12b, fisheye/cloud toggles and ephemeris controls. Desktop and mobile captures are included.

To reproduce: `npm test`, `npm run build`, then `npm run dev` and open `/tests/sky-render.html`. The browser page exposes `window.skyRenderResults` for automation. Use the app itself for world switching, worker completion, date/location and responsive-layout checks. No external services are needed at runtime; the data are bundled locally.
