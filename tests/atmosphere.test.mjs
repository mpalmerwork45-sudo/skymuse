import assert from 'node:assert/strict';
import test from 'node:test';
import {scienceModule} from './module.mjs';
const m=await scienceModule();
const world=id=>m.WORLDS.find(w=>w.id===id),earth=world('earth'),moon=world('moon');
const options={sunElevDeg:45,sunAzDeg:90,aerosolScale:1,absorptionOn:true,eyeAdapted:true,exposure:1};
const sky=(w=earth,o={})=>m.computeSky(w,{...options,...o});
const close=(a,b,tol=1e-8)=>assert.ok(Math.abs(a-b)<=tol,`${a} != ${b} ± ${tol}`);
const relative=(a,b,tol)=>close(a/b,1,tol);
const q={width:20,height:16,steps:48,layers:128,discSamples:32};

test('physical constants and solar angular diameter',()=>{
 close(m.AU_KM,149597870.7);close(m.SUN_KM,695700);
 close(sky(moon).starAngularDeg,2*Math.asin(695700/149597870.7)*180/Math.PI);
});
test('inverse-square irradiance, invariant resolved stellar radiance',()=>{
 const a=sky(moon),b=sky({...moon,distanceAU:2});
 relative(a.fluxWm2/b.fluxWm2,4,1e-12);
 for(let i=0;i<m.BANDS;i++)relative(a.discRadiance[i],b.discRadiance[i],1e-12);
 relative(a.directLux/b.directLux,4,1e-5);
});
test('finite stellar disc illuminates the horizon and a partly risen WASP star',()=>{
 const horizon=sky(moon,{sunElevDeg:0});
 const normal=m.xyz(horizon.spectrum)[1],radius=horizon.starAngularDeg*Math.PI/360;
 // Analytic small-disc asymptote: E_horizontal/E_normal = 2 alpha / (3 pi).
 relative(horizon.directLux/normal,2*radius/(3*Math.PI),.04);
 const w={...world('wasp-12b'),pressureBar:0,aerosol:{...moon.aerosol},clouds:{...moon.clouds}};
 assert.ok(sky(w,{sunElevDeg:-15}).directLux>1e5);
 close(sky(moon,{sunElevDeg:-1}).directLux,0);
});
test('CIE/Planck luminous efficacy matches independent 1 nm integration references',()=>{
 for(const [temp,ref] of [[2566,9.307],[3042,21.970],[3788,47.528],[5778,92.080],[6300,94.979]]){
  const star={name:'blackbody reference',type:'test',tempK:temp,radiusSun:1,luminosity:1};
  const eff=m.xyz(m.stellarSpectrum(star,1))[1]/(1361*m.stellarLuminosity(star));
  relative(eff,ref,.004);
 }
});
test('hydrostatic molecular column and wavelength law',()=>{
 const w={...earth,pressureBar:1.01325};
 close(m.columnFactor(w),1);close(sky(w).tauR.g,.099);
 close(m.columnFactor({...w,pressureBar:2.0265}),2);
 close(m.columnFactor({...w,gravityMs2:19.62}),.5);
 relative(sky(w).tauR.b/sky(w).tauR.r,(680/440)**4,1e-12);
});
test('300 DU ozone has measured Chappuis ordering and magnitude',()=>{
 const s=sky(earth);close(s.tauA.r,.009745752,1e-7);close(s.tauA.g,.0282135,1e-6);
 assert.ok(s.tauA.g>s.tauA.r&&s.tauA.b<s.tauA.r);
 close(sky(earth,{absorptionOn:false}).tauA.g,0);
});
test('methane follows molecule column, band structure and measured temperature interpolation',()=>{
 const w=world('uranus'),a=m.makeOptics(w,options),b=m.makeOptics({...w,pressureBar:w.pressureBar*2},options);
 for(let i=0;i<m.BANDS;i++)close(b.extinction[i][0]-b.rayleigh[i],2*(a.extinction[i][0]-a.rayleigh[i]),1e-12);
 const methane=i=>a.extinction[i][0]-a.rayleigh[i];
 assert.ok(methane(26)>methane(28)*3); // 620 nm band vs 640 nm window.
 const vacuum=sky({...w,pressureBar:0});close(vacuum.tauA.g,0);
});
test('spherical horizon columns depend on radius and scale height',()=>{
 const g=m.atmosphereGeometry(earth),p=[0,g.radius+.0017,0];
 const vertical=m.pathColumns(g,p,[0,1,0],512)[0],horizontal=m.pathColumns(g,p,[1,0,0],512)[0];
 relative(vertical,Math.exp(-.0017/g.gasH),.0002);
 // Chapman tangent-path asymptote for H/R << 1.
 relative(horizontal,Math.sqrt(Math.PI*g.radius/(2*g.gasH)),.002);
 const taller={...g,gasH:g.gasH*2,top:g.top*2};
 assert.ok(m.pathColumns(taller,p,[1,0,0],512)[0]<horizontal*.72);
 assert.equal(m.pathColumns(g,p,[0,-1,0]),null);
});
test('layered cloud profile integrates its specified optical depth',()=>{
 const w=world('venus'),g=m.atmosphereGeometry(w);
 const columns=m.verticalColumn(g,0,g.top);
 relative(columns[3],1,1e-6);
 assert.ok(sky(w).directLux<1e-15);
});
test('two-stream slabs conserve energy and have correct absorbing/conservative limits',()=>{
 for(const tau of [1e-8,.01,.1,1,10,100,1000])for(const g of [0,.5,.85]){
  const c=m.slab(tau,1,g);close(c.r+c.t,1,1e-12);
  const a=m.slab(tau,.6,g);assert.ok(a.r>=0&&a.t>=0&&a.r+a.t<=1+1e-12);
  const black=m.slab(tau,0);close(black.r,0);close(black.t,Math.exp(-2*tau),1e-12);
 }
});
test('Rayleigh and Henyey–Greenstein phase functions integrate to one over solid angle',()=>{
 const n=20000;
 const integral=fn=>{let sum=0;for(let j=0;j<n;j++)sum+=fn(-1+(j+.5)*2/n)*4*Math.PI/n;return sum;};
 close(integral(m.phaseR),1,1e-6);
 for(const g of [-.5,0,.65,.85])close(integral(mu=>m.phaseHG(mu,g)),1,1e-5);
});
test('adding solver sums interlayer reflection and ground feedback without energy creation',()=>{
 const layers=Array.from({length:60},()=>({...m.slab(.1,1,.6),up:0,down:0}));
 for(const albedo of [0,.3,.9,1]){
  const f=m.solveLayers(layers,albedo,0,1);
  close(f.up.at(-1)+(1-albedo)*f.down[0],1,1e-12);
 }
 const injected=layers.map((l,i)=>({...l,up:i===30?.4:0,down:i===30?.6:0}));
 const f=m.solveLayers(injected,0,0);close(f.up.at(-1)+f.down[0],1,1e-12);
});
test('vacuum and pure absorption create no scattered light',()=>{
 const black={...moon,aerosol:{...moon.aerosol,density:1,albedo:0}};
 for(const w of [moon,black]){
  const t=m.computeTransport(w,options,q);close(t.diffuseLux,0);close(t.twoStreamLux,0);
 }
});
test('surface albedo changes ground radiance and atmospheric multiple scattering',()=>{
 const dark={...earth,groundAlbedo:0},bright={...earth,groundAlbedo:.8};
 const a=m.computeTransport(dark,options,q),b=m.computeTransport(bright,options,q);
 close(m.luminance(a.groundRGB),0,1e-8);assert.ok(m.luminance(b.groundRGB)>10000);assert.ok(b.diffuseLux>a.diffuseLux);
});
test('higher-order scattering becomes negligible relative to first order in a thin atmosphere',()=>{
 const run=scale=>{
  const w={...earth,pressureBar:earth.pressureBar*scale,groundAlbedo:0,ozoneDU:0,aerosol:{...earth.aerosol,density:0}};
  return m.computeTransport(w,options,q);
 };
 const a=run(.01),b=run(.001);
 assert.ok(b.multipleLux/b.singleLux<a.multipleLux/a.singleLux*.2);
 assert.ok(b.multipleLux/b.singleLux<.002);
});
test('hemisphere integral of rendered radiance is the displayed diffuse illuminance',()=>{
 const t=m.computeTransport(earth,options,q);
 close(t.lux,t.diffuseLux+sky(earth).directLux,1e-8);
 relative(m.luminance(t.diffuseRGB),t.diffuseLux,.0001);
 relative(t.twoStreamLux,t.diffuseLux,.15); // Independent angular approximations agree for this clear-sky case.
});
test('thin-atmosphere radiance converges under angular/path refinement',()=>{
 const a=m.computeTransport(earth,options,q),b=m.computeTransport(earth,options,{...q,width:40,height:32,steps:96,layers:256});
 relative(a.diffuseLux,b.diffuseLux,.04);
});
test('180° equidistant projection covers zenith and every horizon azimuth',()=>{
 assert.deepEqual(m.fisheyeDirection(0,0),[0,1,-0]);
 for(const [x,y] of [[1,0],[-1,0],[0,1],[0,-1]])close(m.fisheyeDirection(x,y)[1],0,1e-12);
 assert.equal(m.fisheyeDirection(1,1),null);
 close(Math.acos(m.fisheyeDirection(0,.5)[1]),Math.PI/4);
});
test('catalogue stellar radii, temperatures and luminosities are consistent',()=>{
 for(const w of m.WORLDS)relative(w.star.luminosity,m.stellarLuminosity(w.star),1e-12);
 assert.ok(world('wasp-12b').star.luminosity>3.4);
 close(world('pluto').aerosol.density,.013);
 assert.equal(world('venus').horizonDiffuse,false);
 assert.ok(world('trappist-1e').provenance.status.includes('Hypothetical'));
});
test('physical ring bands preserve Cassini, Encke and Keeler gaps',()=>{
 assert.equal(m.ringBand(133575).tau,0);assert.equal(m.ringBand(136500).tau,0);
 assert.ok(m.ringBand(133000).tau>0);assert.ok(m.ringBand(120000).tau<m.ringBand(110000).tau);
});
test('ephemerides respond to time, latitude and orbital distance; Moon has Earth',()=>{
 const o={date:'2026-03-20T12:00:00Z',latitude:0,longitude:0,mode:'ephemeris'};
 const a=m.observe(earth,o),b=m.observe(earth,{...o,date:'2026-03-20T00:00:00Z'});
 assert.ok(a.sunElevDeg>85&&b.sunElevDeg<-85);
 assert.ok(m.observe(earth,{...o,latitude:80}).sunElevDeg<15);
 const jan=m.observe(earth,{...o,date:'2026-01-03T12:00:00Z'}),jul=m.observe(earth,{...o,date:'2026-07-04T12:00:00Z'});
 assert.ok(jan.distanceAU<jul.distanceAU);
 assert.ok(m.observe(moon,o).bodies.some(b=>b.name==='Earth'));
 const sat=m.observe(world('saturn'),o),titan=sat.bodies.find(b=>b.name==='Titan');
 assert.ok(2*Math.asin(titan.radiusKm/m.length(titan.position))/m.DEG<.27);
});
test('fixed exposure is independent of scene brightness; adapted gain handles extreme daylight',()=>{
 for(const l of [.0001,1,1e4,1e8])close(m.displayGain(l,false),m.CAMERA_GAIN);
 assert.ok(m.displayGain(1e8,true)<1e-6);
});
test('all catalogue presets remain finite at noon, horizon and night',()=>{
 for(const w of m.WORLDS)for(const sunElevDeg of [-90,-15,0,45,90]){
  const s=sky(w,{sunElevDeg});
  for(const x of [...s.spectrum,...s.discRadiance,...s.directSpectrum,s.directLux,s.starAngularDeg])assert.ok(Number.isFinite(x)&&x>=0,`${w.id} ${sunElevDeg}: ${x}`);
 }
});
