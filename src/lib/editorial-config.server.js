import { editorialSettings, DEFAULT_EDITORIAL } from "@/lib/editorial-policy";
import { studioSettings, conditionalUpdate, assertStudioRunning } from "@/lib/editorial-store.server";
import { digest, visualContent } from "@/lib/revisions";
import { ownStyleCard } from "@/lib/own-style";
import { createCarouselFromPlan } from "@/lib/studio.server";
import { enqueueRender } from "@/lib/render-queue.server";
import { finalContext, approveFinalCore } from "@/lib/final-artifacts.server";
import { listBufferChannels } from "@/lib/buffer.server";

export async function editorialVisuals(base44, e) {
  if (!e.style_id) throw new Error("Выберите стиль редакции");
  const source = await base44.entities.MyStyle.get(e.style_id);
  const heroId = source.content_format === "text" ? "" : e.hero_id || source.hero_id || "";
  const hero = source.content_format === "text" ? null : heroId ? await base44.entities.Hero.get(heroId) : source.hero;
  const style = { ...source, hero, hero_id: heroId, hero_sheet_url: source.content_format === "text" ? "" : hero?.identity_reference_url || hero?.portrait_url || hero?.sheet_url || source.hero_sheet_url || "" };
  const signature = await digest({ visuals: visualContent(style, hero, "adapt"), caption: style.caption, typography: style.typography, aspect: style.aspect, image_model: e.image_model });
  return { style, hero, signature };
}
export async function saveEditorialConfig(base44, data) {
  let settings = await studioSettings(base44);
  if (!settings) settings = await base44.entities.Settings.create({ editorial: DEFAULT_EDITORIAL });
  const old = editorialSettings(settings), e = { ...old, ...data, configured: true, paused: old.paused,
    stages: { ...data.stages }, limits: { ...data.limits } };
  delete e.allow_auto_approval;
  const visual = await editorialVisuals(base44, e);
  if (e.stages.approval && !data.allow_auto_approval) throw new Error("Подтвердите разрешение утверждать карточки по проверенному образцу");
  if (e.stages.approval && !e.template_signature) throw new Error("Сначала утвердите пробную карточку, затем включите автоматическое утверждение");
  if (e.stages.approval && visual.signature !== e.template_signature) throw new Error("Стиль, герой или модель изменились. Сначала утвердите новый образец.");
  if (e.stages.publish) {
    if (!e.channel_id) throw new Error("Выберите канал Instagram");
    const channels = await listBufferChannels();
    if (!channels.some(c => c.id === e.channel_id && /instagram/i.test(c.service))) throw new Error("Выберите подключённый канал Instagram из списка Buffer");
  }
  if(JSON.stringify(e)===JSON.stringify(old))return {editorial:e,revision:settings.editorial_revision || 0};
  const revision = (settings.editorial_revision || 0) + 1;
  if (!await conditionalUpdate(base44.entities.Settings, settings, ["editorial_revision", "editorial_control_version"], { editorial: e, editorial_revision: revision, editorial_control_version: (settings.editorial_control_version || 0) + 1 })) throw new Error("Настройки уже изменились. Обновите страницу.");
  return { editorial: e, revision };
}
export async function pauseEditorial(base44, paused) {
  const settings = await studioSettings(base44);
  if (!settings) throw new Error("Сначала сохраните настройки редакции");
  const e = editorialSettings(settings);
  if (!await conditionalUpdate(base44.entities.Settings, settings, ["editorial_control_version", "editorial_revision"], { editorial: { ...e, paused }, editorial_control_version: (settings.editorial_control_version || 0) + 1 })) throw new Error("Состояние уже изменилось. Обновите страницу.");
  return { paused };
}
export async function createEditorialProbe(base44, user, e) {
  await assertStudioRunning(base44);
  const { style, hero, signature } = await editorialVisuals(base44, e);
  const original = { schema_version: 2, aspect: style.aspect || "4:5", panels: [{ scene: "Герой из паспорта спокойно объясняет одну идею собеседнику в своём мире. Один непрерывный рисунок, полностью видны причёска и основные руки, никаких букв, рамок и пустых плашек.", bounds: { x: 0, y: 0, w: 1, h: 1 } }], text_blocks: [{ text: "Начните с одного понятного шага", panel_index: 0, bounds: { x: .08, y: .75, w: .84, h: .18 } }] };
  const {textCard}=await import("@/lib/text-cards");
  const card = style.content_format === "text" ? textCard("Начните с одного понятного шага",style,"hook") : ownStyleCard(original, style, "hook");
  const carousel = await createCarouselFromPlan(base44, { plan: { title: `Пробный образец · ${style.name}`, caption: "Образец редакции", slides: [{ role: "hook", scene: card.panels[0]?.scene || "", text: card.text_blocks.map(b => b.text).join("\n"), layout: 1, reference_card: card }] }, style: { ...style, hero }, mode: "adapt", language: "ru", imageModel: e.image_model, isProbe: true });
  await base44.entities.Carousel.update(carousel.id, { policy_signature: signature, needs_finalization: true });
  await enqueueRender(base44, user, { carouselId: carousel.id });
  return { carouselId: carousel.id };
}
export async function confirmEditorialProbe(base44, user, carouselId) {
  const settings = await studioSettings(base44), e = editorialSettings(settings);
  const { signature } = await editorialVisuals(base44, e);
  const { carousel, slides } = await finalContext(base44, carouselId);
  if (!carousel.is_probe || carousel.policy_signature !== signature || carousel.style_id !== e.style_id || carousel.image_model !== e.image_model) throw new Error("Этот образец не соответствует текущему стилю, герою или модели. Создайте новый образец.");
  await approveFinalCore(base44, { carouselId }, user);
  const current = await studioSettings(base44);
  if (current.editorial_revision !== settings.editorial_revision) throw new Error("Задание редакции изменилось. Проверьте образец заново.");
  const patch = { editorial: { ...e, template_signature: signature, template_carousel_id: carouselId, template_url: slides[0].final_image_url, template_confirmed_at: new Date().toISOString() }, editorial_control_version: (current.editorial_control_version || 0) + 1 };
  if (!await conditionalUpdate(base44.entities.Settings, current, ["editorial_revision", "editorial_control_version"], patch)) throw new Error("Настройки изменились. Повторите подтверждение.");
  return { confirmed: true };
}
export async function policyCanApprove(base44, settings, carousel) {
  const e = editorialSettings(settings);
  if (!e.configured || e.paused || !e.stages.approval || !e.template_signature || carousel.policy_revision !== settings.editorial_revision || !["adapt", "original"].includes(carousel.mode) || carousel.style_id !== e.style_id || carousel.image_model !== e.image_model) return false;
  const { signature, style } = await editorialVisuals(base44, e);
  return signature === e.template_signature && signature === carousel.policy_signature && (carousel.hero_id || "") === (style.content_format === "text" ? "" : e.hero_id || style.hero_id || "");
}
