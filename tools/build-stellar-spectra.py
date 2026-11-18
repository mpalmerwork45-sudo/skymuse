"""Rebuild the offline spectrum tables and full-resolution CIE audit, using Astropy and NumPy 2.

Usage: python tools/build-stellar-spectra.py CACHE_DIRECTORY
The first run downloads the STScI FITS files and official CIE table into the cache.
"""
import argparse
import hashlib
import json
from pathlib import Path
from urllib.request import urlretrieve

import numpy as np
from astropy.io import fits

ROOT = Path(__file__).resolve().parents[1]
STSCI = "https://ssb.stsci.edu/cdbs/grid/phoenix/phoenixm00/"
CIE = "https://files.cie.co.at/Publications-datasets/CIE_xyz_1931_2deg.csv"
# Target effective temperature, adjacent model temperatures (K), and assumed log g (cgs).
STARS = [(2566, 2500, 2600, 5.0), (3042, 3000, 3100, 5.0),
         (3430, 3400, 3500, 5.0), (3788, 3700, 3800, 5.0),
         (4440, 4400, 4500, 4.5), (6300, 6300, 6300, 4.0),
         (6550, 6500, 6600, 4.5), (8100, 8000, 8200, 4.0)]
CENTRES = np.arange(360, 831, 10)


def download(cache, basename, url):
    path = cache / basename
    if not path.exists():
        temporary = path.with_suffix(".partial")
        urlretrieve(url, temporary)
        temporary.replace(path)
    return path


def integrate_band(wave, flux, lo, hi):
    interior = (wave > lo) & (wave < hi)
    grid = np.r_[lo, wave[interior], hi]
    values = np.r_[np.interp(lo, wave, flux), flux[interior], np.interp(hi, wave, flux)]
    return np.trapezoid(values, grid) / (hi - lo)


def main(cache):
    cache.mkdir(parents=True, exist_ok=True)
    cie_path = download(cache, "CIE_xyz_1931_2deg.csv", CIE)
    cmf = np.loadtxt(cie_path, delimiter=",")
    hashes = {cie_path.name: hashlib.sha256(cie_path.read_bytes()).hexdigest()}
    rows, evidence = {}, {}
    for target, lower, upper, gravity in STARS:
        bands, reference = [], []
        for temperature in dict.fromkeys((lower, upper)):
            basename = f"phoenixm00_{temperature}.fits"
            path = download(cache, basename, STSCI + basename)
            hashes[basename] = hashlib.sha256(path.read_bytes()).hexdigest()
            with fits.open(path) as hdus:
                assert int(hdus[0].header["TEFF"]) == temperature
                wave = hdus[1].data["WAVELENGTH"] * 0.1  # angstroms to nm
                flux = hdus[1].data[f"g{round(gravity * 10)}"] * 0.01  # FLAM to W m^-2 nm^-1
            assert np.all(np.diff(wave) > 0) and np.all(flux >= 0)
            total = np.trapezoid(flux, wave)
            assert 0.9 < total / (5.670374419e-8 * temperature ** 4) < 1.1
            flux /= total  # fraction of full model bolometric power per nm
            bands.append(np.array([integrate_band(wave, flux, max(360, nm-5), min(830, nm+5))
                                   for nm in CENTRES]))
            # Independent photometry on the original wavelength grid.
            xyz = [683 * np.trapezoid(flux * np.interp(wave, cmf[:, 0], curve, left=0, right=0), wave)
                   for curve in cmf[:, 1:].T]
            reference.append(np.array(xyz))
        fraction = (target-lower)/(upper-lower) if upper != lower else 0
        row = (1-fraction)*bands[0] + fraction*bands[-1]
        xyz = (1-fraction)*reference[0] + fraction*reference[-1]
        rows[target] = [float(f"{value:.9g}") for value in row]
        evidence[target] = {"bracketK": [lower, upper], "logGravityCGS": gravity,
                            "referenceXYZPerBolometricWatt": xyz.round(8).tolist()}
    table = ROOT / "src/science/data/phoenix.json"
    table.write_text("{\n" + ",\n".join(f'  "{t}": {json.dumps(row)}' for t, row in rows.items()) + "\n}\n")
    report = ROOT / "docs/stellar-sky-audit/stellar-reference.json"
    report.write_text(json.dumps({"grid": STSCI, "cie": CIE, "models": evidence, "sha256": hashes}, indent=2)+"\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("cache_directory", type=Path)
    main(parser.parse_args().cache_directory)
