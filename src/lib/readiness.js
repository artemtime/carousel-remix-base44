// Одно условие готовности для редактора, очереди, экспорта и Telegram.
export function panelCount(slide) {
  if(slide?.reference_card?.visual_mode === "text")return 0;
  // Reference cards store separate panel images; older plans generate one complete illustration.
  return slide?.reference_card?.panels?.length || (slide?.image_url_2 ? 2 : 1);
}
export function panelReady(slide, index) {
  const url = index === 0 ? slide?.image_url : slide?.image_url_2;
  if (!url || slide?.image_stale) return false;
  if (slide?.reference_card?.schema_version === 2) {
    return slide.panel_checks?.some((check) => check.panel === index + 1 && check.status === "ok") || false;
  }
  return slide.critic_status === "ok";
}
export function slideReady(slide) {
  if(slide?.reference_card?.visual_mode === "text")return Boolean(slide.text?.trim()) && !slide.image_stale;
  return Boolean(slide) && slide.status === "drawn" && slide.critic_status === "ok"
    && Array.from({ length: panelCount(slide) }, (_, i) => panelReady(slide, i)).every(Boolean);
}
export function carouselReadiness(slides, expected) {
  const rows = Array.isArray(slides) ? slides : [];
  const missing = rows.filter((slide) => !slideReady(slide)).map((slide) => slide.position);
  const countMatches = !expected || rows.length === expected;
  return { ready: rows.length > 0 && countMatches && missing.length === 0, missing, countMatches };
}
export function assertReady(slides, expected) {
  const result = carouselReadiness(slides, expected);
  if (!result.ready) throw new Error(result.missing.length
    ? `Нужны готовые проверенные кадры: слайды ${result.missing.join(", ")}`
    : "Карусель пуста или содержит не все слайды");
  return result;
}
export function sceneKey(slide) {
  return JSON.stringify({ scene: slide?.scene || "", layout: slide?.layout || 1,
    reference_url: slide?.reference_url || "", panels: (slide?.reference_card?.panels || []).map(({ image_align_y: _alignment, trim_footer: _footer, ...panel }) => panel),
    visual: slide?.reference_card ? { mode: slide.reference_card.visual_mode, art_style: slide.reference_card.art_style, palette: slide.reference_card.palette, aspect: slide.reference_card.aspect, lighting: slide.reference_card.lighting, background: slide.reference_card.background, world: slide.reference_card.world, references: slide.reference_card.style_reference_urls } : null });
}
export function stalePatch(before, after) {
  if(after?.reference_card?.visual_mode === "text")return {};
  return sceneKey(before) === sceneKey(after) ? {} : {
    image_stale: true, render_token: "", final_check_status: "pending", status: "planned", critic_status: "pending", panel_checks: [],
    critic_note: "Сцена изменилась — нужно перерисовать кадры",
  };
}
