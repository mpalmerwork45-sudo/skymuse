/** Hemispheric two-stream adding solver. All reflections are summed analytically.
 * Approximate angular closure; scalar energy conservation is exact for its layers.
 * See Heng et al. 2014, doi:10.1088/0004-637X/795/2/120 and model notes. */
export interface Layer { r:number; t:number; up:number; down:number; }
export function slab(tau:number,omega:number,g=0):{r:number;t:number} {
  if(tau<1e-12) return {r:0,t:1};
  const a=2-omega*(1+g), b=omega*(1-g);
  const k=Math.sqrt(Math.max(0,a*a-b*b));
  if(k<1e-8) return {r:b*tau/(1+a*tau),t:1/(1+a*tau)};
  const e=Math.exp(-k*tau),den=(k+a)+(k-a)*e*e;
  return {r:b*(1-e*e)/den,t:2*k*e/den};
}
/** Source photons are injected centrally and include internal reflections. */
export function emittingLayer(tau:number,omega:number,g:number,up:number,down:number):Layer {
  const whole=slab(tau,omega,g),half=slab(tau/2,omega,g),den=1-half.r*half.r;
  return {...whole,up:half.t*(up+half.r*down)/den,down:half.t*(down+half.r*up)/den};
}
/** Index 0 = bottom. The lower boundary reflects down flux and emits given flux. */
export function solveLayers(layers:Layer[],albedo:number,groundEmission:number,incident=0):{up:Float64Array;down:Float64Array} {
  const n=layers.length,R=new Float64Array(n+1),S=new Float64Array(n+1);
  R[0]=albedo; S[0]=groundEmission;
  for(let j=0;j<n;j++) {
    const l=layers[j],den=1-l.r*R[j];
    R[j+1]=l.r+l.t*l.t*R[j]/den;
    S[j+1]=l.up+l.t*(S[j]+R[j]*l.down)/den;
  }
  const up=new Float64Array(n+1),down=new Float64Array(n+1);down[n]=incident;
  for(let j=n-1;j>=0;j--) {
    const l=layers[j];down[j]=(l.t*down[j+1]+l.r*S[j]+l.down)/(1-l.r*R[j]);
    up[j]=R[j]*down[j]+S[j];
  }
  up[n]=R[n]*down[n]+S[n];
  return {up,down};
}
