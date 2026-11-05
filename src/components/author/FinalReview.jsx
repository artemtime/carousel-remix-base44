import { carouselReadiness } from "@/lib/readiness";
import { useEffect, useState } from "react";
import { createClientOnlyFn, useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { prepareFinal, reviewFinal } from "@/lib/final-artifacts";
const renderFinalImages=createClientOnlyFn(async (...args)=>{
  const module=await import("@/lib/prepare-final.client");
  return module.renderFinalImages(...args);
});
import { markReady } from "@/lib/render-queue";
import { fixCarousel, reviewServerCards } from "@/lib/editorial";
export default function FinalReview({carousel,slides,style,hero,proxy,onFlush,onReviewed,onBusy,disabled}) {
  const prepare=useServerFn(prepareFinal),review=useServerFn(reviewFinal),approve=useServerFn(markReady);
  const fix=useServerFn(fixCarousel),serverCheck=useServerFn(reviewServerCards);
  const [busy,setBusy]=useState(false),[step,setStep]=useState(""),[valid,setValid]=useState(false),[approved,setApproved]=useState(false);
  const seed=JSON.stringify({caption:carousel.caption,mode:carousel.mode,style,hero,slides:slides.map(s=>({id:s.id,image_url:s.image_url,image_url_2:s.image_url_2,text:s.text,scene:s.scene,role:s.role,reference_card:s.reference_card,final_renderer:s.final_renderer,final_render_key:s.final_render_key,final_check_status:s.final_check_status}))});
  useEffect(()=>{
    let cancelled=false;setValid(false);setApproved(false);
    const timer=setTimeout(()=>prepare({data:{carouselId:carousel.id}}).then(data=>{
      if(!cancelled){setValid(data.canApprove);setApproved(data.approved);}
    }).catch(()=>{}),250);
    return()=>{cancelled=true;clearTimeout(timer);};
  },[seed,carousel.id,prepare]);
  const check=async()=>{
    setBusy(true);onBusy?.(true);setStep("Собираю готовые карточки…");
    try{
      await onFlush?.();
      const snapshot=await prepare({data:{carouselId:carousel.id}});
      let result;
      if(snapshot.slides.some(s=>s.final_renderer?.startsWith("server-"))) {
        setStep("Собираю и проверяю карточки на сервере…");
        result=await serverCheck({data:{carouselId:carousel.id}});
      } else {
        const images=await renderFinalImages(snapshot,proxy,setStep);
        setStep("Проверяю готовые карточки с подписями…");
        result=await review({data:{carouselId:carousel.id,images}});
      }
      await onReviewed();setValid(result.ready);
      toast[result.ready?"success":"error"](result.ready?"Карточки проверены. Просмотрите их и утвердите результат.":result.results.some(row=>row.status!=="ok")?"В готовых карточках найдены замечания — они сохранены ниже.":"PNG проверены, но прежние замечания к иллюстрациям ещё не устранены.");
    }catch(e){toast.error(String(e.message || e).slice(0,240));}finally{setBusy(false);onBusy?.(false);setStep("");}
  };
  const repair=async()=>{
    setBusy(true);onBusy?.(true);setStep("Готовлю точечные исправления…");
    try{await onFlush?.();const result=await fix({data:{carouselId:carousel.id}});await onReviewed();toast.success(result.targets?`Исправляются только отмеченные кадры: ${result.targets}`:"Пересобираю подписи без новых рисунков");}
    catch(e){toast.error(String(e.message || e).slice(0,300));}finally{setBusy(false);onBusy?.(false);setStep("");}
  };
  const ready=async()=>{
    setBusy(true);onBusy?.(true);
    try{await onFlush?.();await approve({data:{carouselId:carousel.id}});await onReviewed();setApproved(true);toast.success("Карточки и подпись утверждены");}
    catch(e){toast.error(String(e.message || e).slice(0,220));}finally{setBusy(false);onBusy?.(false);}
  };
  const renderable=slides.length>0 && slides.every(s=>s.reference_card?.visual_mode === "text" || s.image_url && !s.image_stale && (!(s.reference_card?.panels?.length===2)||s.image_url_2));
  const artReadiness=carouselReadiness(slides,carousel.slides_count);
  const notes=slides.filter(s=>s.final_check_note && s.final_check_status!=="ok");
  const repairable=slides.some(s=>s.final_check_status==="failed" || s.panel_checks?.some(c=>c.status==="failed"));
  return <section className="mx-5 mt-4 space-y-3 rounded-xl border border-border bg-card p-4 md:mx-8">
    <div className="flex flex-wrap items-center gap-3">
      <p className="flex-1 text-[13px] font-medium">{approved?"Карточки и подпись утверждены":"Проверка готовых карточек"}</p>
      <button type="button" disabled={busy || disabled || !renderable} onClick={check} className="rounded-lg border border-border px-3 py-2 text-[12px] disabled:opacity-50">{busy?step:"Проверить карточки"}</button>
      {repairable && carousel.content_format !== "text" && <button type="button" disabled={busy || disabled || carousel.needs_finalization || (carousel.repair_attempts || 0)>=2} onClick={repair} className="rounded-lg border border-primary/50 px-3 py-2 text-[12px] text-primary disabled:opacity-40">Исправить замечания</button>}
      <button type="button" disabled={busy || disabled || !valid} onClick={ready} className="rounded-lg bg-primary px-3 py-2 text-[12px] text-primary-foreground disabled:opacity-50">Утвердить</button>
    </div>
    <p className="text-[11.5px] text-muted-foreground">Проверяются итоговые PNG: текст, читаемость и края. У рисованных карточек дополнительно проверяются персонажи и иллюстрации. После изменения текста, рисунка или оформления проверку нужно повторить. Перед утверждением просмотрите все карточки. Проверка ИИ расходует кредиты; принятые карточки без изменений повторно не проверяются.</p>
    {carousel.needs_finalization && <p role="status" className="text-[12px] text-primary">Исправление, сборка и проверка продолжаются в фоне. Можно закрыть вкладку.</p>}
    {carousel.finalization_error && <p role="alert" className="text-[12px] text-amber-400">{carousel.finalization_error}</p>}
    {(carousel.repair_attempts || 0)>0 && <p className="text-[11px] text-muted-foreground">Автоматических исправлений: {carousel.repair_attempts} из 2. Удачные кадры сохраняются. После двух попыток нужна ручная правка.</p>}
    {!artReadiness.ready && renderable && <p role="alert" className="text-[12px] text-amber-400">Утверждение заблокировано: не устранены замечания к иллюстрациям {artReadiness.missing.join(", ")}. Откройте эти слайды и исправьте отмеченные кадры. Положительная проверка PNG не отменяет прежний отказ.</p>}
    {carousel.content_format === "text" && notes.length>0 && <p className="text-xs text-muted-foreground">Исправьте текст или фон в редакторе карточки и повторите проверку. Длинный текст можно сократить; слова автоматически не обрезаются.</p>}
    {notes.map(s=><p key={s.id} role="alert" className="text-[12px] text-amber-400">Карточка {s.position}: {s.final_check_note}</p>)}
    {slides.some(s=>s.final_image_url) && <div className="flex gap-3 overflow-x-auto">{slides.filter(s=>s.final_image_url).map(s=><a key={s.id} href={s.final_image_url} target="_blank" rel="noreferrer" className="shrink-0"><img src={s.final_image_url} alt={`Готовая карточка ${s.position}`} className="h-40 rounded-lg border border-border object-contain" /></a>)}</div>}
    {carousel.image_requests>0 && <p className="text-[11px] text-muted-foreground">Рисунков с начала учёта: {carousel.image_requests} из {carousel.image_request_limit || 80}</p>}
  </section>;
}
