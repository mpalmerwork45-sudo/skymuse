// Run with Node from the project after npm ci. Requires curl and 7z.
// Optional first argument is a directory for the checksummed download cache.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scienceModule } from '../../tests/module.mjs';

const model = await scienceModule();
const earth = model.WORLDS.find(world => world.id === 'earth');
const cache = process.argv[2] ?? join(tmpdir(), 'skymuse-measured-zenith');
mkdirSync(cache, { recursive: true });

function download(name, url, algorithm, digest) {
  const path = join(cache, name);
  const data = existsSync(path) ? readFileSync(path) : execFileSync('curl', ['-fsSL', url], { maxBuffer: 8 * 1024 * 1024 });
  if (createHash(algorithm).update(data).digest('hex') !== digest) throw new Error(`Checksum mismatch for ${name}`);
  if (!existsSync(path)) writeFileSync(path, data);
  return path;
}

const cieFile = download('CIE_xyz_1931_2deg.csv', 'https://files.cie.co.at/Publications-datasets/CIE_xyz_1931_2deg.csv',
  'md5', '17cca777db64b17170f06f67ce9d3ab7');
const cie = readFileSync(cieFile, 'utf8').trim().split(/\r?\n/).map(row => row.split(',').map(Number));
const upstream = 'https://raw.githubusercontent.com/spectralskylight/sky-measurements-2014/f915674fc632593b03edd3068d09902924449bd9/data';
const scans = [
  ['2013-09-24', '07.50.00', '9f85d51fe8f4587f4cddd9377abeb5183fc271225333d45e172a50fd8462149e'],
  ['2013-05-27', '09.30.00', '7d14e0e1667a33e956031f1b77eca97938272e7b42c4c15dcdc99aaad53bdd3a'],
  ['2013-05-27', '12.00.00', '05ccb29ca34a054cf8018c71cd05a3440e74d2f9620c929987a75642a0bcf378'],
];
function photometry([X, Y, Z]) {
  const total = X + Y + Z;
  return { cdM2: Y, x: X / total, y: Y / total };
}
function measuredXYZ(file, name, position) {
  const entry = `${name}/${name}_-_${position}.asd.rad.txt`;
  const rows = execFileSync('7z', ['x', '-so', file, entry], { encoding: 'utf8' }).trim().split(/\r?\n/).slice(1);
  const radiance = new Map(rows.map(row => row.trim().split(/\s+/).map(Number)));
  const xyz = [0, 0, 0];
  for (const [nm, ...cmf] of cie) {
    const sample = radiance.get(nm); // W m⁻² sr⁻¹ nm⁻¹ on the instrument's 1 nm output grid
    if (!Number.isFinite(sample)) throw new Error(`Missing measurement at ${nm} nm in ${name}`);
    const weight = nm === 360 || nm === 830 ? .5 : 1;
    for (let i = 0; i < 3; i++) xyz[i] += sample * cmf[i] * weight * 683;
  }
  return xyz;
}
// Average linear radiance around a ring. The solar-only texture spans half
// the sky by symmetry. Trapezoidal endpoint weights give the azimuth mean.
function ringXYZ(sky, elevationDegrees) {
  const row = Math.sqrt(elevationDegrees / 90) * (sky.height - 1);
  const lo = Math.floor(row), hi = Math.min(lo + 1, sky.height - 1), fraction = row - lo;
  const average = [0, 0, 0];
  for (let x = 0; x < sky.width; x++) {
    const weight = (x === 0 || x === sky.width - 1 ? .5 : 1) / (sky.width - 1);
    for (let channel = 0; channel < 3; channel++) {
      const lower = sky.radiance[4 * (lo * sky.width + x) + channel];
      const upper = sky.radiance[4 * (hi * sky.width + x) + channel];
      average[channel] += weight * (lower + fraction * (upper - lower));
    }
  }
  const [r, g, b] = average;
  return [.4124*r + .3576*g + .1805*b, .2126*r + .7152*g + .0722*b, .0193*r + .1192*g + .9505*b];
}
for (const [day, time, digest] of scans) {
  const name = `${day}___${time}`;
  const file = download(`${name}.7z`, `${upstream}/${day}/RADIANCE/${name}.7z`, 'sha256', digest);
  const date = `${day}T${time.replaceAll('.', ':')}-04:00`;
  const sun = model.observe(earth, { latitude: 42.443449, longitude: -76.481962, date, mode: 'ephemeris' });
  const sky = model.computeTransport({ ...earth, distanceAU: sun.distanceAU }, {
    sunElevDeg: sun.sunElevDeg, sunAzDeg: sun.sunAzDeg, aerosolScale: 1, absorptionOn: true, eyeAdapted: false, exposure: 1,
  });
  const ring = [0, 0, 0];
  for (let i = 0; i < 24; i++) {
    const sample = measuredXYZ(file, name, `${32 + i}____${345 - i * 15}.0___33.749`);
    for (let channel = 0; channel < 3; channel++) ring[channel] += sample[channel] / 24;
  }
  for (const [viewElevation, observed] of [[90, measuredXYZ(file, name, '80____0.0___90.0')], [33.749, ring]]) {
    const measured = photometry(observed), modeled = photometry(ringXYZ(sky, viewElevation));
    console.log(JSON.stringify({ date, sunElevDeg: sun.sunElevDeg, viewElevation, measured, modeled,
      errorPercent: 100 * (modeled.cdM2 / measured.cdM2 - 1) }));
  }
}
