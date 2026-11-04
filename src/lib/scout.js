import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser } from "@/lib/auth-middleware";
import { fetchSinglePost } from "@/lib/apify.server";
import { reserveStudioUsage } from "@/lib/editorial-store.server";
import { scoutCore, readReelCore, scenarioCore, rememberScout, readScoutCache, writeScoutCache } from "@/lib/studio.server";

// Код поста из ссылки: по нему находим уже прочитанный пост в базе.
function shortcodeOf(url) {
  const match = String(url || "").match(/instagram\.com\/(?:[a-zA-Z0-9._]+\/)?(?:p|reel|tv)\/([^/?#]+)/i);
  return match ? match[1] : "";
}

export const scoutHandle = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(
    z.object({
      handle: z.string().min(1).max(200),
      limit: z.number().optional(),
      kind: z.enum(["carousel", "reel"]).optional(),
      force: z.boolean().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const db = context.getBase44();
    // Запоминаем сам запрос: даже неудачный поиск остаётся в истории.
    await rememberScout(db, data.handle).catch(() => null);
    return scoutCore(db, { handle: data.handle, limit: data.limit || 40, kind: data.kind, force: data.force });
  });

export const scoutPost = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(z.object({ url: z.string().min(8).max(500), force: z.boolean().optional() }))
  .handler(async ({ data, context }) => {
    const db = context.getBase44();
    await rememberScout(db, data.url).catch(() => null);
    const code = shortcodeOf(data.url);
    if (code && !data.force) {
      const cached = await readScoutCache(db, `post:${code}`).catch(() => null);
      if (cached?.post) return { ...cached.post, handle: cached.post.handle || cached.handle || "" };
    }
    await reserveStudioUsage(db,"scout");
    const post = await fetchSinglePost(data.url);
    if (post?.handle) await rememberScout(db, `@${post.handle}`).catch(() => null);
    if (post?.shortcode) {
      await writeScoutCache(db, `post:${post.shortcode}`, { handle: post.handle, post }).catch(() => null);
    }
    return post;
  });

export const readReel = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(z.object({ url: z.string().max(600).optional(), audio_url: z.string().max(600).optional() }))
  .handler(({ data, context }) => readReelCore(context.getBase44(), data));

export const makeScenario = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(z.object({ transcript: z.string().min(10).max(20000), topic: z.string().optional(), codeword: z.string().optional() }))
  .handler(({ data, context }) => scenarioCore(context.getBase44(), data));
