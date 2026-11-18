# Skymuse — Planetary Sky Simulator

Explore 27 planetary, lunar, exoplanet and fictional skies using spectral atmospheric transport, a catalogue starfield and physical viewing geometry.

The current model integrates 48 visible wavelength bands using CIE colour matching functions. It combines spherical atmospheric refraction and single scattering, approximate hemispheric multiple scattering, finite stellar discs, reflected companion illumination, measured methane/ozone absorption data, a reflecting lower boundary, and one photometric display pipeline. Real-world weather and exoplanet atmospheres are generally assumed. “Adapted display” is an SDR viewing approximation, not a calibrated reproduction of human vision.

Read the [model specification, audit changes, sources and remaining limitations](docs/science-model.md). The [original audit](docs/science-authenticity-audit.md) and its evidence describe the pre-fix implementation.

## Run

```bash
npm install
npm run dev
```

Open the printed URL. Drag to look and scroll to zoom. Manual mode controls stellar elevation and azimuth; date/location mode calculates Solar System geometry. Latitude changes the visible orientation of Saturn's rings. Cloud, dust and absorption controls alter the physical column; changes recalculate in a worker.

The initial scene is Earth at a manually selected +2° geometric stellar elevation. Atmospheric refraction is enabled by default; its switch is in **Display**. The image and catalogue stars use apparent directions, while the position controls and ephemerides use geometric coordinates. The **Physics** readout shows both stellar elevations. Observation coordinates are planetocentric latitude and east longitude on a spherical reference surface. Saturn opens at 20° latitude; at the equator its idealized thin rings are edge-on. Giant-planet boundaries represent cloud levels, not solid ground.

Illuminated moons and parent planets also light the sky and ground. Their contribution follows their phase, size, distance, assumed spectral reflectance and eclipses; **Reflected body direct** shows their direct horizontal illuminance. Date/location controls orient the companions even in manual stellar mode. Their materials and the secondary illumination remain idealized Lambertian approximations.

## Earth around other stars

Under **Earth**, choose a K5V, M3V, F5V or A5V star. All four comparisons keep Earth's atmosphere and surface and receive the same total stellar irradiance, 80% of Earth's. The F and A stars have larger radii than the Sun and sit farther away at 2.121 and 3.930 AU. The **Physics** readout gives the habitable-zone interval from the climate fit appropriate to each stellar temperature. [Model notes](docs/science-model.md#earth-comparisons-around-other-stars)

## Custom worlds

Click **Customise** to start from any preset. Choose a catalogue star or define a custom star by temperature and radius, set its distance in AU, and edit the planet’s radius, gravity and temperature.

The atmosphere accepts gas percentages by volume and either surface pressure in bar or gas density in kg/m³. Percentages must total 100%; mixture presets and **Normalize to 100%** help balance them. Molecular mass, the other pressure/density quantity, and hydrostatic scale height are calculated together. Set pressure or density to zero for an airless world. Advanced controls cover haze, clouds, ozone, surface colour and albedo.

**Apply world** recalculates the sky and saves one custom world in this browser. It remains selectable under **Your world** and is restored on reload. Custom worlds use manual stellar geometry, so catalogue ephemerides cannot override the selected orbital distance. Density uses the ideal-gas approximation; no climate, chemistry or phase-equilibrium calculation is implied.

## Verify

```bash
npm test
npm run build
```

With the dev server running, open `/tests/sky-render.html` for floating-point GPU checks and a scene gallery. Recorded results are in [science-fix-evidence](docs/science-fix-evidence/), [refraction-evidence](docs/refraction-evidence/) and [companion-evidence](docs/companion-evidence/).

## Structure

- `src/science/spectrum.ts`, `data/`: CIE integration, stellar spectra and sourced data.
- `src/science/atmosphere.ts`, `geometry.ts`, `refraction.ts`: optical columns, curved spherical paths, angular maps and finite-disc illumination.
- `src/science/twoStream.ts`, `transport.ts`, `sky.worker.ts`: layered diffuse transport and spectral sky integration.
- `src/science/worlds.ts`, `astronomy.ts`, `lighting.ts`: preset assumptions, ephemerides, observer frames, satellites, reflected illumination and rings.
- `src/science/customWorld.ts`, `src/ui/WorldEditor.tsx`: validated custom scenarios, composition/density coupling, browser persistence and the editor.
- `src/three/skyShader.ts`, `stars.ts`, `display.ts`: physical radiance, angular projection, terrain/bodies, catalogue stars and display adaptation.
- `src/three/SkyView.tsx`, `src/App.tsx`, `src/ui/controls.tsx`: viewport, asynchronous calculation and controls.

Important remaining limits include achromatic refraction in prescribed profiles, approximate multiple-scattering angles, incomplete distant-host star catalogues, simplified satellite orbits/materials, missing diffuse Milky Way light and solar-eclipse atmospheric shadows, and unmeasured atmospheric profiles. See the model specification before interpreting a scene as a quantitative prediction.
