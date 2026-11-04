import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser } from "@/lib/auth-middleware";
import { enqueueRender, pauseRender, saveSlideEdit, setCarouselHero, setCarouselImageModel, markCarouselReady } from "@/lib/render-queue.server";
import { IMAGE_MODEL_IDS } from "@/lib/image-models";
const id = z.string().min(1).max(100);
export const startRender = createServerFn({ method: "POST" }).middleware([requireUser])
  .validator(z.object({ carouselId: id, slideId: id.optional() }))
  .handler(({ data, context }) => enqueueRender(context.getBase44(), context.user, data));
export const stopRender = createServerFn({ method: "POST" }).middleware([requireUser])
  .validator(z.object({ taskId: id }))
  .handler(({ data, context }) => pauseRender(context.getBase44(), data));
export const editSlide = createServerFn({ method: "POST" }).middleware([requireUser])
  .validator(z.object({ slideId: id, patch: z.object({ text: z.string().max(20000).optional(), scene: z.string().max(20000).optional(),
    layout: z.number().int().min(1).max(2).optional(), reference_card: z.record(z.string(), z.any()).optional(), role: z.enum(["hook", "body", "cta"]).optional() }) }))
  .handler(({ data, context }) => saveSlideEdit(context.getBase44(), data));
export const changeCarouselHero = createServerFn({ method: "POST" }).middleware([requireUser])
  .validator(z.object({ carouselId: id, heroId: z.string().max(100) }))
  .handler(({ data, context }) => setCarouselHero(context.getBase44(), data));
export const changeImageModel = createServerFn({ method: "POST" }).middleware([requireUser])
  .validator(z.object({ carouselId: id, imageModel: z.enum(IMAGE_MODEL_IDS) }))
  .handler(({ data, context }) => setCarouselImageModel(context.getBase44(), data));
export const markReady = createServerFn({ method: "POST" }).middleware([requireUser])
  .validator(z.object({ carouselId: id }))
  .handler(({ data, context }) => markCarouselReady(context.getBase44(), data, context.user));

