import {build} from 'esbuild';
export async function scienceModule(){
 const paths=['worlds','spectrum','geometry','atmosphere','twoStream','transport','astronomy','customWorld','habitableZone','refraction'];
 const contents=paths.map(p=>`export * from './src/science/${p}.ts';`).join('\n');
 const b=await build({stdin:{contents,resolveDir:new URL('..',import.meta.url).pathname},bundle:true,write:false,format:'esm',platform:'node'});
 return import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'));
}
