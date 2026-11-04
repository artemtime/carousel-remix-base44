import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { loadImage } from "@/lib/slide-renderer";
import { fetchImageData } from "@/lib/server-fns";
import { saveHeroReference } from "@/lib/hero-reference";
export default function SelectHeroReference({style,onSaved}) {
  const sources=[...new Set([...(style.source_slide_urls || []),style.hero_sheet_url].filter(Boolean))];
  const [open,setOpen]=useState(false),[url,setUrl]=useState(sources[0] || ""),[box,setBox]=useState(null),[busy,setBusy]=useState(false);
  const start=useRef(null),frame=useRef(null),save=useServerFn(saveHeroReference),proxy=useServerFn(fetchImageData);
  const point=e=>{const r=frame.current.getBoundingClientRect();return {x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))};};
  const move=e=>{if(!start.current)return;const p=point(e);setBox({x:Math.min(p.x,start.current.x),y:Math.min(p.y,start.current.y),w:Math.abs(p.x-start.current.x),h:Math.abs(p.y-start.current.y)});};
  const persist=async()=>{
    if(!box || box.w<.03 || box.h<.03)return toast.error("Обведите лицо и отличительные детали одного героя");
    setBusy(true);
    try {
      const image=await loadImage(url,u=>proxy({data:{url:u}}));if(!image)throw new Error("Образец не загрузился");
      const canvas=document.createElement("canvas"),w=image.naturalWidth || image.width,h=image.naturalHeight || image.height;
      canvas.width=Math.max(64,Math.round(w*box.w));canvas.height=Math.max(64,Math.round(h*box.h));
      canvas.getContext("2d").drawImage(image,box.x*w,box.y*h,box.w*w,box.h*h,0,0,canvas.width,canvas.height);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/png"));if(!blob)throw new Error("Не удалось сохранить выделение");
      const {file_url}=await base44.integrations.Core.UploadPublicFile({file:new File([blob],"hero-reference.png",{type:"image/png"})});
      await save({data:{styleId:style.id,url:file_url,sourceUrl:url,bounds:box}});
      toast.success("Выбранный герой и его внешность сохранены");setOpen(false);await onSaved?.();
    }catch(error){toast.error(String(error.message || error).slice(0,220));}finally{setBusy(false);}
  };
  if(!sources.length)return null;
  return <div className="space-y-2">
    <button type="button" onClick={()=>setOpen(!open)} className="rounded-lg border border-border px-3 py-2 text-[12px]">Выбрать героя на образце</button>
    {style.hero?.identity_reference_url && <img src={style.hero.identity_reference_url} alt="Выбранный портрет героя" className="h-24 max-w-full rounded-lg object-contain" />}
    {open && <div className="space-y-3 rounded-lg border border-border p-3">
      <p className="text-[12px] text-muted-foreground">Обведите одного героя: лицо, причёску и узнаваемые детали. Сохранение уточнит описание без рисования новой картинки.</p>
      <select aria-label="Образец для выбора героя" value={url} disabled={busy} onChange={e=>{setUrl(e.target.value);setBox(null);}} className="w-full rounded border border-border bg-input px-2 py-2 text-[12px]">{sources.map((u,i)=><option key={u} value={u}>Образец {i+1}</option>)}</select>
      <div ref={frame} className="relative touch-none select-none overflow-hidden rounded-lg" onPointerDown={e=>{if(busy)return;start.current=point(e);setBox(null);e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={move} onPointerUp={e=>{move(e);start.current=null;}} onPointerCancel={()=>{start.current=null;}}>
        <img src={url} alt="Обведите одного героя на этом образце" draggable={false} className="block w-full" />
        {box && <div className="pointer-events-none absolute border-2 border-yellow-400 bg-yellow-400/10" style={{left:`${box.x*100}%`,top:`${box.y*100}%`,width:`${box.w*100}%`,height:`${box.h*100}%`}} />}
      </div>
      <button type="button" disabled={busy || !box} onClick={persist} className="rounded-lg bg-primary px-3 py-2 text-[12px] text-primary-foreground disabled:opacity-50">{busy?"Сохраняю внешность…":"Сохранить выбранного героя"}</button>
    </div>}
  </div>;
}
