// В точном режиме сохраняем собственное оформление каждой карточки, без усреднения.
import { withSourceLettering } from "@/lib/reference-lettering";

export function referenceImages(images = []) {
  const key = (url) => { const u = new URL(url); return u.pathname; };
  // Старый сборщик добавлял обложку перед первым дочерним изображением.
  return images.length > 1 && key(images[0]) === key(images[1]) ? images.slice(1) : images;
}

export function validateReferenceCard(card) {
  const validBox = (b) => b && [b.x, b.y, b.w, b.h].every(Number.isFinite) && b.x >= 0 && b.y >= 0 && b.w > 0 && b.h > 0 && b.x + b.w <= 1.01 && b.y + b.h <= 1.01;
  if (!card?.readable || !/^\d+:\d+$/.test(card.aspect || "")) throw new Error("Не удалось уверенно прочитать карточку. План не будет придуман по подписи к посту.");
  if (!Array.isArray(card.panels) || (card.visual_mode !== "text" && card.panels.length < 1) || card.panels.length > 2 || card.panels.some((p) => !p.scene || !validBox(p.bounds))) throw new Error("Не распознано разбиение карточки на кадры.");
  if (!Array.isArray(card.text_blocks) || card.text_blocks.length > 30 || (card.has_text && !card.text_blocks.length)) throw new Error("Надписи не распознаны полностью. Генерация остановлена без пересказа.");
  card.text_blocks.forEach((block, i) => {
    if (typeof block.text !== "string" || !block.text.trim()) throw new Error(`Подпись ${i + 1} не прочитана.`);
    if (!validBox(block.bounds)) throw new Error(`У подписи ${i + 1} неверно определены границы: ${JSON.stringify(block.bounds)}.`);
    if (!(block.font_size > 0 && block.font_size <= 0.3)) throw new Error(`У подписи ${i + 1} неверно определён масштаб: ${block.font_size}.`);
    if (!["left", "center", "right"].includes(block.align)) throw new Error(`У подписи ${i + 1} не определено выравнивание: ${block.align}.`);
  });
  // Затемнение под текстом необязательно: неверно снятую область отбрасываем, разбор не ломаем.
  card.scrims = (Array.isArray(card.scrims) ? card.scrims : [])
    .filter((scrim) => validBox(scrim?.bounds))
    .slice(0, 8)
    .map((scrim) => ({
      bounds: scrim.bounds,
      color: /^#[0-9a-f]{6}$/i.test(String(scrim.color || "")) ? scrim.color : "#000000",
      opacity: Math.max(0, Math.min(1, Number(scrim.opacity ?? 0.45))),
      fade: ["none", "top", "bottom"].includes(scrim.fade) ? scrim.fade : "none",
    }));
  return card;
}

export function referencePlan(profile) {
  if (profile?.schema_version !== 2 || !profile.cards?.length || profile.cards.length !== profile.cards_count) throw new Error("Нужен полный покарточный разбор оригинала, без пропусков.");
  const slides = profile.cards.map((raw, i) => {
    const card = raw.visual_mode === "text" ? validateReferenceCard(raw) : withSourceLettering(validateReferenceCard(raw));
    return {
      role: i === 0 ? "hook" : i === profile.cards.length - 1 ? "cta" : "body",
      scene: card.panels.map((p, n) => `Кадр ${n + 1}: ${p.scene}`).join("\n"),
      text: card.text_blocks.map((b) => b.text).join("\n\n"),
      layout: card.panels.length || 1,
      ref_index: i + 1,
      reference_index: i + 1,
      reference_url: card.reference_url,
      reference_card: { ...card, schema_version: 2 },
      reference_brief: card.panels.map((p) => p.scene).join("; "),
    };
  });
  const caption = profile.source_caption || "";
  const title = caption.split("\n").find((line) => line.trim()) || slides[0].text.replace(/\n/g, " ") || "Карусель по оригиналу";
  return { title: title.slice(0, 120), caption, slides, reference_profile: profile };
}

export function slideRecord(slide, position) {
  return {
    position, role: ["hook", "body", "cta"].includes(slide.role) ? slide.role : "body",
    scene: slide.scene || "", text: slide.text || "", layout: slide.reference_card?.schema_version === 2 ? slide.reference_card.panels.length : Number(slide.layout) === 2 ? 2 : 1,
    ...(slide.reference_card ? { reference_card: slide.reference_card, reference_index: slide.reference_index || slide.ref_index || position, reference_url: slide.reference_url || "", reference_brief: slide.reference_brief || slide.ref_brief || "" } : {}),
  };
}