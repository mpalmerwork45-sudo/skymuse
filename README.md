# Skymuse — Planetary Sky Simulator

Explore 25 planetary, lunar, exoplanet and fictional skies using spectral atmospheric transport, a catalogue starfield and physical viewing geometry.

The current model integrates 48 visible wavelength bands using CIE colour matching functions. It combines spherical single scattering, approximate hemispheric multiple scattering, finite stellar discs, measured methane/ozone absorption data, a reflecting lower boundary, and one photometric display pipeline. Real-world weather and exoplanet atmospheres are generally assumed. “Adapted display” is an SDR viewing approximation, not a calibrated reproduction of human vision.

Read the [model specification, audit changes, sources and remaining limitations](docs/science-model.md). The [original audit](docs/science-authenticity-audit.md) and its evidence describe the pre-fix implementation.

## Run

```bash
npm install
npm run dev
```

Open the printed URL. Drag to look and scroll to zoom. Manual mode controls stellar elevation and azimuth; date/location mode calculates Solar System geometry. Latitude changes the visible orientation of Saturn's rings. Cloud, dust and absorption controls alter the physical column; changes recalculate in a worker.

The initial scene is Earth at a manually selected +2° stellar elevation. Observation coordinates are planetocentric latitude and east longitude on a spherical reference surface. Saturn opens at 20° latitude; at the equator its idealized thin rings are edge-on. Giant-planet boundaries represent cloud levels, not solid ground.

## Earth around cooler stars

The world picker nests **Earth with K Dwarf** and **Earth with M Dwarf** directly beneath **Earth**. These comparison presets preserve Earth's atmosphere and surface while replacing the Sun with representative K5V (4440 K, 0.701 solar radii) and M3V (3430 K, 0.361 solar radii) stars. Their distances are approximately 0.464 AU and 0.143 AU.

Both receive 80% of Earth's bolometric stellar irradiance and lie inside the conservative one-Earth-mass habitable-zone limits of Kopparapu et al. (2014). The **Physics** readout shows each zone. They are hypothetical scenarios with prescribed Earthlike conditions; no equilibrium climate or actual habitability is inferred. Full sources and equations are in the [model notes](docs/science-model.md#earth-comparisons-around-k-and-m-dwarfs).

## Custom worlds

Click **Customise** to start from any preset. Choose a catalogue star or define a custom star by temperature and radius, set its distance in AU, and edit the planet’s radius, gravity and temperature.

The atmosphere accepts gas percentages by volume and either surface pressure in bar or gas density in kg/m³. Percentages must total 100%; mixture presets and **Normalize to 100%** help balance them. Molecular mass, the other pressure/density quantity, and hydrostatic scale height are calculated together. Set pressure or density to zero for an airless world. Advanced controls cover haze, clouds, ozone, surface colour and albedo.

**Apply world** recalculates the sky and saves one custom world in this browser. It remains selectable under **Your world** and is restored on reload. Custom worlds use manual stellar geometry, so catalogue ephemerides cannot override the selected orbital distance. Density uses the ideal-gas approximation; no climate, chemistry or phase-equilibrium calculation is implied.

## Verify

```bash
npm test
npm run build
```

With the dev server running, open `/tests/sky-render.html` for floating-point GPU checks and a scene gallery. Recorded numerical, browser and preset smoke results are in [science-fix-evidence](docs/science-fix-evidence/).

## Structure

- `src/science/spectrum.ts`, `data/`: CIE integration, stellar spectra and sourced data.
- `src/science/atmosphere.ts`, `geometry.ts`: optical columns, spherical paths and finite-disc illumination.
- `src/science/twoStream.ts`, `transport.ts`, `sky.worker.ts`: layered diffuse transport and spectral sky integration.
- `src/science/worlds.ts`, `astronomy.ts`: preset assumptions, ephemerides, observer frames, satellites and rings.
- `src/science/customWorld.ts`, `src/ui/WorldEditor.tsx`: validated custom scenarios, composition/density coupling, browser persistence and the editor.
- `src/three/skyShader.ts`, `stars.ts`, `display.ts`: physical radiance, angular projection, terrain/bodies, catalogue stars and display adaptation.
- `src/three/SkyView.tsx`, `src/App.tsx`, `src/ui/controls.tsx`: viewport, asynchronous calculation and controls.

Important remaining limits include omitted atmospheric refraction, approximate multiple-scattering angles, incomplete distant-host star catalogues, simplified satellite orbits/materials, missing secondary moonlight/planetshine and diffuse Milky Way light, and unmeasured atmospheric profiles. See the model specification before interpreting a scene as a quantitative prediction.
