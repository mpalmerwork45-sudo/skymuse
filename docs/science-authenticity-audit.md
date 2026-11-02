# Skymuse science and visual authenticity audit

Audit of commit `648e2d6` (`Correct sky scattering, sunset colour, and twilight lighting`), performed 30 October 2026 UTC. Application source was left unchanged. This report extends the earlier [sky-model review](sky-model-review.md); it assesses the current implementation, including its corrections.

**Verdict: a useful atmospheric illustration, with several sound physical ingredients, but presently unsuitable as a scientifically reliable prediction of what a human would see.** The README already acknowledges that distinction. Earth and Mars demonstrate recognizable qualitative trends. Absolute brightness, exact colour, twilight, thick atmospheres, celestial companions, and the claimed human-eye view remain unreliable. Several failures are demonstrable implementation errors, beyond the limitations already documented.

High priority below means the issue materially prevents the stated scientific goal. Medium priority means a more localized error or missing capability. A documented approximation can still be a high-priority scientific limitation; disclosure does not validate its result.

**Evidence and coverage**

- Read all science, shader, scene, catalogue, UI, and test code.
- `npm test`: all **13 tests passed**, including the 23-world numerical sweep.
- `npm run build`: passed; the existing bundle-size advisory remains.
- `/tests/sky-render.html`: all **14 WebGL checks passed**, including 69 preset/elevation smoke cases. Chromium with SwiftShader reported no shader or WebGL errors.
- Captured 18 preset/elevation views and an artificial opaque-atmosphere case using the production sky shader, plus actual application screenshots. Inspected the images, not just pixel assertions.
- Measured raw shader output using a floating-point render target with the final display conversion bypassed in the audit harness only.
- Independently integrated blackbody spectra against CIE photopic sensitivity and checked ozone coefficients against published reference data.

The [render gallery](science-audit-evidence/gallery.png), [browser measurements](science-audit-evidence/browser.json), [numerical measurements](science-audit-evidence/numerical.json), and [spectral calculations](science-audit-evidence/spectral.json) preserve the evidence. Reproduction instructions and harnesses are in [the evidence directory](science-audit-evidence/README.md). Screenshots are diagnostic outputs, not calibrated observations of real planetary skies. The gallery covers the sky/ground shader; separate application captures cover the UI and Saturn's companions.

**What is sound**

The molecular column scales as pressure divided by gravity and molecular mass, with a mixture-weighted scattering cross-section. That is an appropriate hydrostatic starting point. The wavelength-to-the-minus-fourth Rayleigh trend, approximate Earth optical-depth normalization, inverse-square stellar irradiance, and exponential direct-beam attenuation are reasonable ingredients. The stellar diameter formula `2 asin(R/d)` is correct for the stated spherical geometry. Compass direction vectors are consistent.

The Rayleigh and Henyey–Greenstein functions use the same mean-one convention. The slab single-scattering expression has the correct analytic integral for its simplified geometry and a sensible equal-path limit. These pieces should be retained or independently tested when replacing the surrounding model. Phase functions still need the corresponding radiometric normalization when used to predict radiance. [PBRT phase-function reference](https://pbr-book.org/4ed/Volume_Scattering/Phase_Functions).

The current implementation also correctly avoids atmospheric daylight glow in vacuum, converts hex surface colours from sRGB once, encodes shader output with the sRGB transfer function, and keeps fixed-camera exposure fixed through sunset. The Mars preset now puts a blue glow near the Sun rather than attributing it to Rayleigh scattering. That broad phenomenon is supported by rover observations, although the fitted coefficients and displayed lavender halo are not validated. [NASA's Mars sunset explanation](https://science.nasa.gov/resource/sunset-at-mars-gale-crater-curiosity/).

**1. High — stellar disc radiance is incorrectly multiplied by inverse-square irradiance**

Location: `src/three/skyShader.ts:170–179`; `src/science/atmosphere.ts:185–186,234–237`.

The disc already becomes smaller with distance. Multiplying its pixel brightness by `uFlux` applies distance dimming again. In empty space, the radiance of a resolved patch of the same star should remain constant with distance. Its smaller apparent area accounts for the reduction in received irradiance. [PBRT radiometry](https://pbr-book.org/4ed/Radiometry,_Spectra,_and_Color/Radiometry).

Measured with the same Sun in vacuum, fixed exposure, and a camera resolving the disc: the raw central red value is **750 at 1 AU and 187.5 at 2 AU**. It should be the same. In the resolved, small-angle limit, the implementation makes integrated disc light scale approximately as `1/d⁴`, instead of `1/d²`. The `min(uFlux, 8)` cap adds another inconsistency for close-in worlds.

Fix: derive disc radiance from a normalized stellar spectrum. For a uniform disc with angular radius `α`, normal irradiance and radiance satisfy `E = π L sin²(α)`. Integrate coverage for unresolved discs so zoom, resolution, and pixel alignment do not change their total light. The distant-disc samples also show additional rasterization loss; `acos(dot)` near one and the fixed `1e-4` radian antialiasing term deserve particular attention.

**2. High — the colour and lux paths cannot predict human perception**

Location: `src/science/atmosphere.ts:10–11,102–116,185–215,224–230`; `src/three/skyShader.ts:215–226`; `src/ui/controls.tsx:214,263`.

The model assigns radiance-like values at 680, 550, and 440 nm directly to RGB channels. Wavelength samples are not linear-sRGB components. A temperature-to-RGB approximation normalized to its maximum channel is not a luminosity-normalized stellar spectrum. There is no integration against human colour-matching functions. A physical colour pipeline needs spectral radiance → CIE XYZ → display RGB, with a declared adaptation and display model. [CIE colour-matching data](https://cie.co.at/datatable/cie-1931-colour-matching-functions-2-degree-observer).

Lux is calculated separately using a green-channel transmission proxy and the same **97.72 lumens per bolometric watt** for every star. Changing stellar temperature from 2,566 K to 10,000 K at fixed bolometric luminosity and distance leaves the test scene at **94,045.2 lux**. The audit adjusts stellar radius with temperature to preserve the luminosity relation, so this is a consistent fixed-flux comparison.

An independent Planck-spectrum calculation gives the following illustrative comparison:

| Temperature | Blackbody photopic efficacy | Application conversion / blackbody value |
| --- | ---: | ---: |
| 2,566 K, TRAPPIST-1 preset temperature | 9.31 lm/W | 10.50× |
| 3,042 K, Proxima preset temperature | 21.97 lm/W | 4.45× |
| 3,788 K, Kepler-186 preset temperature | 47.53 lm/W | 2.06× |
| 5,778 K, Sun preset temperature | 92.08 lm/W | 1.06× |

These are checks of the conversion, not predictions of actual exoplanet surface lux: real stellar spectra and atmospheric transmission must also be integrated. They demonstrate why a solar conversion cannot be reused for cool stars. The calculation uses `683 ∫ V(λ) Eλ dλ`, normalized by blackbody bolometric exitance. [CIE photopic data](https://cie.co.at/datatable/cie-spectral-luminous-efficiency-photopic-vision).

“Human eye” changes only a scalar gain, instantly, based on that independently estimated horizontal lux. It has no adaptation history, chromatic adaptation, rod/cone transition, scene-dependent glare, or calibrated display luminance. It cannot claim to reproduce perceived colour or brightness. The lower gain clamp also leaves the WASP-12b daytime view almost white: at +85°, its unclamped formula would give about 0.00128, but the code forces 0.03, approximately 23.5× larger.

Fix: establish one radiometric/spectral light model and derive both telemetry and pixels from it. Treat exposure as a separate display transformation. Until validated, call the current mode automatic exposure or illustrative adaptation.

**3. High — absorption is a colour control; even Earth's ozone weights are substantially wrong**

Location: `src/science/atmosphere.ts:157–166`; `src/science/worlds.ts:116,120,190,198,220–223`.

The comments correctly admit that CH₄/O₃ coefficients are phenomenological. Their quantitative effect is nevertheless substantial. Earth's ozone optical depths are `(0.12, 0.10, 0.015)`. As a comparison, a 300-DU ozone column using the 233 K, 10-nm-bin cross-sections in Bruneton's reference implementation gives:

| Wavelength | Application ozone τ | 300-DU reference τ | Ratio |
| --- | ---: | ---: | ---: |
| 680 nm bin | 0.120 | 0.00975 | 12.3× |
| 550 nm bin | 0.100 | 0.02821 | 3.54× |
| 440 nm bin | 0.015 | 0.00128 | 11.8× |

This is not just an overall scaling error: the relative red/green absorption is reversed. These are reference bins, not exact narrowband values or a claim that Earth's ozone is always 300 DU. [Reference implementation and bin definitions](https://ebruneton.github.io/precomputed_atmospheric_scattering/atmosphere/demo/demo.cc.html), using [Bremen laboratory ozone spectra](https://www.iup.uni-bremen.de/gruppen/molspec/databases/referencespectra/o3spectra2011/index.html).

Methane absorption likewise ignores methane abundance, pressure, gravity, and vertical structure: changing `gases.ch4` does not change `absorptionOD`. Pluto receives red optical depth 0.72 from `ch4: 0.3`, independently of its very small atmospheric column. Uranus/Neptune appearance is largely chosen by unrelated preset strength parameters. Earth's “ozone-warmed twilight” description should also be replaced with a more accurate explanation of wavelength-dependent absorption.

Fix: calculate absorption from column densities and appropriate wavelength-, temperature-, and pressure-dependent data. Keep illustrative colour overrides visibly separate from physical inputs.

**4. High — horizon and twilight geometry are not planetary geometry**

Location: `src/science/atmosphere.ts:86–95,188–193`; `src/three/skyShader.ts:109–111`; `src/science/worlds.ts:84–85`.

The solar path uses an Earth apparent-airmass fit; the viewing path uses a separate hand-shaped curve. At the horizon they are **37.92 and 16.67**, respectively. Thus a ray in the solar direction is not treated consistently when it is a viewing ray. Every planet uses the same curves.

There is no physical planet radius, density profile, atmospheric-shell intersection, or shadow calculation. Multiplying Earth's `scaleHeightKm` by ten produces **identical state and identical image**. A pressure/gravity column correctly need not depend on scale height; the problem is that curved slant paths and twilight should depend on atmospheric structure and planetary radius.

Below the horizon, the solar path is frozen and all worlds receive `exp(elevation/1.2)` illumination. This cannot model the varying illuminated altitude, shadow boundary, or twilight angular structure of Earth, Mars, Titan, and Pluto. No atmospheric refraction is calculated. The 8,000-unit scene sphere is merely a rendering dome, not a planet model.

Fix: use a spherical atmosphere with separate molecular, aerosol, and absorber profiles, observer height, and planetary occultation. A documented, tested implementation supporting spectral inputs and custom density profiles is a useful reference, although adopting one still requires validating the chosen planetary regimes. [Bruneton atmospheric model](https://ebruneton.github.io/precomputed_atmospheric_scattering/).

**5. High — multiple scattering and clouds fail physical limits and produce visible artifacts**

Location: `src/three/skyShader.ts:134–168,180–182`; `src/science/atmosphere.ts:195–211`.

The `S(τ)` fill, escape factor, horizon band, extra solar glow, and cloud “gloom” are independent empirical additions. There is no shared transport solution or demonstrated energy budget. The term called multiple scattering is first order in optical depth as `τ → 0`. For a thin conservative Rayleigh column at zenith, the formula makes that fill approach **5.33 times the displayed single-scattering term** even as the column vanishes. True higher scattering orders must become negligible relative to single scattering in the optically thin limit. Ground feedback is absent as well.

Cloud top reflectance is used interchangeably as a direct-beam attenuation parameter, mixture weight, and star visibility control. Reflectance does not specify cloud optical depth, altitude, coverage, or directional transmission. For example, the direct-beam factor remains `exp(-3) ≈ 0.0498` even when the cloud reflectance parameter is one.

The rendered consequence is conspicuous: [Venus with the Sun at +45°](science-audit-evidence/venus-45.png) has a large, saturated red sunward patch with a darker centre. An upper-view sample is `(255, 64, 18)`. This is an artifact of the combined approximate terms, not evidence of a validated Venusian solar aureole. Surface illumination on Venus is cloud-filtered and diffuse, without a direct view of the Sun. [NASA-hosted Venus photovoltaic assessment](https://ntrs.nasa.gov/api/citations/20230002489/downloads/20230002489%20Document%20Revised_Final.pdf?attachment=true).

Fix: replace the empirical source terms with controlled scattering orders or a validated multiple-scattering approximation. Parameterize clouds by optical properties and vertical placement. Validate thick atmospheres separately from clear Earth skies; a colour tweak to the red patch would not resolve the transport problem.

**6. High — an extended star is drawn as a disc but illuminates the world as a point**

Location: `src/science/atmosphere.ts:188–205,234–237`; `src/three/skyShader.ts:170–182,197–202`.

For WASP-12b, the catalogue gives a stellar diameter of **37.20°**. With its centre at the slider minimum, −15°, the top of the star is still **3.60° above the geometric horizon**. Nevertheless, direct horizontal illumination is set to zero, the entire beam uses the below-horizon centre path, and the twilight multiplier is only `3.73e-6`. Reported illumination is 3.71 lux and adaptation reaches 60×.

The same inconsistency occurs over a smaller interval for ordinary sunrises: half of an airless stellar disc is above the horizon when its centre is at zero elevation, but the code assigns zero direct horizontal light. The tests currently enshrine this point-source approximation even at the horizon.

Fix: integrate incident light and extinction over the visible stellar disc, including partial horizon occultation. Scattering should also integrate source directions for very large stars. Limb darkening can be added with the same normalization.

**7. High — stars shine through opaque atmospheres**

Location: `src/three/skyShader.ts:184–189`; `src/science/atmosphere.ts:219`.

The starfield is added after atmospheric scattering, without multiplication by view transmission. It only fades with `nightFactor` and `1 - cloudAlbedo`.

Audit counterexample: at −15°, a vacuum sky and a purely absorbing atmosphere with vertical optical depth **100** render **byte-identical images** at fixed exposure and time. Both contain the same stars. Transmission through that atmosphere should be effectively zero. This also makes night skies of existing dense-atmosphere presets show inappropriate stars.

All stars twinkle with the same oscillator frequency, including on the airless Moon. Their appearance depends solely on solar elevation rather than local sky brightness and observer adaptation. `floor(dir * 220)` creates angular cells, not a catalogue of unresolved stellar sources.

Fix: attenuate celestial backgrounds through the same atmosphere as the Sun, render stars as flux-conserving point sources with magnitudes and colours, and base visibility on background luminance and the display/observer model. Atmospheric scintillation must disappear in vacuum.

**8. High — moons and rings bypass the atmosphere and have incorrect illumination**

Location: `src/three/SkyView.tsx:85–107,199–205`; `src/three/bodies.ts:109–124`; `src/science/worlds.ts:167–181`.

Companions use unlit basic/sprite materials drawn after the sky. Their light does not pass through atmospheric extinction or acquire foreground in-scattered light. Their scalar brightness is based on the observer's ground lux, not illumination of the body. A positive floor keeps them visible even under conditions that should obscure them, while sunset at the observer dims bodies that may still be fully sunlit.

The lunar image is a fixed radial gradient, with a white highlight in the same texture position for every Sun direction. There is no phase, terminator, eclipse, or phase-dependent brightness. Moving the Sun into conjunction does not produce a new moon. It also has a diffuse transparent edge instead of a resolved surface and limb.

Some companion sizes are plainly excessive. Titan is assigned 0.75° and Rhea 0.45° as seen from Saturn. Using JPL mean orbital distances, their central-distance diameters are approximately **0.241° and 0.166°**. Even an overhead pericentre estimate allowing Saturn's equatorial radius gives only about **0.262° and 0.188°**. [JPL moon radii](https://ssd.jpl.nasa.gov/sats/phys_par/sep.html), [orbital elements](https://ssd.jpl.nasa.gov/sats/elem/sep.html), and [planetary radii](https://ssd.jpl.nasa.gov/planets/phys_par.html).

Fix: use actual radii and observer-relative positions, reflectance/phase models, and atmospheric compositing. Give celestial objects the same radiometric and display treatment as the sky. Phase and extinction checks should exercise the complete scene.

**9. Medium — Saturn's rings are a decorative strip; the Encke gap cannot render**

Location: `src/three/bodies.ts:22–47,78–99`.

Ring elevation is prescribed as `2 + 70 sin(πt)` and half-width as 3.6°. This does not project physical annuli from a specified latitude or account for ring-plane orientation, planetary occlusion, ring illumination, or ring/planet shadows. The eastern/western ends are clamped above the horizon, producing the visible bent termination in the [application capture](science-audit-evidence/saturn-ui.png).

A definite local bug: the Encke-gap condition `v > 0.862 && v < 0.874` occurs inside the branch `v < 0.86`. It is unreachable. The advertised gap is absent.

Fix: construct rings in planet-centred coordinates with physical radial intervals and optical depths, then project from the observer. Repair the unreachable texture interval independently.

**10. Medium — the advertised 180° all-sky fisheye is a cropped perspective view**

Location: `src/three/SkyView.tsx:59,173–177`; `src/ui/controls.tsx:291–300`.

Fisheye mode retains a perspective camera at 150° vertical FOV, points it to +89°, and overlays a circular CSS mask. This is not a fisheye projection. At the captured 1280×800 landscape size, the fully transparent circle covers approximately **135.8°**, not 180°: `2 atan(0.66 tan 75°)`. The faded rim does not recover the missing horizon. The [capture](science-audit-evidence/fisheye-ui.png) consequently omits the +2° Sun from an allegedly all-sky view. The HUD also continues to show the old +3° pitch.

Fix: map screen radius to angular distance with an explicit fisheye projection. The edge must correspond to the horizon, with zenith at the centre. Test known azimuth/elevation landmarks and aspect ratios.

**11. Medium — ground albedo is unused and surface appearance lacks a coherent lighting model**

Location: `src/science/worlds.ts:100–101`; `src/three/skyShader.ts:191–213,321`.

Changing `groundAlbedo` from Earth's 0.3 to 0.99 produces **identical state and identical pixels**. Only `surfaceColor` affects the material. There is no surface-to-atmosphere reflection contribution, particularly important for bright snow/ice and optically thick atmospheres.

The ground is an infinite flat noise texture, with no relief, cast shadows, distant terrain, surface curvature, or atmospheric attenuation to terrain points. Ambient light inherits `scatterTint`, which depends on viewing direction, rather than an irradiance integral over the surface's incident hemisphere. Venus is also marked `horizonDiffuse: true` despite this field being described as a gas-giant cloud-deck treatment; its solid surface receives the same arbitrary horizon blending.

Fix: define how spectral/colour reflectance relates to the scalar albedo, derive surface illumination from the sky, and add surface feedback where required. Basic terrain and distance-dependent aerial perspective would make the view more authentic, but should follow a consistent lighting model.

**12. High — catalogue inputs and descriptions imply unsupported physical precision**

Location: `src/science/worlds.ts`, especially `212–260`; `src/App.tsx:90–96`.

The catalogue's broad pressure and gravity choices are useful starting points, but aerosol, cloud, absorption, and colour parameters lack per-field provenance and uncertainty. They cannot establish predicted appearance.

- **WASP-12:** the chosen radius 1.57 R☉ and temperature 6,300 K imply about **3.48 L☉**, while the preset uses 1.6 L☉. This fails the Stefan–Boltzmann consistency relation by a factor of **2.18**. Archive solutions should be selected consistently rather than mixed. The blurb's “third of the sky” also overstates a 37.2° diameter. [NASA Exoplanet Archive](https://exoplanetarchive.ipac.caltech.edu/overview/wasp-12).
- **Pluto:** the preset's 550-nm haze optical depth 0.08 is several times the approximately 0.013 visible value discussed in New Horizons analysis. The bandpasses and spatial variability matter, so this is a flag for measurement-based revision, not a universal replacement constant. The code also omits the layered haze geometry. [Cheng et al., Haze in Pluto's Atmosphere](https://arxiv.org/pdf/1702.07771).
- **TRAPPIST-1e, Proxima b, Kepler-186f:** specific surface pressure, gas mixture, clouds, ozone, and ground colour are assumed scenarios. “Likely ocean world” and a prescribed salmon-pink sky are not measured conditions. NASA's TRAPPIST-1e spectrum discussion explicitly allows both atmospheric and airless interpretations. [NASA TRAPPIST-1e spectrum](https://science.nasa.gov/asset/webb/trappist-1-e-transmission-spectrum-nirspec/).
- **WASP-12b's atmosphere:** the renderer has no thermal emission or temperature-dependent chemistry. Applying the same cool-planet reflected-light treatment to this hot Jupiter omits an essential regime of physics. The discovery paper already inferred an equilibrium temperature around 2,516 K; that is not a surface map, but it makes a cold reflective-deck interpretation inadequate. [Hebb et al.](https://arxiv.org/abs/0812.3240).
- **Fictional worlds:** invented parameters are legitimate scenario inputs. They should be identified as such, including where a named real star is assigned invented properties. They cannot serve as validation cases for observational authenticity.

Fix: attach units, source, epoch, uncertainty, observer level, and measured/assumed/fictional status to each relevant parameter. Derive dependent quantities and reject inconsistent star specifications. Validate one chosen atmosphere/state per world before offering it as a prediction.

**13. Medium — no observing location, time, ephemeris, or real background sky**

Location: `src/App.tsx:45–69,71–76`; `src/science/worlds.ts:63–71,151–157`; `src/three/skyShader.ts:184–189`.

Sunrise/sunset simply moves elevation at 1.5° per real second and fixed azimuth on every world. This can be a useful manual lighting control, but it is not a planetary day model. There is no latitude, longitude, date, obliquity, season, orbital eccentricity, rotation, or tidal-locking geometry. Moon positions are fixed constants. The starfield is the same procedural pattern everywhere, without constellations, Milky Way, observer-dependent stellar positions, or real bright planets.

The Moon description promises Earth overhead, but its preset contains no Earth companion at all. A near-side observing location must be specified before making that promise. Similar omissions include Mars's moons and Pluto's Charon. Their positions and visibility should follow a declared scene rather than being inferred from a planet name alone.

Fix: retain manual Sun placement as a clearly named mode. Add location/time and ephemerides where the product claims an actual observing situation; use physically consistent authored geometry where observations are unavailable. Some scope choices can be deliberate, but the UI must describe them accurately.

**Visual assessment of the captured output**

| Case | What the render supports | What remains unreliable |
| --- | --- | --- |
| Earth | Recognizable blue daytime sky; cooler upper dawn sky and warmer horizon | Exact hue/brightness, overly uniform dome, ozone, twilight structure, premature/unattenuated stars |
| Mars | Warm dusty background and local blue sunward glow | Large lavender daytime/sunset halo is an empirical fit; no measured dust phase/spectrum validation |
| Mercury / Moon | Black daytime atmosphere and a small Sun | Terrain/shadows, celestial background visibility, missing Earth; Sun radiance still wrong with distance |
| Venus | Diffuse brown dawn and some terrain illumination | Saturated red daytime patch, arbitrary horizon blur and thick-atmosphere transport |
| Titan | Haze-dominated appearance | Captured yellow/olive daylight, very dark dawn, and sky/ground contrast lack observational calibration |
| Giant planets | Distinct methane-influenced colours | A 1-bar observer is a vertical-structure problem; orbital photographs of whole planets do not validate these skies; Saturn rings and moons are illustrative |
| Pluto / Triton | Weak molecular scattering represented | Haze amount/profile, absorption, faint-Sun sampling, brightness adaptation, absent primary/companion bodies |
| Exoplanets | Parameterized hypothetical scenes | Stellar photometry, assumed atmospheres, hot-planet thermal emission, large-source lighting |

**Why passing tests did not catch these problems**

The tests protect useful numerical invariants and selected qualitative RGB relationships. They do not compare against calibrated radiance, measured spectra, or a reference transport solver. Several expected values are the same formulas as the implementation. The WebGL tests render only the dome, so they cannot catch companion phases, ring geometry, or fisheye errors. Their Venus check samples terrain at +2°, missing the severe +45° artifact. `npm test` does not run the browser suite.

Add independent acceptance checks for resolved-star radiance invariance, unresolved-source energy, finite-disc sunset illumination, opaque-atmosphere occultation, phase geometry, ring intervals, true fisheye angular mapping, physical stellar consistency, and spectrum-dependent photometry. Verify that physical inputs have their intended effects, rather than requiring every parameter to alter every output. Compare spectral radiance before display mapping; rendered colour alone can hide errors through clipping or exposure.

**Recommended repair order**

1. **Resolve the clear implementation errors:** stellar disc radiance, star/companion transmission, moon phases and sizes, extended-source horizon handling, fisheye projection, and the unreachable Encke interval. Correct unsupported UI descriptions and label scenarios.
2. **Establish the shared light calculation:** declared units, normalized stellar spectra, measured absorption, spherical atmospheric paths, and consistent sky/ground/telemetry integration. Preserve the valid column, attenuation, and geometric work.
3. **Validate Earth and Mars first:** choose explicit atmospheric conditions and reference data; compare spectra, angular sky radiance, direct/diffuse illuminance, and twilight before tuning display appearance. Use measured dust properties for Mars.
4. **Validate thick atmospheres and outer worlds separately:** cloud/haze profiles, scattering orders, real observer level, and surface feedback. Do not extrapolate an Earth-tuned fill term into Venus or Titan.
5. **Add observer/display and astronomical realism:** adaptation over time, colour adaptation, night vision and glare as warranted, catalogue stars and ephemerides, terrain, and ring shadows. Treat exoplanet climates as an ensemble of scenarios with uncertainty.

This audit establishes concrete defects and limits; it does not assign an error bar to the current sky colours. There is no calibrated observational or spectral-reference comparison in the repository from which such an error bar could be justified.
