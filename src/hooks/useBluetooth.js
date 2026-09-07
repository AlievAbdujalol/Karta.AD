import { useState, useEffect } from 'react';

export function useBluetooth(){
  const [supported, setSupported]=useState(false);
  const [device, setDevice]=useState(null);
  const [connected, setConnected]=useState(false);
  useEffect(()=> setSupported(typeof navigator!=='undefined' && 'bluetooth' in navigator),[]);
  const request=async()=>{
    if(!supported) return null;
    try{
      const d=await navigator.bluetooth.requestDevice({ acceptAllDevices:true, optionalServices:['battery_service'] });
      setDevice(d); const onDisc=()=>setConnected(false); d.addEventListener('gattserverdisconnected', onDisc);
      await d.gatt?.connect(); setConnected(true);
      try{ localStorage.setItem('karta_bluetooth_device', d.name||'auto'); }catch{}
      return d;
    }catch{ return null; }
  };
  useEffect(()=>{
    try{ const v=JSON.parse(localStorage.getItem('karta_vehicle')||'{}'); if(v.bluetooth_enabled && supported){
      // auto: listen for already paired? WebBT requires user gesture, so just toast
    }}catch{}
  },[supported]);
  return { supported, device, connected, request };
}
