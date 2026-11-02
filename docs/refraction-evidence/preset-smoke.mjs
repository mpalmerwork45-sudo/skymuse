import fs from 'node:fs';
import assert from 'node:assert/strict';
import {scienceModule} from '../../tests/module.mjs';

const m=await scienceModule(),results=[];
const quality={width:8,height:8,steps:32,layers:96,discSamples:12};
for(const w of m.WORLDS){
  for(const elevation of [-.5,45]){
    const o={sunElevDeg:elevation,sunAzDeg:90,aerosolScale:1,absorptionOn:true,eyeAdapted:true,exposure:1,refractionOn:true};
    const s=m.computeSky(w,o),t=m.computeTransport(w,o,quality);
    for(const a of [t.radiance,t.columns,t.diffuseSpectrum,s.refraction.forward,s.refraction.inverse]){
      assert.ok(a.every(Number.isFinite),w.id+' nonfinite transport/map');
    }
    assert.ok(t.diffuseSpectrum.every(x=>x>=0),w.id+' negative spectral radiance');
    assert.ok(Number.isFinite(t.lux)&&t.lux>=0,w.id+' bad illuminance');
    results.push({world:w.id,trueElevation:elevation,apparentElevation:s.sunApparentElevDeg,lux:t.lux,diffuseLux:t.diffuseLux,elapsedMs:t.elapsedMs});
  }
}
fs.writeFileSync(new URL('./preset-smoke.json',import.meta.url),JSON.stringify({passed:true,quality,results},null,2)+'\n');
console.log(JSON.stringify({passed:true,cases:results.length,presets:m.WORLDS.length}));
