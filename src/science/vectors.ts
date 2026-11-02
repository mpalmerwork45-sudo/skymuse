import type { Vec3 } from './spectrum';

export const dot = (a: Vec3, b: Vec3) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
export const length = (v: Vec3) => Math.hypot(...v);
export const scale = (v: Vec3, s: number): Vec3 => [v[0]*s,v[1]*s,v[2]*s];
export const add = (a: Vec3,b: Vec3): Vec3 => [a[0]+b[0],a[1]+b[1],a[2]+b[2]];
export const sub = (a: Vec3,b: Vec3): Vec3 => [a[0]-b[0],a[1]-b[1],a[2]-b[2]];
export const unit = (v: Vec3): Vec3 => scale(v,1/Math.max(1e-30,length(v)));
export const cross = (a: Vec3,b: Vec3): Vec3 => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
