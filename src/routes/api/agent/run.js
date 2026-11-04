import { createFileRoute } from "@tanstack/react-router";
import { requireUserRoute } from "@/lib/auth-middleware";
import {
  scoutCore,
  planCore,
  reviseCore,
  watchBatchCore,
  readReelCore,
  scenarioCore,
  createCarouselFromPlan,
  styleFromReferenceCore,
  restyleCarouselCore,
  rememberScout,
  carouselPackCore,
  scoutDigestCore,
} from "@/lib/studio.server";
import { enqueueRender, pauseRender } from "@/lib/render-queue.server";
import { stalePatch } from "@/lib/readiness";
import { rereadReferenceCore } from "@/lib/reference.server";

// Одна точка входа для Telegram-агента: JSON in → компактный JSON out.
async function handle(body, base44, origin, user) {
  const action = body.action;
  if (action === "status") {
    const jobs=body.task_id?[await base44.entities.TaskQueue.get(body.task_id)]:(await base44.entities.TaskQueue.filter({carousel_id:body.carousel_id},{sort:"-created_date",limit:1})).items || [];
    const job=jobs[0];const carousel=await base44.entities.Carousel.get(body.carousel_id || job?.carousel_id);
    return {task_id:job?.id,status:job?.status || carousel.status,completed:job?.completed || 0,total:job?.total || 0,error:job?.error || "",needs_review:!carousel.approved_key,link:`${origin}/author/${carousel.id}`};
  }
  if (action === "pause") return pauseRender(base44,{taskId:body.task_id});

  if (action === "digest") return scoutDigestCore(base44, { limit: body.limit });

  if (action === "pack") return carouselPackCore(base44, { carouselId: body.carousel_id, origin });

  if (action === "scout") {
    await rememberScout(base44, body.handle).catch(() => null);
    const res = await scoutCore(base44, { handle: body.handle, limit: Number(body.limit) || 40, force: Boolean(body.force) });
    return {
      handle: res.handle,
      baseline: res.baseline,
      hits: res.hits.map((h) => ({
        shortcode: h.shortcode,
        url: h.url,
        likes: h.likes,
        comments: h.comments,
        ratio: h.ratio,
        badge: h.badge,
        caption: String(h.caption || "").slice(0, 300),
        slide_images: h.images,
        handle: res.handle,
      })),
    };
  }

  if (action === "reread_reference") return rereadReferenceCore(base44, body.carousel_id);

  if (action === "plan") {
    const style = await base44.entities.MyStyle.get(body.style_id);
    const settingsPage = await base44.entities.Settings.list({ sort: "-created_date", limit: 1 });
    const settings = (settingsPage.items || [])[0] || {};
    const plan = await planCore(base44, {
      style,
      hero: style.hero,
      rules: style.rules || [],
      settings,
      mode: body.mode || "remix",
      adapt: body.mode === "adapt",
      sourceImages: body.source_images || [],
      sourceText: body.source_text || "",
      sourceKind: body.source_kind === "reel" || (!body.source_images?.length && body.source_text) ? "reel" : "carousel",
      language: body.language || "ru",
    });
    const carousel = await createCarouselFromPlan(base44, { plan, style, mode: body.mode || "remix", language: body.language || "ru", source: { url: body.source_url || "", handle: body.handle || "", images: body.source_images || [], caption: body.source_text || "" } });
    return { carousel_id: carousel.id, title: carousel.title, slides: plan.slides, caption: plan.caption };
  }

  if (action === "revise_plan") {
    const carousel = await base44.entities.Carousel.get(body.carousel_id);
    const page = await base44.entities.Slide.filter({ carousel_id: body.carousel_id }, { sort: "position", limit: 40 });
    const slides = page.items || [];
    const plan = {
      title: carousel.title,
      caption: carousel.caption,
      slides: slides.map((s) => ({ role: s.role, scene: s.scene, text: s.text, layout: s.layout, reference_card: s.reference_card })),
    };
    const style = carousel.style_id ? await base44.entities.MyStyle.get(carousel.style_id).catch(() => null) : null;
    const next = await reviseCore(base44, { plan, instruction: body.instruction, rules: style?.rules || [], language: carousel.language || "ru" });
    await base44.entities.Carousel.update(carousel.id, { title: next.title || carousel.title, caption: next.caption || carousel.caption });
    const incoming = next.slides || [];
    for (let i = 0; i < incoming.length; i += 1) {
      const data = {
        position: i + 1,
        role: ["hook", "body", "cta"].includes(incoming[i].role) ? incoming[i].role : "body",
        scene: incoming[i].scene || "",
        text: incoming[i].text || "",
        layout: Number(incoming[i].layout) === 2 ? 2 : 1,
        ...(incoming[i].reference_card ? { reference_card: incoming[i].reference_card } : {}),
        };
      if (slides[i]) await base44.entities.Slide.update(slides[i].id, { ...data, ...stalePatch(slides[i], { ...slides[i], ...data }) });
      else await base44.entities.Slide.create({ carousel_id: carousel.id, ...data });
    }
    for (const extra of slides.slice(incoming.length)) await base44.entities.Slide.delete(extra.id);
    await base44.entities.Carousel.update(carousel.id, { slides_count: incoming.length, status: "plan" });
    return { carousel_id: carousel.id, slides: incoming };
  }

  if (action === "save_style") return styleFromReferenceCore(base44, { carouselId: body.carousel_id, name: body.name });

  if (action === "restyle") return restyleCarouselCore(base44, { carouselId: body.carousel_id, styleId: body.style_id, mode: body.mode || "adapt" });

  if (action === "draw") {
    const job = await enqueueRender(base44, user, { carouselId: body.carousel_id, slideId: body.slide_id });
    return { carousel_id: body.carousel_id, task_id: job.id, status: job.status, total: job.total, ready: false, needs_review: true };
  }

  if (action === "watch_now") {
    return watchBatchCore(base44, body.author_id || { runId: body.run_id, start: !body.run_id });
  }

  if (action === "reel") {
    const res = await readReelCore(base44, { url: body.url, audio_url: body.audio_url });
    await base44.entities.ReelTranscript.create({
      source_url: res.source_url || body.url || "своё видео",
      handle: res.handle || "",
      title: String(res.summary || "").slice(0, 80),
      kind: "transcript",
      transcript: res.transcript,
      lines: res.lines || [],
      summary: res.summary,
      hook: res.hook,
      why_viral: res.why_viral,
    });
    return {
      summary: res.summary,
      hook: res.hook,
      why_viral: res.why_viral,
      lines: res.lines,
      transcript: String(res.transcript || "").slice(0, 4000),
    };
  }

  if (action === "scenario") {
    return scenarioCore(base44, { transcript: body.transcript, topic: body.topic, codeword: body.codeword });
  }

  throw new Error(`Неизвестное действие: ${action}`);
}

export const Route = createFileRoute("/api/agent/run")({
  server: {
    middleware: [requireUserRoute],
    handlers: {
      POST: async ({ request, context }) => {
        let body = {};
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Нужен JSON с полем action" }, { status: 400 });
        }
        if (JSON.stringify(body).length > 100000 || typeof body.action !== "string" || (body.source_images && (!Array.isArray(body.source_images) || body.source_images.length > 20)) || String(body.source_text || "").length > 20000 || String(body.instruction || "").length > 2000) return Response.json({error:"Запрос слишком большой или имеет неверный формат"},{status:400});
        try {
          const result = await handle(body, context.getBase44(), new URL(request.url).origin, context.user);
          return Response.json(result);
        } catch (error) {
          return Response.json({ error: String(error?.message || error).slice(0, 300) }, { status: 400 });
        }
      },
    },
  },
});
