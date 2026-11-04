import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser } from "@/lib/auth-middleware";
import { publishApproved } from "@/lib/publish.server";
import { listBufferChannels, createBufferPost } from "@/lib/buffer.server";
import { reconcileDelivery, linkUnknownDelivery } from "@/lib/delivery.server";

// Каналы моего аккаунта Buffer: Instagram и остальные площадки.
export const bufferChannels = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(() => listBufferChannels());
export const refreshDelivery = createServerFn({ method: "POST" }).middleware([requireUser])
  .validator(z.object({ carouselId: z.string().min(1).max(100) }))
  .handler(({ data, context }) => reconcileDelivery(context.getBase44(), data.carouselId));
export const verifyUnknownDelivery = createServerFn({method:"POST"}).middleware([requireUser])
  .validator(z.object({carouselId:z.string().min(1).max(100),postId:z.string().min(1).max(200)}))
  .handler(({data,context})=>linkUnknownDelivery(context.getBase44(),data));

// Пост в Buffer: картинки уже загружены публично, Buffer забирает их по ссылке.
export const bufferPublish = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(
    z.object({
      carouselId: z.string().min(1).max(100),
      channelId: z.string().min(1).max(200),
      text: z.string().min(1).max(2200),
      imageUrls: z
        .array(z.string().max(2000).refine((url) => /^https:\/\//i.test(url), "Нужна публичная ссылка https"))
        .min(1)
        .max(10),
      dueAt: z.string().max(40).nullish(),
    }),
  )
  .handler(async ({ data, context }) => {
    const base44 = context.getBase44();
    return publishApproved(base44, data, { listChannels: listBufferChannels, createPost: createBufferPost });
  });
