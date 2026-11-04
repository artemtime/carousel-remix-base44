import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireStudio } from "@/lib/auth-middleware";
import { carouselReadiness } from "@/lib/readiness";
import { approvedOutputs } from "@/lib/revisions";
import { finalContext, reviewFinalCore } from "@/lib/final-artifacts.server";
const id=z.string().min(1).max(100);
export const prepareFinal=createServerFn({method:"POST"}).middleware([requireStudio])
  .validator(z.object({carouselId:id})).handler(async({data,context})=>{
    const {carousel,slides,style,hero,revision}=await finalContext(context.getBase44(),data.carouselId);
    return {carousel,slides,style,hero,keys:revision.keys,canApprove:carouselReadiness(slides,carousel.slides_count).ready && slides.every((s,i)=>s.final_image_url && s.final_render_key===revision.keys[i] && s.final_check_status==="ok"),approved:approvedOutputs(carousel,slides,revision)};
  });
export const reviewFinal=createServerFn({method:"POST"}).middleware([requireStudio])
  .validator(z.object({carouselId:id,images:z.array(z.object({slideId:id,key:z.string().length(64),url:z.string().url().max(3000)})).min(1).max(20)}))
  .handler(({data,context})=>reviewFinalCore(context.getBase44(),data));
