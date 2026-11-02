> Historical evidence: these measurements and reproduction scripts target baseline commit `648e2d6`, before the spectral rewrite. For current checks, see `../science-fix-evidence/README.md`.

# Evidence for the science and authenticity audit

These files accompany [the audit](../science-authenticity-audit.md) of commit `648e2d6`. Captured 30 October 2026 UTC. Only documentation and audit artifacts were added; the application's implementation and tests were not changed.

`numerical.json` records actual CPU model outputs. `browser.json` records the existing browser suite's results, diagnostic pixel values, raw stellar-disc samples, and image equality checks. `spectral.json` records independent reference calculations. `gallery.png` shows the production sky shader; `*-ui.png` files show the actual application. Individual preset images use the filename `<world>-<elevation>.png`; a negative elevation therefore has two adjacent hyphens.

All ordinary gallery panels use exposure 1, Human eye mode, default aerosol amount, absorption enabled, Sun azimuth 90°, 60° vertical FOV, and a fixed 640×400 raster. Camera pitch is 25° for Sun elevations above 10° and 3° otherwise. Shader time is fixed at zero. The artificial opaque-absorber panel uses fixed exposure 1, camera pitch 45°, and heading 0°. Its image equals a vacuum image at the same settings despite optical depth 100; the output contains 1,237 nonblack pixels, so the equality is not merely two blank images.

The floating-point disc experiment bypasses only the final display transform in a diagnostic material. It uses an airless scene, the same Sun at different distances, a centred 0.001° camera FOV, and a 65×65 float target. The reliable 1-AU/2-AU comparison gives raw central red values 750 and 187.5. More distant samples include additional angular/rasterization losses and should not be interpreted as exact inverse-square ratios.

Run from the repository root with dependencies already installed:

```bash
npm test
npm run build
node docs/science-audit-evidence/measure-model.mjs
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

In another terminal, run the browser capture with an installed Playwright-compatible package and Chrome. The original audit used the existing local Playwright package and Google Chrome, with SwiftShader software rendering. The harness uses no application instrumentation or source changes. It overwrites the evidence images/JSON when rerun.

```bash
SKYMUSE_PLAYWRIGHT_PATH=/path/to/playwright/package \
SKYMUSE_CHROME_PATH=/usr/bin/google-chrome \
node docs/science-audit-evidence/capture-renders.cjs
```

The audit machine's package was `/home/mpalmer/.cache/ms-playwright-go/1.57.0/package`. `SKYMUSE_AUDIT_URL` optionally changes the server URL. GPU/browser changes may affect individual pixels; use the physical relationships and counterexamples, not exact PNG hashes, as future regression criteria.

For the independent spectral calculation, download the [CIE photopic dataset](https://cie.co.at/datatable/cie-spectral-luminous-efficiency-photopic-vision) and the [reference atmospheric implementation's demo data](https://ebruneton.github.io/precomputed_atmospheric_scattering/atmosphere/demo/demo.cc.html):

```bash
curl -fsSL https://files.cie.co.at/Publications-datasets/CIE_sle_photopic.csv -o /tmp/skymuse-cie-photopic.csv
curl -fsSL https://raw.githubusercontent.com/ebruneton/precomputed_atmospheric_scattering/master/atmosphere/demo/demo.cc -o /tmp/skymuse-bruneton-demo.cc
python3 docs/science-audit-evidence/spectral-check.py /tmp/skymuse-cie-photopic.csv /tmp/skymuse-bruneton-demo.cc
```

The CIE file's verified MD5 is `f389958555461a7d9a7562145e8ca9c0`, matching the publisher. The reference's ozone cross-sections at 680/550/440-nm bins are `1.209e-25`, `3.5e-25`, and `1.582e-26` m². These are 10-nm averages at 233 K derived from [Bremen's measured spectra](https://www.iup.uni-bremen.de/gruppen/molspec/databases/referencespectra/o3spectra2011/index.html). They are combined with 300 Dobson units for an illustrative Earth comparison. The scripts contain evidence calculations, not proposed fixes or a replacement atmospheric solver.
