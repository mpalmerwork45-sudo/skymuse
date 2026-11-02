import fs from 'node:fs/promises';
import ts from 'typescript';
import {fileURLToPath} from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url)).replace(/\/$/, '');
async function mod(path) {
  const source = await fs.readFile(`${root}/${path}`, 'utf8');
  const {outputText} = ts.transpileModule(source, {compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.ESNext}});
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}
const {computeSky,airMass} = await mod('src/science/atmosphere.ts');
const {WORLDS} = await mod('src/science/worlds.ts');
const opts = {sunElevDeg:45,sunAzDeg:90,aerosolScale:1,absorptionOn:true,eyeAdapted:true,exposure:1};
const world = id => WORLDS.find(w=>w.id===id);
const s = (w,changes={})=>computeSky(w,{...opts,...changes});
const rows = WORLDS.map(w=>({id:w.id,flux:s(w).fluxWm2,angularDeg:s(w).starAngularDeg,rayleighG:s(w).tauR.g,absorption:s(w).tauA,lux45:s(w).lux,lux2:s(w,{sunElevDeg:2}).lux,luxMinus15:s(w,{sunElevDeg:-15}).lux,stellarLuminosity:w.star.luminosity,luminosityFromRadiusTemperature:w.star.radiusSun**2*(w.star.tempK/5778)**4}));
const earth=world('earth'),moon=world('moon'),wasp=world('wasp-12b');
const height=s({...earth,scaleHeightKm:earth.scaleHeightKm*10});
const albedo=s({...earth,groundAlbedo:0.99});
// Adjust radius as T^-2 to keep luminosity physically consistent at fixed flux.
const temperatures=[2566,3042,5778,10000].map(tempK=>{
  const radiusSun=(moon.star.tempK/tempK)**2;
  const star={...moon.star,tempK,radiusSun};
  return {tempK,radiusSun,luminosity:star.luminosity,lux:s({...moon,star}).lux,starColor:s({...moon,star}).starColor};
});
const report={rows,temperatureLux:temperatures,scaleHeightChangesState:JSON.stringify(height)!==JSON.stringify(s(earth)),groundAlbedoChangesState:JSON.stringify(albedo)!==JSON.stringify(s(earth)),horizonSunAirMass:airMass(0),horizonViewAirMass:1/0.15*2.5,fisheyeTransparentDiameterDeg:2*Math.atan(0.66*Math.tan(75*Math.PI/180))*180/Math.PI,waspAtMinus15:{visibleLimbElevation:-15+s(wasp).starAngularDeg/2,twilight:s(wasp,{sunElevDeg:-15}).twilightLight,lux:s(wasp,{sunElevDeg:-15}).lux,adaptGain:s(wasp,{sunElevDeg:-15}).adaptGain}};
await fs.mkdir(`${root}/docs/science-audit-evidence`,{recursive:true});
await fs.writeFile(`${root}/docs/science-audit-evidence/numerical.json`,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
