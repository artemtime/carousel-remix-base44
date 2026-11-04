import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser } from "@/lib/auth-middleware";
import { editorialSettings, periodKeys } from "@/lib/editorial-policy";
import { studioSettings } from "@/lib/editorial-store.server";
import { saveEditorialConfig, pauseEditorial, createEditorialProbe, confirmEditorialProbe, editorialVisuals } from "@/lib/editorial-config.server";
import { collectEditorialIdeas, decideEditorialItem, editorialTick } from "@/lib/editorial.server";
import { requestRepair } from "@/lib/repair.server";
import { serverFinalStep } from "@/lib/server-final.server";
import { approveFinalCore } from "@/lib/final-artifacts.server";
import { IMAGE_MODEL_IDS } from "@/lib/image-models";
const id = z.string().min(1).max(100);
const zone = z.string().max(80).refine(value => { try { new Intl.DateTimeFormat("en", { timeZone:value }).format(); return true; } catch { return false; } }, "Неверный часовой пояс");
const config = z.object({ audience:z.string().min(3).max(2000), product:z.string().max(2000), goal:z.enum(["reach","subscribers","leads","sales"]), voice:z.string().max(3000), good_examples:z.string().max(4000), bad_examples:z.string().max(4000), topics:z.string().min(3).max(3000), excluded_topics:z.string().max(2000), style_id:id, hero_id:z.string().max(100), image_model:z.enum(IMAGE_MODEL_IDS), mode:z.enum(["manual","editor","autopilot"]),
  stages:z.object({scout:z.boolean(),ideas:z.boolean(),production:z.boolean(),repair:z.boolean(),approval:z.boolean(),publish:z.boolean()}),
  limits:z.object(Object.fromEntries(["image_day","image_week","text_day","text_week","scout_day","scout_week"].map(key=>[key,z.number().int().min(0).max(5000)]))),
  posts_per_week:z.number().int().min(1).max(7), publish_hour:z.number().int().min(0).max(23), publish_days:z.array(z.number().int().min(1).max(7)).min(1).max(7).refine(x=>new Set(x).size===x.length), timezone:zone, content_mode:z.enum(["adapt","original"]), language:z.enum(["ru","es","en"]), channel_id:z.string().max(200), daily_report:z.boolean(), allow_auto_approval:z.boolean() });

export const getEditorialState = createServerFn({method:"GET"}).middleware([requireUser]).handler(async({context})=>{
  const base=context.getBase44();
  const [settings,styles,heroes,carousels,items,tasks,events]=await Promise.all([
    studioSettings(base),base.entities.MyStyle.list({sort:"-updated_date",limit:100}),base.entities.Hero.list({sort:"-updated_date",limit:100}),
    base.entities.Carousel.list({sort:"-updated_date",limit:200}),base.entities.EditorialItem.list({sort:"-created_date",limit:100}),
    base.entities.TaskQueue.filter({status:{$in:["queued","running","paused"]}},{sort:"-updated_date",limit:30}),base.entities.EditorialEvent.list({sort:"-created_date",limit:50})]);
  const e=editorialSettings(settings);let templateCurrent=false;
  if(e.style_id && e.template_signature)try{templateCurrent=(await editorialVisuals(base,e)).signature===e.template_signature;}catch{/* stale style is shown as unconfirmed */}
  const periods=periodKeys(e.timezone);
  const usage=Object.fromEntries(["image","text","scout"].map(kind=>[kind,{day:settings?.usage_day===periods.day?settings?.[`usage_${kind}_day`] || 0:0,week:settings?.usage_week===periods.week?settings?.[`usage_${kind}_week`] || 0:0}]));
  return { editorial:e,revision:settings?.editorial_revision || 0,templateCurrent,styles:styles.items || [],heroes:heroes.items || [],carousels:(carousels.items || []).filter(c=>!c.is_probe),probes:(carousels.items || []).filter(c=>c.is_probe),items:items.items || [],tasks:tasks.items || [],events:events.items || [],usage,periods };
});
export const saveEditorial = createServerFn({method:"POST"}).middleware([requireUser]).validator(config).handler(({data,context})=>saveEditorialConfig(context.getBase44(),data));
export const setEditorialPause = createServerFn({method:"POST"}).middleware([requireUser]).validator(z.object({paused:z.boolean()})).handler(({data,context})=>pauseEditorial(context.getBase44(),data.paused));
export const startEditorialProbe = createServerFn({method:"POST"}).middleware([requireUser]).validator(z.object({style_id:id,hero_id:z.string().max(100),image_model:z.enum(IMAGE_MODEL_IDS)})).handler(({data,context})=>createEditorialProbe(context.getBase44(),context.user,data));
export const acceptEditorialProbe = createServerFn({method:"POST"}).middleware([requireUser]).validator(z.object({carouselId:id})).handler(({data,context})=>confirmEditorialProbe(context.getBase44(),context.user,data.carouselId));
export const collectIdeas = createServerFn({method:"POST"}).middleware([requireUser]).handler(({context})=>collectEditorialIdeas(context.getBase44()));
export const decideItem = createServerFn({method:"POST"}).middleware([requireUser]).validator(z.object({itemId:id,action:z.enum(["approve","produce","repair","defer","skip","retry"]),dueAt:z.iso.datetime().optional()})).handler(({data,context})=>decideEditorialItem(context.getBase44(),context.user,data));
export const fixCarousel = createServerFn({method:"POST"}).middleware([requireUser]).validator(z.object({carouselId:id})).handler(({data,context})=>requestRepair(context.getBase44(),context.user,data));
export const reviewServerCards = createServerFn({method:"POST"}).middleware([requireUser]).validator(z.object({carouselId:id})).handler(async({data,context})=>{
  const results=[];let result;
  for(let i=0;i<20;i++){
    result=await serverFinalStep(context.getBase44(),data.carouselId);results.push(...(result.results || []));
    if(result.waiting)throw new Error("Проверка уже выполняется в фоне. Дождитесь результата.");
    if(result.needsArt)throw new Error("Сначала исправьте замечания к рисункам");
    if(result.manual)throw new Error(result.note);
    if(result.done)break;
  }
  return {ready:Boolean(result?.ready),results};
});
export const approveEditorialBatch = createServerFn({method:"POST"}).middleware([requireUser]).validator(z.object({carouselIds:z.array(id).min(1).max(10)})).handler(async({data,context})=>{
  const base=context.getBase44(),results=[];
  for(const carouselId of [...new Set(data.carouselIds)])try{
    const c=await approveFinalCore(base,{carouselId},context.user);
    results.push({carouselId,ok:true});
  }catch(error){results.push({carouselId,ok:false,error:String(error.message || error).slice(0,300)});}
  return {results};
});
export const markEditorialEventRead=createServerFn({method:"POST"}).middleware([requireUser]).validator(z.object({eventId:id})).handler(({data,context})=>context.getBase44().entities.EditorialEvent.update(data.eventId,{read:true}));
export const runEditorialNow=createServerFn({method:"POST"}).middleware([requireUser]).handler(async({context})=>{
  const result=await editorialTick(context.getBase44());
  if(result.paused)throw new Error("Редакция на паузе");
  return result;
});
