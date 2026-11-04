import { editorialSettings, stageAutomatic, periodKeys, blockedTopic, nextPublicationSlot } from "@/lib/editorial-policy";
import { studioSettings, assertStudioRunning, conditionalUpdate, editorialEvent } from "@/lib/editorial-store.server";
import { editorialVisuals, policyCanApprove } from "@/lib/editorial-config.server";
import { planCore, createCarouselFromPlan } from "@/lib/studio.server";
import { enqueueRender } from "@/lib/render-queue.server";
import { requestRepair } from "@/lib/repair.server";
import { finalContext, approveFinalCore, approvedPack } from "@/lib/final-artifacts.server";
import { serverFinalStep } from "@/lib/server-final.server";
import { carouselReadiness } from "@/lib/readiness";
import { publishApproved } from "@/lib/publish.server";
import { listBufferChannels, createBufferPost } from "@/lib/buffer.server";
import { reconcileDueDeliveries } from "@/lib/delivery.server";

export async function collectEditorialIdeas(base44) {
  const settings = await assertStudioRunning(base44), e = editorialSettings(settings);
  if (!e.configured) throw new Error("Сначала настройте редакцию");
  if (Date.parse(settings.editorial_collect_until || "") > Date.now()) return { created: 0, waiting: true };
  const token = crypto.randomUUID();
  if (!await conditionalUpdate(base44.entities.Settings, settings, ["editorial_collect_token"], { editorial_collect_token: token, editorial_collect_until: new Date(Date.now() + 60000).toISOString() })) return { created: 0, waiting: true };
  try {
    const { week } = periodKeys(e.timezone);
    const existing = (await base44.entities.EditorialItem.filter({ week_key: week }, { limit: 100 })).items || [];
    const remaining = Math.max(0, e.posts_per_week - existing.filter(x => x.status !== "skipped").length);
    if (!remaining) return { created: 0 };
    const authors = (await base44.entities.WatchAuthor.filter({ status: "active" }, { limit: 500 })).items || [];
    const allowed = new Set(authors.map(a => String(a.handle).toLowerCase()));
    const sources = (await base44.entities.SourcePost.filter({ post_type: "carousel", seen: false }, { sort: "-ratio", limit: 100 })).items || [];
    let created = 0;
    for (const source of sources) {
      if (created >= remaining) break;
      if (!allowed.has(String(source.handle).toLowerCase()) || !source.slide_images?.length || source.slide_images.length > 10 || blockedTopic(source.caption_text, e.excluded_topics)) continue;
      const found = (await base44.entities.EditorialItem.filter({ source_id: source.id }, { limit: 1 })).items || [];
      if (found.length || source.editorial_item_id) continue;
      const current = await assertStudioRunning(base44);
      if (current.editorial_revision !== settings.editorial_revision) break;
      const item = await base44.entities.EditorialItem.create({ title: String(source.caption_text || `Идея от @${source.handle}`).split("\n")[0].slice(0, 120), source_id: source.id, source_handle: source.handle, source_url: source.post_url || "", week_key: week,
        status: stageAutomatic(settings, "ideas") ? "approved" : "idea", config_snapshot: e, policy_revision: settings.editorial_revision, note: `×${source.ratio || 0} к обычному уровню автора`, production_requested: false });
      await base44.entities.SourcePost.update(source.id, { editorial_item_id: item.id }); created++;
    }
    if (created) await editorialEvent(base44, "ideas", `Подготовлено идей на неделю: ${created}`);
    return { created };
  } finally {
    const current = await studioSettings(base44);
    if (current.editorial_collect_token === token) await conditionalUpdate(base44.entities.Settings, current, ["editorial_collect_token"], { editorial_collect_token: "", editorial_collect_until: "" });
  }
}
export async function decideEditorialItem(base44, user, { itemId, action, dueAt }) {
  const item = await base44.entities.EditorialItem.get(itemId);
  if(Date.parse(item.lease_until || "")>Date.now())throw new Error("Сотрудник сейчас выполняет операцию. Дождитесь её окончания.");
  if (["scheduled", "queued", "published"].includes(item.status)) throw new Error("Пост уже передан в Buffer. Управляйте его расписанием в Buffer.");
  if(action==="retry") {
    const settings=await assertStudioRunning(base44);
    if(item.status!=="error")throw new Error("Повторный запуск доступен для остановленного задания");
    if(item.carousel_id && item.policy_revision!==settings.editorial_revision)throw new Error("Откройте существующую карусель для ручной правки: задание редакции уже изменилось.");
    let status="approved";
    if(item.carousel_id) {
      const c=await finalContext(base44,item.carousel_id);
      if(c.carousel.publish_state==="unknown" || c.carousel.buffer_post_id)throw new Error("Сначала проверьте результат отправки в Buffer");
      status=c.carousel.final_ready?"review":carouselReadiness(c.slides,c.carousel.slides_count).ready?"checking":c.slides.some(s=>s.image_url)?"repair":"planned";
    }
    await base44.entities.EditorialItem.update(item.id,{status,error:"",production_requested:true,config_snapshot:editorialSettings(settings),policy_revision:settings.editorial_revision});
    return {status};
  }
  if (action === "approve") {
    if (item.status === "idea") {
      if (!await conditionalUpdate(base44.entities.EditorialItem, item, ["status"], { status: "approved", approved_idea_at: new Date().toISOString(), error: "" })) throw new Error("Идея уже обработана");
      return { status: "approved" };
    }
    if (!item.carousel_id) throw new Error("Сначала подготовьте карусель");
    await approveFinalCore(base44, { carouselId: item.carousel_id }, user);
    await base44.entities.EditorialItem.update(item.id, { status: "ready", error: "" }); return { status: "ready" };
  }
  if (action === "produce") {
    await assertStudioRunning(base44);
    if (!["approved", "planned"].includes(item.status)) throw new Error("Сначала утвердите идею");
    await base44.entities.EditorialItem.update(item.id, { production_requested: true }); return { requested: true };
  }
  if (action === "repair") {
    if (!item.carousel_id) throw new Error("Карусель ещё не создана");
    const result = await requestRepair(base44, user, { carouselId: item.carousel_id });
    await base44.entities.EditorialItem.update(item.id, { status: result.targets ? "rendering" : "checking", error: "" }); return result;
  }
  if (action === "defer") {
    if (!dueAt || !(Date.parse(dueAt) > Date.now())) throw new Error("Выберите будущее время");
    if (!["idea", "approved", "planned", "review", "ready", "error", "repair"].includes(item.status)) throw new Error("Дождитесь окончания текущей операции");
    await base44.entities.EditorialItem.update(item.id, { status: "deferred", deferred_status:item.status, deferred_until: dueAt, note: `Отложено с этапа ${item.status}` }); return { status: "deferred" };
  }
  if (action === "skip") {
    if (["planning", "rendering", "checking"].includes(item.status)) throw new Error("Сначала остановите текущую работу");
    await base44.entities.EditorialItem.update(item.id, { status: "skipped" }); return { status: "skipped" };
  }
  throw new Error("Неизвестное действие");
}
async function recoveredPlan(base44,item,config) {
  const saved=(await base44.entities.Carousel.filter({editorial_item_id:item.id},{limit:2})).items || [];
  if(saved.length!==1)throw new Error("Подготовка плана прервалась. Проверьте результат перед повторным запуском.");
  const c=saved[0],slides=(await base44.entities.Slide.filter({carousel_id:c.id},{sort:"position",limit:20})).items || [];
  const visual=await editorialVisuals(base44,config);
  if(!(c.slides_count>=1 && c.slides_count<=10) || slides.length!==c.slides_count || slides.some((s,i)=>s.position!==i+1 || !s.reference_card?.panels?.length) || c.policy_revision!==item.policy_revision || c.policy_signature!==visual.signature)throw new Error("Сохранённый план неполный или настройки изменились. Откройте его для ручной проверки; новая генерация не заказана.");
  return c;
}
async function processEditorialItem(base44, settings, item) {
  const e = editorialSettings(settings), config = item.config_snapshot;
  if (Date.parse(item.lease_until || "") > Date.now()) return { more: false };
  const token = crypto.randomUUID();
  if (!await conditionalUpdate(base44.entities.EditorialItem, item, ["status", "lease_token"], { lease_token: token, lease_until: new Date(Date.now() + 15 * 60000).toISOString() })) return { more: false };
  const save = async patch => {
    const current = await base44.entities.EditorialItem.get(item.id);
    if (current.lease_token !== token || current.status==="skipped" || current.status==="deferred" && item.status!=="deferred") throw new Error("Задание уже изменилось");
    if(!await conditionalUpdate(base44.entities.EditorialItem, current, ["lease_token", "status"], patch))throw new Error("Состояние задания уже изменилось");
  };
  try {
    if (!config || item.policy_revision !== settings.editorial_revision) throw new Error("Задание редакции изменилось. Проверьте эту идею вручную и создайте её заново с текущими настройками.");
    if (item.status === "planning") {
      const saved=await recoveredPlan(base44,item,config);
      await save({carousel_id:saved.id,status:"planned"}); return {more:true};
    }
    if (item.status === "deferred") {
      const status=["idea","approved","planned","review","ready","error","repair"].includes(item.deferred_status)?item.deferred_status:item.carousel_id?"review":"idea";
      await save({ status, deferred_until: "", deferred_status:"" }); return { more: true };
    }
    if (item.status === "approved" && (e.stages.production || item.production_requested)) {
      const source = await base44.entities.SourcePost.get(item.source_id);
      const existing = (await base44.entities.Carousel.filter({ editorial_item_id: item.id }, { limit: 2 })).items || [];
      if (existing.length > 1) throw new Error("Найдено несколько версий этой идеи. Нужна ручная проверка.");
      if (existing[0]) { const saved=await recoveredPlan(base44,item,config);await save({ carousel_id: saved.id, status: "planned" }); return { more: true }; }
      const visual = await editorialVisuals(base44, config);
      await save({ status: "planning" });
      const plan = await planCore(base44, { style: visual.style, hero: visual.hero, rules: visual.style.rules || [], settings: { ...settings, editorial: config }, sourceImages: source.slide_images.slice(0, 10), sourceText: source.caption_text || "", sourceKind: "carousel", mode: config.content_mode, language: config.language || "ru" });
      if (blockedTopic(JSON.stringify(plan), config.excluded_topics)) throw new Error("В плане обнаружена исключённая тема. Проверьте текст вручную.");
      await assertStudioRunning(base44);
      const carousel = await createCarouselFromPlan(base44, { plan, style: visual.style, source: { id: source.id, url: source.post_url, handle: source.handle }, mode: config.content_mode, language: config.language || "ru", imageModel: config.image_model, editorialItemId: item.id });
      await base44.entities.Carousel.update(carousel.id, { policy_revision: item.policy_revision, policy_signature: visual.signature, needs_finalization: true });
      await base44.entities.SourcePost.update(source.id, { seen: true });
      await save({ carousel_id: carousel.id, status: "planned", error: "" }); return { more: true };
    }
    if (!item.carousel_id) return { more: false };
    const context = await finalContext(base44, item.carousel_id), c = context.carousel;
    if (item.status === "planned" && (e.stages.production || item.production_requested)) {
      await enqueueRender(base44, { id: settings.created_by_id || "studio-owner" }, { carouselId: c.id });
      await save({ status: "rendering" }); return { more: false };
    }
    if (["rendering", "checking"].includes(item.status)) {
      if (c.active_task_id) return { more: false, idle: true };
      if (!carouselReadiness(context.slides, c.slides_count).ready) { await save({ status: "repair", error: "Есть замечания к рисункам" }); return { more: true }; }
      await save({ status: "checking" });
      const result = await serverFinalStep(base44, c.id);
      if (result.needsRepair) { await save({ status: "repair", error: "Есть замечания к готовым карточкам" }); return { more: true }; }
      if (result.manual) { await save({ status: "review", error: result.note }); return { more: false }; }
      if (result.ready) { await save({ status: "review", error: "" }); return { more: true }; }
      return { more: !result.waiting };
    }
    if (item.status === "repair" && e.stages.repair && (c.repair_attempts || 0) < 2) {
      const result = await requestRepair(base44, { id: settings.created_by_id || "studio-owner" }, { carouselId: c.id });
      await save({ status: result.targets ? "rendering" : "checking", error: "" }); return { more: false };
    }
    if (item.status === "review" && await policyCanApprove(base44, settings, c)) {
      await approveFinalCore(base44, { carouselId: c.id }, { id: `policy:${settings.editorial_revision}` });
      await base44.entities.Carousel.update(c.id, { approval_kind: "policy" });
      await save({ status: "ready", error: "" }); return { more: true };
    }
    if (item.status === "ready" && e.stages.publish) {
      const fresh = await assertStudioRunning(base44);
      if (fresh.editorial_revision !== item.policy_revision || !editorialSettings(fresh).stages.publish) throw new Error("Правила публикации изменились. Нужна ручная проверка.");
      const pack = await approvedPack(base44, c.id);
      const scheduled = (await base44.entities.Carousel.filter({ scheduled_at: { $exists:true } }, { limit: 100 })).items || [];
      const dueAt = item.due_at && Date.parse(item.due_at) > Date.now() ? item.due_at : nextPublicationSlot(e, scheduled.map(x => x.scheduled_at).filter(Boolean));
      await publishApproved(base44, { carouselId: c.id, channelId: e.channel_id, text: pack.caption, imageUrls: pack.images, dueAt }, { listChannels: listBufferChannels, createPost: createBufferPost, authorize:async()=>{
        const latest=await assertStudioRunning(base44);
        if(latest.editorial_revision!==item.policy_revision || !editorialSettings(latest).stages.publish)throw new Error("Публикация остановлена: правила редакции изменились");
      } });
      await save({ status: "scheduled", due_at: dueAt }); return { more: true };
    }
    return { more: false, idle: true };
  } catch (error) {
    await save({ status: "error", error: String(error.message || error).slice(0, 700) });
    await editorialEvent(base44, "action", String(error.message || error), item.carousel_id || "", item.id);
    return { more: false };
  } finally {
    const current = await base44.entities.EditorialItem.get(item.id);
    if (current.lease_token === token) await conditionalUpdate(base44.entities.EditorialItem, current, ["lease_token"], { lease_token: "", lease_until: "" });
  }
}
export async function editorialTick(base44) {
  let settings = await studioSettings(base44);
  if (!settings) return { more: false };
  if (Date.parse(settings.editorial_tick_until || "") > Date.now()) return { more: false, waiting: true };
  const token = crypto.randomUUID();
  if (!await conditionalUpdate(base44.entities.Settings, settings, ["editorial_tick_token"], { editorial_tick_token: token, editorial_tick_until: new Date(Date.now() + 18 * 60000).toISOString() })) return { more: false };
  try {
    await reconcileDueDeliveries(base44);
    settings = await studioSettings(base44);
    const e = editorialSettings(settings);
    if (e.paused) return { more: false, paused: true };
    const loose = (await base44.entities.Carousel.filter({ needs_finalization: true }, { sort: "updated_date", limit: 20 })).items || [];
    const standalone = loose.find(c => !c.editorial_item_id && !c.active_task_id);
    if (standalone) { const result = await serverFinalStep(base44, standalone.id); return { more: !result.done && !result.waiting }; }
    if (!e.configured) return { more: false };
    if (stageAutomatic(settings, "ideas") || stageAutomatic(settings, "scout")) await collectEditorialIdeas(base44);
    const rows = (await base44.entities.EditorialItem.filter({ status: { $nin: ["skipped", "published"] } }, { sort: "created_date", limit: 100 })).items || [];
    for (const item of rows.filter(x => ["queued", "scheduled"].includes(x.status))) {
      const c = await base44.entities.Carousel.get(item.carousel_id);
      if (c.status === "published") await base44.entities.EditorialItem.update(item.id, { status: "published" });
      else if (["error", "needs_review"].includes(c.delivery_status)) await base44.entities.EditorialItem.update(item.id, { status: "error", error: c.delivery_note });
    }
    const actionable = rows.filter(x => x.status !== "planning" || !(Date.parse(x.lease_until || "") > Date.now())).filter(x =>
      (x.status === "approved" || x.status === "planned") && (e.stages.production || x.production_requested)
      || ["planning", "rendering", "checking"].includes(x.status)
      || x.status === "repair" && e.stages.repair
      || x.status === "review" && e.stages.approval
      || x.status === "ready" && e.stages.publish
      || x.status === "deferred" && Date.parse(x.deferred_until) <= Date.now());
    if (e.daily_report) {
      const { day } = periodKeys(e.timezone);
      if (settings.editorial_report_day !== day) {
        await editorialEvent(base44, "daily", `Сегодня: ${rows.filter(x => ["idea", "review", "repair", "error"].includes(x.status)).length} решений, ${rows.filter(x => ["rendering", "checking"].includes(x.status)).length} в работе, ${rows.filter(x => ["scheduled", "queued"].includes(x.status)).length} в расписании.`);
        await base44.entities.Settings.update(settings.id, { editorial_report_day: day });
      }
    }
    if (!actionable.length) return { more: false };
    for(const item of actionable.slice(0,10)) {
      const result=await processEditorialItem(base44,settings,item);
      if(!result.idle)return result;
    }
    return {more:false};
  } finally {
    const current = await studioSettings(base44);
    if (current.editorial_tick_token === token) await conditionalUpdate(base44.entities.Settings, current, ["editorial_tick_token"], { editorial_tick_token: "", editorial_tick_until: "" });
  }
}
