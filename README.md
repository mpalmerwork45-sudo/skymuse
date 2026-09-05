# Skymuse — Planetary Sky Simulator

Interactive 3D WebGL/Three.js app that renders how the sky looks from the
surface of planets, moons, exoplanets, and sci-fi worlds — grounded in
atmospheric radiative transfer and human visual perception
(NASA Planetary Spectrum Generator spirit).

## Run it

```bash
npm install
npm run dev
```

Open the printed local URL (default http://localhost:5173) in a browser.

Other commands: `npm run build` (typecheck + production bundle), `npm run preview`.

## How it works

- `src/science/worlds.ts` — 24-world catalog: star, orbit, pressure, scale
  height, gravity, molar mass, gas mix, aerosols, CH₄/O₃ absorption,
  cloud-deck albedo, surface geology, rings, moons.
- `src/science/atmosphere.ts` — CPU radiative transfer shared by telemetry
  and pixels: zenith optical depth at 680/550/440 nm, Rayleigh 1/λ⁴ scaled
  by gas polarizability (CO₂ ≈ 2.3× N₂), Henyey–Greenstein Mie aerosols,
  CH₄ red absorption + O₃ Chappuis bands, multi-scatter saturation
  S(τ) = τ/(1+cτ), Eddington-style surface downwelling, stellar 1/r² flux,
  lux estimate, and logarithmic human retinal adaptation gain.
- `src/three/skyShader.ts` — full-dome GLSL: single + multi-scattering fill
  over the whole 360° hemisphere, overcast gloom mixing, sun disc sized from
  stellar radius/distance, night starfield, single-pass terrain with an
  fwidth anti-aliased horizon (crisp for rock, diffuse for gas-giant decks),
  ACES tone mapping.
- `src/three/SkyView.tsx` — surface observer viewport (drag-look, wheel
  zoom, fisheye), Saturn's ring ribbon + Cassini Division, moon companions.
- `src/ui/controls.tsx` — world picker, solar ephemeris (elevation/azimuth +
  sunrise/sunset animation), human-eye vs fixed-camera, aerosol/absorption/
  exposure controls, heading/pitch HUD, collapsible telemetry deck.

Defaults honor the brief: East-facing (090°) dawn view at +2° sun elevation
on load and on every world switch; human-eye adaptation on; absorption on.
