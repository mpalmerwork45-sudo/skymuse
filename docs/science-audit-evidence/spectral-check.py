"""Independent photopic integration and reference ozone optical depths.

Usage: python3 spectral-check.py CIE_sle_photopic.csv bruneton-demo.cc
The README identifies both sources and the CIE dataset checksum.
"""
import csv
import hashlib
import json
import math
from pathlib import Path
import re
import sys

photopic_file, reference_file = map(Path, sys.argv[1:3])
assert hashlib.md5(photopic_file.read_bytes()).hexdigest() == 'f389958555461a7d9a7562145e8ca9c0', 'Unexpected CIE dataset; review the version before comparing results.'
with photopic_file.open() as f:
    sensitivity = [(float(row[0]) * 1e-9, float(row[1])) for row in csv.reader(f)]
h, c, k, sigma = 6.62607015e-34, 299792458, 1.380649e-23, 5.670374419e-8
rows = []
for temperature in [2566, 3042, 3788, 5778, 6300, 10000]:
    radiance = [2*h*c*c / (wl**5 * math.expm1(h*c/(wl*k*temperature))) for wl, _ in sensitivity]
    integral = sum(
        (sensitivity[i+1][0] - sensitivity[i][0])
        * (radiance[i] * sensitivity[i][1] + radiance[i+1] * sensitivity[i+1][1]) / 2
        for i in range(len(sensitivity)-1)
    )
    efficacy = 683 * math.pi * integral / (sigma * temperature**4)
    rows.append({
        'temperatureK': temperature,
        'lumensPerBolometricWatt': efficacy,
        'solarConstant133000Over1361': 133000/1361,
        'appOverBlackbody': 133000/1361/efficacy,
    })
table = re.search(r'kOzoneCrossSection\[48\] = \{(.*?)\};', reference_file.read_text(), re.S).group(1)
cross_sections = [float(x) for x in table.replace('\n', '').split(',') if x.strip()]
ozone = []
for wavelength, app_tau in [(680, .12), (550, .1), (440, .015)]:
    cross_section = cross_sections[(wavelength-360)//10]
    tau = cross_section * 300 * 2.687e20
    ozone.append({'wavelengthNm': wavelength, 'sigmaM2': cross_section,
                  'tau300DU': tau, 'appTau': app_tau, 'appOver300DU': app_tau/tau})
results = {
    'method': 'Blackbody Planck spectrum, CIE 1nm photopic V(lambda), integral over dataset range normalized by Stefan-Boltzmann exitance; illustrative consistency check, not stellar atmosphere spectra. Ozone from Bruneton 233K 10nm-averaged Bremen values at 300DU.',
    'blackbody': rows,
    'ozone': ozone,
}
Path(__file__).with_name('spectral.json').write_text(json.dumps(results, indent=2)+'\n')
print(json.dumps(results, indent=2))
