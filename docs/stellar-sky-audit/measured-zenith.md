# Earth’s clear sky against field measurements

The Earth preset reproduced the rise in zenith luminance from the low-Sun to the midday scan. Its zenith luminance ranged from 0.6% below to 16.1% above the observations. Averaged around a ring 33.749° above the horizon, it differed by 0.1% in one scan and overestimated the other two by 20–25%. The model zenith was less blue than measured in all three scans, with the largest shift at the lowest Sun angle.

| Capture, Ithaca local time (EDT) | Solar elevation | Measured cd/m² | Model cd/m² | Model error | Measured CIE x, y | Model CIE x, y |
|---|---:|---:|---:|---:|---|---|
| 2013-09-24 07:50 | 9.14° | 659 | 765 | +16.1% | 0.2431, 0.2537 | 0.2560, 0.2672 |
| 2013-05-27 09:30 | 41.06° | 2,081 | 2,068 | −0.6% | 0.2586, 0.2678 | 0.2603, 0.2720 |
| 2013-05-27 12:00 | 65.15° | 3,842 | 4,168 | +8.5% | 0.2691, 0.2785 | 0.2747, 0.2877 |

At 33.749° viewing elevation, measured samples 32–55 cover all 24 azimuths at 15° intervals. Each has the same weight. The model comparison integrates the standard sky texture over azimuth by trapezoidal quadrature, interpolating between the two bracketing elevation rows as in the renderer. Both means are taken in linear units before computing x and y. The steep brightness gradient near the Sun can make a discrete scan sensitive to angular sampling.

| Capture, Ithaca local time (EDT) | Solar elevation | Measured ring mean cd/m² | Model ring mean cd/m² | Model error | Measured CIE x, y | Model CIE x, y |
|---|---:|---:|---:|---:|---|---|
| 2013-09-24 07:50 | 9.14° | 1,476 | 1,771 | +20.0% | 0.2565, 0.2714 | 0.2732, 0.2882 |
| 2013-05-27 09:30 | 41.06° | 4,132 | 4,128 | −0.1% | 0.2737, 0.2851 | 0.2736, 0.2885 |
| 2013-05-27 12:00 | 65.15° | 3,059 | 3,836 | +25.4% | 0.2579, 0.2678 | 0.2673, 0.2837 |

Kider et al. measured clear skies on the roof of Rhodes Hall at Cornell University (42.443449° N, 76.481962° W). Sample 80 points at the zenith. Their spectroradiometer reports W m⁻² sr⁻¹ nm⁻¹ at 1 nm intervals. The calculation integrates the measured spectrum over 360–830 nm with CIE 1931 2° colour-matching functions and 683 lm/W. The resulting CIE Y is luminance in cd/m². [Field dataset](https://github.com/spectralskylight/sky-measurements-2014), [Kider et al. (2014), §4.1](https://spectralskylight.github.io/Kider2014.pdf), [CIE standard observer](https://cie.co.at/datatable/cie-1931-colour-matching-functions-2-degree-observer)

The model uses the date-specific Sun distance and geometric elevation. We sampled scene radiance before display adaptation and exposure. We kept the Earth preset’s sea-level pressure of 1.013 bar, 300 DU of ozone, aerosol optical depth of 0.06 at 550 nm, ground albedo of 0.30 and cloud-free sky. These inputs were never fitted to the site. The field instrument sampled a finite cone. Each model uses the scan’s nominal timestamp, while the instrument took about three minutes to visit all directions. The Sun could have moved between the nominal time and a given measurement. The differences include these acquisition conditions, local weather and transport approximations. The three scans constrain clear terrestrial daylight on two dates.

From the project root, after installing its npm dependencies, run `node docs/stellar-sky-audit/check-measured-zenith.mjs`. The script uses `curl` and `7z`, verifies the field archives and CIE table by checksum, and prints unrounded luminance and chromaticity for each scan.
