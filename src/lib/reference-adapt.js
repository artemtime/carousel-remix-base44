// Адаптация формы оригинала: число карточек и склейка кадров остаются чужими, содержание — моё.
export function adaptedReferencePlan(profile, adapted) {
  if (profile?.schema_version !== 2 || !profile.cards?.length) throw new Error("Нет чертежа оригинала — форма карточек неизвестна.");
  if (!Array.isArray(adapted?.cards) || adapted.cards.length !== profile.cards.length) {
    throw new Error(`План не совпал с оригиналом по числу карточек (${adapted?.cards?.length || 0} против ${profile.cards.length}). Запустите сборку ещё раз.`);
  }
  const slides = profile.cards.map((card, i) => {
    const made = adapted.cards.find((item) => Number(item.index) === i + 1) || adapted.cards[i];
    if (!Array.isArray(made?.panels) || made.panels.length !== card.panels.length || made.panels.some(scene => typeof scene !== "string" || !scene.trim())) {
      throw new Error(`Карточка ${i + 1}: Автор пропустил сцену. Чужой герой не будет подставлен вместо вашего.`);
    }
    if (!Array.isArray(made?.texts) || made.texts.length !== card.panels.length || made.texts.some(text => typeof text !== "string" || !text.trim())) {
      throw new Error(`Карточка ${i + 1}: Автор пропустил подпись. Запустите сборку заново — исходный текст не будет подставлен молча.`);
    }
    const normalize = text => text.replace(/[*=^]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
    if (made.texts.length === 2 && normalize(made.texts[0]) === normalize(made.texts[1])
      && new Set(card.text_blocks.map(block => normalize(block.text))).size > 1) {
      throw new Error(`Карточка ${i + 1}: подпись продублирована в обоих кадрах. Раздели её: в первом кадре вопрос/проблема, во втором ответ/решение. Не повторяй полную пару дважды.`);
    }
    const panels = card.panels.map((panel, n) => ({ ...panel, scene: made.panels[n].trim() }));
    // Adapted lettering is ours: one finished caption per scene. OCR may split
    // one source sentence into several coloured/duplicated language fragments.
    const text_blocks = made.texts.map((text, n) => ({ text: text.trim(), panel_index: n,
      bounds: { ...card.panels[n].bounds } }));
    const reference_card = { ...card, panels, text_blocks };
    return {
      role: i === 0 ? "hook" : i === profile.cards.length - 1 ? "cta" : "body",
      scene: panels.map((panel, n) => `Кадр ${n + 1}: ${panel.scene}`).join("\n"),
      text: text_blocks.map((block) => block.text).join("\n\n"),
      layout: panels.length,
      ref_index: i + 1,
      reference_index: i + 1,
      reference_url: card.reference_url,
      reference_card,
      reference_brief: panels.map((panel) => panel.scene).join("; "),
    };
  });
  const caption = adapted?.caption || "";
  const title = (adapted?.title || caption.split("\n").find((line) => line.trim()) || slides[0].text.replace(/\n/g, " ")).slice(0, 120);
  return { title, caption, slides, reference_profile: profile };
}
