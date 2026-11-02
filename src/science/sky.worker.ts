import { computeTransport } from './transport';
import type { WorldSpec } from './worlds';
import type { SkyOptions } from './atmosphere';
self.onmessage=(event:MessageEvent<{id:number;world:WorldSpec;options:SkyOptions}>)=>{
  try {
    const result=computeTransport(event.data.world,event.data.options);
    self.postMessage({id:event.data.id,result});
  } catch(error) { self.postMessage({id:event.data.id,error:String(error)}); }
};
