import {useEffect,useRef,useState} from 'react';
import type {WorldSpec} from './worlds';
import type {SkyOptions} from './atmosphere';
import type {TransportResult} from './transport';

export function useTransport(world:WorldSpec,options:SkyOptions){
 const [completed,setCompleted]=useState<{result:TransportResult;world:WorldSpec;options:SkyOptions;key:string}|null>(null),[busy,setBusy]=useState(true),[error,setError]=useState<string|null>(null);
 const worker=useRef<Worker|null>(null),serial=useRef(0),running=useRef(false),pending=useRef<{id:number;world:WorldSpec;options:SkyOptions;key:string}|null>(null);
 const active=useRef<{world:WorldSpec;options:SkyOptions;key:string}|null>(null);
 const key=JSON.stringify([world,options.sunElevDeg,options.sunAzDeg,options.aerosolScale,options.absorptionOn,options.observerHeightKm]);
 useEffect(()=>{
  const w=new Worker(new URL('./sky.worker.ts',import.meta.url),{type:'module'});worker.current=w;
  const send=()=>{if(pending.current){active.current=pending.current;w.postMessage(pending.current);pending.current=null;running.current=true;}};
  w.onmessage=e=>{
   running.current=false;
   if(e.data.id===serial.current){
    if(e.data.error)setError(e.data.error);else if(active.current){setCompleted({result:e.data.result,...active.current});setError(null);}
    setBusy(false);
   }send();
  };
  w.onerror=e=>{setError(e.message);setBusy(false);running.current=false;};
  return()=>{w.terminate();worker.current=null;running.current=false;};
 },[]);
 useEffect(()=>{
  serial.current++;pending.current={id:serial.current,world,options,key};setBusy(true);
  // Coalesce slider input; one calculation runs and only the latest waits.
  const timer=setTimeout(()=>{if(!running.current&&worker.current&&pending.current){active.current=pending.current;worker.current.postMessage(pending.current);pending.current=null;running.current=true;}},100);
  return()=>clearTimeout(timer);
 },[key]);
 return {result:completed?.result??null,completed,busy:busy||(!error&&completed?.key!==key),error};
}
