const fs = require('node:fs/promises');
const {chromium} = require(process.env.SKYMUSE_PLAYWRIGHT_PATH || 'playwright');
const out=__dirname;
const baseUrl=process.env.SKYMUSE_AUDIT_URL || 'http://127.0.0.1:5173';
(async()=>{
 await fs.mkdir(out,{recursive:true});
 const browser=await chromium.launch({executablePath:process.env.SKYMUSE_CHROME_PATH || '/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try {
 const page=await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:1});
 const errors=[]; page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(`${baseUrl}/tests/sky-render.html`);
 await page.waitForFunction(()=>window.skyRenderResults);
 const regression=await page.evaluate(()=>window.skyRenderResults);
 await page.goto(`${baseUrl}/`);
 await page.getByRole('heading',{name:/SKYMUSE/}).waitFor();
 await page.waitForTimeout(1000);
 await page.screenshot({path:`${out}/earth-ui.png`});
 await page.getByRole('switch',{name:'All-sky fisheye dome'}).click();
 await page.waitForTimeout(500);
 await page.screenshot({path:`${out}/fisheye-ui.png`});
 await page.getByRole('button',{name:'Saturn',exact:true}).click();
 await page.waitForTimeout(500);
 await page.screenshot({path:`${out}/saturn-ui.png`});
 const result=await page.evaluate(async()=>{
  const THREE=await import('/node_modules/.vite/deps/three.js');
  const {WORLDS}=await import('/src/science/worlds.ts');
  const {computeSky}=await import('/src/science/atmosphere.ts');
  const {createSkyMaterial,updateSkyUniforms}=await import('/src/three/skyShader.ts');
  const opts={sunElevDeg:45,sunAzDeg:90,aerosolScale:1,absorptionOn:true,eyeAdapted:true,exposure:1};
  const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
  renderer.setSize(640,400); renderer.setPixelRatio(1);
  const scene=new THREE.Scene(), camera=new THREE.PerspectiveCamera(60,1.6,0.1,20000);
  camera.position.set(0,1.7,0);
  const {material,uniforms}=createSkyMaterial();
  const dome=new THREE.Mesh(new THREE.SphereGeometry(8000,48,32),material); dome.position.y=1.7; scene.add(dome);
  const gl=renderer.getContext();
  const world=id=>WORLDS.find(w=>w.id===id);
  const DEG=Math.PI/180;
  function render(w,e,{pitch=3,az=90,fov=60,changes={}}={}){
   const s=computeSky(w,{...opts,sunElevDeg:e,...changes});
   camera.fov=fov;camera.updateProjectionMatrix();
   camera.lookAt(Math.sin(az*DEG)*Math.cos(pitch*DEG),1.7+Math.sin(pitch*DEG),-Math.cos(az*DEG)*Math.cos(pitch*DEG));
   updateSkyUniforms(uniforms,w,s);uniforms.uCamPos.value.copy(camera.position);uniforms.uSunDir.value.set(Math.cos(e*DEG),Math.sin(e*DEG),0);uniforms.uTime.value=0;
   renderer.render(scene,camera);
   const pixel=(x,y)=>{const p=new Uint8Array(4);gl.readPixels(x,y,1,1,gl.RGBA,gl.UNSIGNED_BYTE,p);return [...p].slice(0,3)};
   return {image:renderer.domElement.toDataURL(),center:pixel(320,200),side:pixel(100,200),top:pixel(320,350),ground:pixel(320,30),lux:s.lux};
  }
  const frames=[];
  for(const [id,e] of [['earth',45],['earth',2],['earth',-6],['earth',-15],['mars',45],['mars',2],['venus',45],['venus',2],['titan',45],['titan',2],['uranus',45],['neptune',45],['pluto',45],['pluto',2],['moon',45],['moon',-15],['wasp-12b',85],['wasp-12b',-15]]) frames.push({id,e,...render(world(id),e,{pitch:e>10?25:3})});
  const baseline=render(world('earth'),45);
  const height=render({...world('earth'),scaleHeightKm:84},45);
  const albedo=render({...world('earth'),groundAlbedo:0.99},45);
  const syntheticOpaque={...world('moon'),aerosol:{...world('moon').aerosol,density:100,albedo:0}};
  const vacuumNight=render(world('moon'),-15,{pitch:45,az:0,changes:{eyeAdapted:false}});
  const opaqueNight=render(syntheticOpaque,-15,{pitch:45,az:0,changes:{eyeAdapted:false}});
  frames.push({id:'opaque-absorber-night',e:-15,...opaqueNight});
  const pixels=new Uint8Array(640*400*4);gl.readPixels(0,0,640,400,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
  let nonBlackPixels=0,maxChannel=0;
  for(let i=0;i<pixels.length;i+=4){const m=Math.max(pixels[i],pixels[i+1],pixels[i+2]);if(m>0)nonBlackPixels++;maxChannel=Math.max(maxChannel,m);}
  const opaqueNightPixelStats={pixels:640*400,nonBlackPixels,maxChannel};
  // Read untone-mapped production shader output in a float render target.
  const raw=createSkyMaterial();
  raw.material.fragmentShader=raw.material.fragmentShader.replace('gl_FragColor = vec4(col, 1.0);','gl_FragColor = vec4(hdr / (uExposure * DISPLAY), 1.0);');
  dome.material=raw.material;
  const target=new THREE.WebGLRenderTarget(65,65,{type:THREE.FloatType,format:THREE.RGBAFormat});
  renderer.setRenderTarget(target);camera.aspect=1;camera.fov=0.001;camera.updateProjectionMatrix();
  camera.lookAt(Math.cos(45*DEG),1.7+Math.sin(45*DEG),0);
  const sunSamples=[];
  for(const distanceAU of [1,2,10,39.5]){
   const w={...world('moon'),distanceAU},s=computeSky(w,{...opts,eyeAdapted:false});
   updateSkyUniforms(raw.uniforms,w,s);raw.uniforms.uCamPos.value.copy(camera.position);raw.uniforms.uSunDir.value.set(Math.cos(45*DEG),Math.sin(45*DEG),0);
   renderer.render(scene,camera);const p=new Float32Array(4);renderer.readRenderTargetPixels(target,32,32,1,1,p);
   sunSamples.push({distanceAU,rawCenter:[...p].slice(0,3),angularDeg:s.starAngularDeg,fluxRel:s.fluxRel});
  }
  const glError=gl.getError();target.dispose();material.dispose();raw.material.dispose();dome.geometry.dispose();renderer.dispose();
  return {frames,sunSamples,scaleHeightImageUnchanged:height.image===baseline.image,groundAlbedoImageUnchanged:albedo.image===baseline.image,opaqueNightIdenticalToVacuum:opaqueNight.image===vacuumNight.image,opaqueNightPixelStats,glError};
 });
 for(const frame of result.frames){await fs.writeFile(`${out}/${frame.id}-${frame.e}.png`,Buffer.from(frame.image.split(',')[1],'base64'));}
 const gallery=result.frames.map(f=>`<figure><img src="${f.image}"><figcaption>${f.id} · Sun ${f.e}° · ${f.lux.toPrecision(4)} model lux</figcaption></figure>`).join('');
 const galleryPage=await browser.newPage({viewport:{width:1020,height:800},deviceScaleFactor:1});
 await galleryPage.setContent(`<html><style>body{background:#16191e;color:#eee;font:14px sans-serif;margin:16px}main{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}figure{margin:0}img{width:100%;display:block}figcaption{padding:7px 0}</style><h2>Skymuse science audit — production sky shader</h2><p>Preset panels: Human eye mode, exposure 1, default aerosols and absorption. Final panel: synthetic opaque absorber, fixed exposure.</p><main>${gallery}</main></html>`);
 await galleryPage.screenshot({path:`${out}/gallery.png`,fullPage:true});
 const measurements={regression,...result,errors}; measurements.frames=measurements.frames.map(({image,...f})=>f);
 await fs.writeFile(`${out}/browser.json`,JSON.stringify(measurements,null,2)+'\n');
 console.log(JSON.stringify({regression,errors,sunSamples:result.sunSamples,scaleHeightImageUnchanged:result.scaleHeightImageUnchanged,groundAlbedoImageUnchanged:result.groundAlbedoImageUnchanged,opaqueNightIdenticalToVacuum:result.opaqueNightIdenticalToVacuum,glError:result.glError},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
