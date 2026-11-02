import fs from 'node:fs';
import assert from 'node:assert/strict';
import {scienceModule} from '../../tests/module.mjs';
const m=await scienceModule(),results=[];
const quality={width:8,height:8,steps:32,layers:96,discSamples:12};
for(const w of m.WORLDS){
  for(const elevation of [-20,45]){
    const a=m.observe(w,{date:'2026-10-30T06:00:00Z',latitude:20,longitude:0,mode:'manual'},elevation,90);
    const illuminants=m.companionIlluminants(w,a);
    const o={sunElevDeg:elevation,sunAzDeg:90,aerosolScale:1,absorptionOn:true,eyeAdapted:true,exposure:1,refractionOn:true,illuminants};
    const s=m.computeSky(w,o),t=m.computeTransport(w,o,quality);
    for(const data of [t.radiance,t.columns,t.diffuseSpectrum])assert.ok(data.every(Number.isFinite),w.id+' nonfinite');
    assert.ok(t.diffuseSpectrum.every(v=>v>=0),w.id+' negative spectrum');
    assert.ok(Number.isFinite(t.lux)&&t.lux>=0,w.id+' bad lux');
    const total=m.xyz(s.directSpectrum)[1]+t.diffuseLux;
    assert.ok(Math.abs(total-t.lux)<Math.max(1,total)*1e-10);
    results.push({world:w.id,trueElevation:elevation,companionSources:illuminants.map(l=>l.name),reflectedDirectLux:s.secondaryDirectLux,lux:t.lux,elapsedMs:t.elapsedMs});
  }
}
fs.writeFileSync(new URL('./preset-smoke.json',import.meta.url),JSON.stringify({passed:true,quality,results},null,2)+'\n');
console.log(JSON.stringify({passed:true,cases:results.length,presets:m.WORLDS.length}));
