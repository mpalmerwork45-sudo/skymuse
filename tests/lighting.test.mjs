import assert from 'node:assert/strict';
import test from 'node:test';
import {scienceModule} from './module.mjs';
const m=await scienceModule(),world=id=>m.WORLDS.find(w=>w.id===id);
const options={sunElevDeg:-80,sunAzDeg:90,aerosolScale:1,absorptionOn:true,eyeAdapted:false,exposure:1};
const quality={width:12,height:10,steps:32,layers:96,discSamples:16};
const body={name:'reference',position:[0,0,300000],radiusKm:1737.4,albedo:.12,colour:'#bbbbbb',sunDirection:[0,0,-1],approximate:false};
const relative=(a,b,tol)=>assert.ok(Math.abs(a/b-1)<tol,`${a} / ${b}`);

test('Lambert companion irradiance agrees with independent projected-disc integration at multiple phases',()=>{
  const star=m.stellarSpectrum(world('earth').star,1),n=40000,rho=.12;
  for(const alpha of [0,Math.PI/3,Math.PI/2,2*Math.PI/3]){
    const sun=[Math.sin(alpha),0,-Math.cos(alpha)];let mean=0;
    for(let i=0;i<n;i++){
      const r=Math.sqrt((i+.5)/n),phi=i*Math.PI*(3-Math.sqrt(5));
      const normal=[r*Math.cos(phi),r*Math.sin(phi),-Math.sqrt(1-r*r)];
      mean+=Math.max(0,m.dot(normal,sun))/n;
    }
    const expected=star[19]*rho*(body.radiusKm/300000)**2*mean;
    relative(m.reflectedIrradiance(body,star,sun)[19],expected,.001);
  }
  assert.equal(m.lambertPhase(Math.PI),0);
});

test('reflected illumination scales with observer distance, source power and surface reflectance',()=>{
  const star=m.stellarSpectrum(world('earth').star,1),sun=[0,0,-1];
  const base=m.reflectedIrradiance(body,star,sun)[19];
  relative(m.reflectedIrradiance({...body,position:[0,0,600000]},star,sun)[19],base/4,1e-10);
  relative(m.reflectedIrradiance({...body,albedo:.24},star,sun)[19],base*2,1e-7);
  relative(m.reflectedIrradiance(body,star.map(e=>2*e),sun)[19],base*2,1e-12);
  assert.ok(m.xyz(m.reflectedIrradiance(body,star,sun))[1]>.2);
  assert.ok(m.xyz(m.reflectedIrradiance(body,star,sun))[1]<.5);
  assert.ok(m.reflectedIrradiance(body,star,[0,0,1]).every(e=>e===0));
});

test('parent-planet shadows remove companion illumination in the umbra',()=>{
  const w=world('earth'),b={...body,position:[0,300000,0]},a={bodies:[b],ringOrigin:[0,-w.radiusKm,0]};
  assert.equal(m.companionShadow(b,w,a,[0,-1,0],.00465),0);
  relative(m.companionShadow(b,w,a,m.direction(90,-85),.00465),1,1e-12);
});

test('another companion can eclipse the reflected illuminant',()=>{
  const w=world('earth'),b={...body,position:[0,300000,0]};
  const blocker={...body,name:'occulter',position:[0,150000,0],radiusKm:3000};
  const a={bodies:[b,blocker],ringOrigin:[1e9,0,0]};
  assert.equal(m.companionShadow(b,w,a,[0,-1,0],.00465),0);
  a.bodies=[b];relative(m.companionShadow(b,w,a,[0,-1,0],.00465),1,1e-12);
});

test('an illuminated companion lights airless ground without fabricating atmospheric glow',()=>{
  const w=world('moon'),a=m.observe(w,{date:'2026-10-30T06:00:00Z',latitude:0,longitude:0,mode:'manual'},-80,90);
  a.bodies=[{...body,position:m.scale(m.direction(270,70),300000)}];
  const illuminants=m.companionIlluminants(w,a),s=m.computeSky(w,{...options,illuminants});
  assert.equal(illuminants.length,1);assert.ok(s.secondaryDirectLux>.1);
  const dark=m.computeTransport(w,options,quality),lit=m.computeTransport(w,{...options,illuminants},quality);
  assert.equal(lit.diffuseLux,0);assert.ok(m.luminance(lit.groundRGB)>.001);
  assert.ok(m.luminance(lit.groundRGB)>m.luminance(dark.groundRGB)*1e6);
  assert.equal(lit.groundLights.length,2);
});

test('rotated sky components add linearly and preserve the secondary source azimuth',()=>{
  const w=world('earth'),spectrum=m.stellarSpectrum(w.star,1).map(e=>e*1e-6);
  const source={name:'reference moon',direction:m.direction(20,35),radiusRad:.00465,spectrum};
  const a=m.computeTransport(w,options,quality),b=m.computeTransport(w,{...options,illuminants:[source]},quality);
  const doubled={...source,spectrum:spectrum.map(e=>e*2)},c=m.computeTransport(w,{...options,illuminants:[doubled]},quality);
  relative(c.diffuseLux-a.diffuseLux,2*(b.diffuseLux-a.diffuseLux),1e-8);
  assert.equal(b.fullAzimuth,true);
  assert.ok(b.diffuseLux>a.diffuseLux);
  // Inspect opposite sides of the primary star's meridian. A second source
  // invalidates the old forced mirror symmetry around that meridian.
  const row=5,at=x=>m.luminance(Array.from(b.radiance.slice((row*b.width+x)*4,(row*b.width+x)*4+3)));
  assert.ok(Math.abs(at(4)-at(b.width-1-4))>Math.max(at(4),at(b.width-1-4))*.1);
  for(let y=0;y<b.height;y++)for(let k=0;k<3;k++)relative(b.radiance[(y*b.width)*4+k]+1e-20,b.radiance[(y*b.width+b.width-1)*4+k]+1e-20,1e-6);
});

test('adding an unlit companion does not count thermal emission twice',()=>{
  const moon=world('moon'),w={...moon,temperatureK:2000,aerosol:{...moon.aerosol,density:1,albedo:0}};
  const zero={name:'dark companion',direction:m.direction(0,45),radiusRad:.004,spectrum:new Float64Array(m.BANDS)};
  const a=m.computeTransport(w,options,quality),b=m.computeTransport(w,{...options,illuminants:[zero]},quality);
  assert.ok(a.diffuseLux>0);relative(a.diffuseLux,b.diffuseLux,1e-12);
  relative(m.luminance(a.groundRGB),m.luminance(b.groundRGB),1e-12);
});
