import { finalContext, reviewFinalCore, invalidateApproval } from "@/lib/final-artifacts.server";
import { carouselReadiness } from "@/lib/readiness";
import { assertStudioRunning, conditionalUpdate } from "@/lib/editorial-store.server";

export async function serverFinalStep(base44, carouselId) {
  await assertStudioRunning(base44);
  let context = await finalContext(base44, carouselId);
  if (!carouselReadiness(context.slides, context.carousel.slides_count).ready) {
    await base44.entities.Carousel.update(carouselId,{needs_finalization:false,finalization_error:"Сначала завершите рисование и исправьте замечания к рисункам"});
    return { done: true, needsArt: true };
  }
  if (Date.parse(context.carousel.finalization_until || "") > Date.now()) return { done: false, waiting: true };
  const token = crypto.randomUUID();
  if (!await conditionalUpdate(base44.entities.Carousel, context.carousel, ["finalization_token"], { finalization_token: token, finalization_until: new Date(Date.now() + 240000).toISOString() })) return { done: false, waiting: true };
  try {
    const pending = context.slides.find((s, i) => !s.final_image_url || s.final_render_key !== context.revision.keys[i] || s.final_check_status !== "ok");
    if (!pending) { await base44.entities.Carousel.update(carouselId, { final_ready:true, needs_finalization: false, finalization_error: "" }); return { done: true, ready: true }; }
    if (pending.reference_card?.visual_mode !== "own" && !(pending.reference_card?.visual_mode === "text" && pending.reference_card.text_design === "own")) {
      await base44.entities.Carousel.update(carouselId, { needs_finalization: false });
      return { done: true, manual: true, note: "Для точного режима соберите карточки в Авторе" };
    }
    const renderer=pending.reference_card?.visual_mode === "text" ? "server-text-v1" : "server-v2";
    if (pending.final_renderer !== renderer) {
      await base44.entities.Slide.update(pending.id, { final_renderer: renderer, final_check_status: "pending" });
      await invalidateApproval(base44, carouselId);
      context = await finalContext(base44, carouselId);
    }
    const index = context.slides.findIndex(s => s.id === pending.id), slide = context.slides[index], key = context.revision.keys[index];
    let url = slide.final_render_key === key ? slide.final_image_url : "";
    if (!url) {
      const {renderServerCard}=await import("@/lib/server-card.server");
      const png = await renderServerCard(slide);
      const after = await finalContext(base44, carouselId);
      if (after.revision.keys[index] !== key) throw new Error("Карточка изменилась во время сборки");
      const { file_url } = await (base44.asServiceRole || base44).integrations.Core.UploadPublicFile({ file: new File([png], `final-${slide.position}.png`, { type: "image/png" }) });
      if (!file_url) throw new Error("Не удалось сохранить готовую карточку");
      url = file_url;
    }
    const images = context.slides.map((s, i) => ({ slideId: s.id, key: context.revision.keys[i], url: s.id === slide.id ? url : s.final_image_url || "" }));
    const result = await reviewFinalCore(base44, { carouselId, images, onlySlideId: slide.id });
    const failed = result.results.some(r => r.status !== "ok");
    if (failed || result.ready) await base44.entities.Carousel.update(carouselId, { needs_finalization: false, finalization_error: "" });
    return { done: failed || result.ready, ready: result.ready, needsRepair: failed, results: result.results };
  } catch (error) {
    await base44.entities.Carousel.update(carouselId, { finalization_error: String(error.message || error).slice(0, 600), needs_finalization: false });
    throw error;
  } finally {
    const current = await base44.entities.Carousel.get(carouselId);
    if (current.finalization_token === token) await conditionalUpdate(base44.entities.Carousel, current, ["finalization_token"], { finalization_token: "", finalization_until: "" });
  }
}
