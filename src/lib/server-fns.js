import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser } from "@/lib/auth-middleware";
import { fetchTrustedImage, imageDataUrl } from "@/lib/trusted-images.server";
import { watchBatchCore } from "@/lib/studio.server";

// Картинка → data URL. Нужно, чтобы Canvas мог честно отдать PNG на скачивание,
// даже если CDN не разрешает чтение пикселей напрямую.
export const fetchImageData = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(z.object({ url: z.string().min(5).max(2000) }))
  .handler(async ({ data }) => {
    return imageDataUrl(await fetchTrustedImage(data.url, { maxBytes: 12_000_000 }));
  });

// 📬 Недельная разведка: одна проверка за вызов, чтобы не упираться в лимит времени.
export const runWatchBatch = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(z.object({ authorId: z.string().max(100).optional(), runId: z.string().max(100).optional(), start: z.boolean().optional() }).optional())
  .handler(({ data, context }) => watchBatchCore(context.getBase44(), data?.authorId || data || {}));
