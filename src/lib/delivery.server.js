import { getBufferPost } from "@/lib/buffer.server";
import { conditionalUpdate, editorialEvent } from "@/lib/editorial-store.server";
export function deliveryPatch(post, carousel) {
  if (!post || post.id !== carousel.buffer_post_id || carousel.buffer_channel_id && post.channelId !== carousel.buffer_channel_id) throw new Error("Ответ Buffer не соответствует сохранённому посту и каналу");
  const checked = new Date().toISOString();
  if (post.status === "sent" && Number.isFinite(Date.parse(post.sentAt)) && post.externalLink && post.schedulingType === "automatic") {
    const link = new URL(post.externalLink);
    if (link.protocol !== "https:") throw new Error("Buffer вернул некорректную ссылку на публикацию");
    return { status: "published", delivery_status: "published", published_url: link.href, published_at: post.sentAt, delivery_note: "", delivery_checked_at: checked };
  }
  if (post.status === "error") return { delivery_status: "error", delivery_note: String(post.error?.message || "Публикация не вышла. Проверьте подключение канала в Buffer.").slice(0, 600), delivery_checked_at: checked };
  if (post.status === "sent") return { delivery_status: "needs_review", delivery_note: "Buffer отметил пост отправленным, но не подтвердил автоматическую публикацию со ссылкой. Проверьте Instagram.", delivery_checked_at: checked };
  if (post.status === "sending") return { delivery_status: "sending", delivery_note: "Публикуется в Instagram", delivery_checked_at: checked };
  if (post.status === "scheduled") return { status: "scheduled", scheduled_at: post.dueAt || carousel.scheduled_at || "", delivery_status: "scheduled", delivery_note: "", delivery_checked_at: checked };
  return { delivery_status: "needs_review", delivery_note: "Пост находится в черновиках или ожидает действия в Buffer", delivery_checked_at: checked };
}
export async function reconcileDelivery(base44, carouselId, getPost = getBufferPost) {
  const carousel = await base44.entities.Carousel.get(carouselId);
  if (!carousel.buffer_post_id) {
    if (carousel.publish_state === "unknown" || carousel.publish_state === "submitting") return { state: "unknown", note: "Результат отправки неизвестен. Проверьте очередь Buffer; повторная отправка заблокирована." };
    throw new Error("Карусель ещё не отправлена в Buffer");
  }
  const patch = deliveryPatch(await getPost(carousel.buffer_post_id), carousel);
  const changed = carousel.delivery_status !== patch.delivery_status;
  if (!await conditionalUpdate(base44.entities.Carousel, carousel, ["buffer_post_id", "publish_token"], patch)) return { state: "changed" };
  if (changed && base44.entities.EditorialEvent) await editorialEvent(base44, patch.delivery_status === "published" ? "published" : patch.delivery_status === "error" ? "action" : "delivery", patch.delivery_status === "published" ? `Опубликовано: ${carousel.title}` : `${carousel.title}: ${patch.delivery_note || "статус публикации обновлён"}`, carousel.id);
  return { state: patch.delivery_status, url: patch.published_url || "", note: patch.delivery_note || "" };
}
export async function reconcileDueDeliveries(base44) {
  const rows = (await base44.entities.Carousel.filter({ buffer_post_id: { $exists: true }, status: { $in: ["queued", "scheduled"] } }, { sort: "delivery_checked_at", limit: 100 })).items || [];
  const due = rows.filter(c => c.buffer_post_id && (!c.delivery_checked_at || Date.now() - Date.parse(c.delivery_checked_at) > 15 * 60000)).slice(0, 5);
  const results = [];
  for (const row of due) {
    try { results.push(await reconcileDelivery(base44, row.id)); }
    catch (error) { await base44.entities.Carousel.update(row.id, { delivery_checked_at: new Date().toISOString(), delivery_note: String(error.message || error).slice(0, 500) }); results.push({ state: "unavailable" }); }
  }
  return results;
}
export async function linkUnknownDelivery(base44,{carouselId,postId},getPost=getBufferPost) {
  const carousel=await base44.entities.Carousel.get(carouselId);
  if(carousel.publish_state!=="unknown" || carousel.buffer_post_id)throw new Error("Ручная сверка нужна только для отправки с неизвестным результатом");
  const post=await getPost(postId);
  const expected=(await base44.entities.Slide.filter({carousel_id:carouselId},{sort:"position",limit:20})).items || [];
  const frozen=carousel.buffer_payload || {caption:carousel.approved_caption,images:expected.map(s=>s.final_image_url)};
  const sources=post.assets?.map(a=>a.source);
  if(post.id!==postId || post.channelId!==carousel.buffer_channel_id || post.text!==frozen.caption || !sources || JSON.stringify(sources)!==JSON.stringify(frozen.images))throw new Error("Канал, подпись или изображения поста не совпадают с отправленной версией");
  if(!await conditionalUpdate(base44.entities.Carousel,carousel,["publish_state","buffer_post_id","publish_token"],{buffer_post_id:postId,publish_state:"sent",...(frozen.version_key?{published_key:frozen.version_key}:{})}))throw new Error("Отправка уже изменилась");
  return reconcileDelivery(base44,carouselId,getPost);
}
