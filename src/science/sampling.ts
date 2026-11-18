/** Add physical layer boundaries to a monotone integration grid. Keep both
 * endpoints and remove coincident interior nodes to avoid zero-length cells. */
export function mergeGrid(base:number[], interior:number[]):number[] {
  if (!interior.length) return base;
  const first=base[0], last=base[base.length-1];
  const points=base.concat(interior.filter(x=>x>first&&x<last)).sort((a,b)=>a-b);
  const result=[first];
  for (const point of points) {
    if (point<last-1e-12 && point-result[result.length-1]>1e-12) result.push(point);
  }
  result.push(last);
  return result;
}

/** Lower sample bracketing a coordinate on a monotone grid. */
export function lowerIndex(grid:ArrayLike<number>,coordinate:number):number {
  let low=0, high=grid.length-1;
  while(high-low>1){
    const mid=(low+high)>>1;
    if(grid[mid]<=coordinate) low=mid;
    else high=mid;
  }
  return low;
}
