import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireStudio } from "@/lib/auth-middleware";
import { saveHeroReferenceCore } from "@/lib/hero-reference.server";
export const saveHeroReference=createServerFn({method:"POST"}).middleware([requireStudio])
  .validator(z.object({styleId:z.string().min(1).max(100),url:z.string().url().max(3000),sourceUrl:z.string().url().max(3000),bounds:z.object({x:z.number().min(0).max(1),y:z.number().min(0).max(1),w:z.number().min(.02).max(1),h:z.number().min(.02).max(1)}).refine(b=>b.x+b.w<=1.001 && b.y+b.h<=1.001)}))
  .handler(({data,context})=>saveHeroReferenceCore(context.getBase44(),data));
