import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser } from "@/lib/auth-middleware";
import { IMAGE_MODEL_IDS } from "@/lib/image-models";
import {
  analyzeStyleCore,
  scanReferenceCore,
  heroesCore,
  passportCore,
  heroSheetCore,
  planCore,
  reviseCore,
  drawCore,
  critiqueCore,
  drawSlideFully,
  createCarouselFromPlan,
  styleFromReferenceCore,
  restyleCarouselCore,
  relanguageCarouselCore,
  seriesAnglesCore,
  seriesPostCore,
} from "@/lib/studio.server";
import { rereadReferenceCore } from "@/lib/reference.server";

export const analyzeStyle = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(z.object({ images: z.array(z.string()).min(1).max(8) }))
  .handler(({ data, context }) => analyzeStyleCore(context.getBase44(), data.images));

// Чертёж референса: все карточки выбранного поста разом.
export const scanReference = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(z.object({ images: z.array(z.string().max(3000)).min(1).max(20), caption: z.string().max(20000).nullish(), format: z.enum(["illustrated","text"]).optional() }))
  .handler(({ data, context }) => scanReferenceCore(context.getBase44(), data));

export const suggestHeroes = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(
    z.object({
      art_style: z.string().max(4000),
      competitor_character: z.string().max(2000).optional(),
      topic: z.string().max(500).optional(),
    }),
  )
  .handler(({ data, context }) => heroesCore(context.getBase44(), data));

export const makePassport = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(z.object({ raw: z.string().min(3).max(4000) }))
  .handler(({ data, context }) => passportCore(context.getBase44(), data.raw));

export const makeHeroSheet = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(z.object({ art_style: z.string().max(4000), hero: z.any(), reference: z.string().nullish() }))
  .handler(({ data, context }) => heroSheetCore(context.getBase44(), data));

export const makePlan = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(
    z.object({
      style: z.any(),
      format: z.enum(["illustrated","text"]).optional(),
      hero: z.any().optional(),
      rules: z.array(z.string()).optional(),
      settings: z.any().optional(),
      mode: z.enum(["mirror", "remix", "adapt", "original"]).optional(),
      adapt: z.boolean().optional(),
      sourceImages: z.array(z.string().max(3000)).max(20).optional(),
      sourceText: z.string().max(20000).optional(),
      sourceKind: z.enum(["carousel", "reel"]).optional(),
      reference: z.any().optional(),
      language: z.enum(["ru", "es", "en", "orig"]).optional(),
    }),
  )
  .handler(({ data, context }) => planCore(context.getBase44(), data));

export const revisePlan = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(
    z.object({
      plan: z.any(),
      instruction: z.string().min(2).max(2000),
      rules: z.array(z.string()).optional(),
      language: z.enum(["ru", "es", "en", "orig"]).optional(),
    }),
  )
  .handler(({ data, context }) => reviseCore(context.getBase44(), data));

export const drawScene = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(
    z.object({
      slide: z.any(),
      style: z.any(),
      format: z.enum(["illustrated","text"]).optional(),
      hero: z.any().optional(),
      reference: z.string().nullish(),
      referenceCard: z.string().nullish(),
      cardBrief: z.string().nullish(),
      profile: z.any().optional(),
      fix: z.string().nullish(),
      withCritic: z.boolean().optional(),
      panelIndex: z.number().int().min(0).max(1).optional(),
      cardCrop: z.string().max(3000).nullish(),
    }),
  )
  .handler(({ data, context }) => {
    const base44 = context.getBase44();
    if (data.withCritic) return drawSlideFully(base44, data);
    return drawCore(base44, data);
  });

export const saveCarouselPlan = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(
    z.object({
      plan: z.any(),
      style: z.any(),
      format: z.enum(["illustrated","text"]).optional(),
      source: z.any().optional(),
      mode: z.enum(["mirror", "remix", "adapt", "original"]),
      language: z.enum(["ru", "es", "en", "orig"]).optional(),
      imageModel: z.enum(IMAGE_MODEL_IDS).optional(),
    }),
  )
  .handler(({ data, context }) => createCarouselFromPlan(context.getBase44(), data));

export const rereadReference = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(z.object({ carouselId: z.string().min(1).max(100) }))
  .handler(({ data, context }) => rereadReferenceCore(context.getBase44(), data.carouselId));

// Сохранить стиль (палитра, манера, шрифт) прямо из разобранной карусели.
export const saveStyleFromCarousel = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(z.object({ carouselId: z.string().min(1).max(100), name: z.string().max(120).optional() }))
  .handler(({ data, context }) => styleFromReferenceCore(context.getBase44(), data));

// Пересобрать карусель в другом стиле или на другом уровне адаптации.
export const restyleCarousel = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(
    z.object({
      carouselId: z.string().min(1).max(100),
      styleId: z.string().min(1).max(100),
      mode: z.enum(["mirror", "remix", "adapt", "original"]),
    }),
  )
  .handler(({ data, context }) => restyleCarouselCore(context.getBase44(), data));

// Сменить только язык карусели: стиль и уровень адаптации остаются прежними.
export const relanguageCarousel = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(z.object({ carouselId: z.string().min(1).max(100), language: z.enum(["ru", "es", "en", "orig"]) }))
  .handler(({ data, context }) => relanguageCarouselCore(context.getBase44(), data));

// Серия на неделю: сначала углы темы, потом по одному посту за вызов.
export const planSeries = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(
    z.object({
      styleId: z.string().min(1).max(100),
      topic: z.string().min(3).max(500),
      count: z.number().int().min(2).max(6),
    }),
  )
  .handler(({ data, context }) => seriesAnglesCore(context.getBase44(), data));

export const buildSeriesPost = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(
    z.object({
      styleId: z.string().min(1).max(100),
      topic: z.string().min(3).max(500),
      angle: z.object({ title: z.string().max(300), angle: z.string().max(1000), hook: z.string().max(500) }),
      index: z.number().int().min(1).max(6),
      total: z.number().int().min(2).max(6),
    }),
  )
  .handler(({ data, context }) => seriesPostCore(context.getBase44(), data));

export const critiqueScene = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(z.object({ slide: z.any(), style: z.any().optional(), image_url: z.string().min(8) }))
  .handler(({ data, context }) => critiqueCore(context.getBase44(), data));
