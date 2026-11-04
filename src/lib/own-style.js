// In adaptation the source contributes meaning, not its visual identity.
const hex = value => /^#[0-9a-f]{6}$/i.test(String(value || ""));
export function ownStyleCard(card, style, role = "body") {
  if (!style?.art_style?.trim()) throw new Error("У выбранного стиля нет описания рисовки. Сначала сохраните стиль.");
  const caption = { ...(style.caption || {}), ...(style.typography?.[role] || {}) };
  const count = card.panels.length;
  const panels = card.panels.map((panel, index) => ({ scene: panel.scene, bounds: { x: 0, y: index / count, w: 1, h: 1 / count }, ...(panel.image_align_y===undefined?{}:{image_align_y:panel.image_align_y}), ...(panel.trim_footer===undefined?{}:{trim_footer:panel.trim_footer}) }));
  const text_blocks = card.text_blocks.map((block, index) => {
    // Preserve which scene a caption belongs to, never the source font or colours.
    const center = (block.bounds?.y || 0) + (block.bounds?.h || 0) / 2;
    const centerX = (block.bounds?.x || 0) + (block.bounds?.w || 0) / 2;
    let panel_index = Number.isInteger(block.panel_index) ? block.panel_index : card.panels.findIndex(p => center >= p.bounds.y && center <= p.bounds.y + p.bounds.h
      && centerX >= p.bounds.x && centerX <= p.bounds.x + p.bounds.w);
    if (panel_index < 0) panel_index = Math.min(count - 1, Math.floor(index * count / Math.max(1, card.text_blocks.length)));
    return { text: block.text, panel_index, font: caption.font || "Montserrat", weight: caption.weight || 600,
      color: caption.color || "#FFFFFF", align: "center", shadow: caption.shadow !== false,
      font_size: (caption.size || 64) / (1080 * Number((style.aspect || "4:5").split(":")[1]) / Number((style.aspect || "4:5").split(":")[0])),
      line_height: caption.line_spacing || 1.15, bounds: { x: .08, y: (panel_index + .8) / count, w: .84, h: .12 / count } };
  });
  return { schema_version: 2, readable: true, has_text: text_blocks.some(b => b.text.trim()), visual_mode: "own",
    aspect: style.aspect || "4:5", art_style: style.art_style, palette: (style.palette || []).filter(hex),
    lighting: style.lighting || "", background: hex(style.background) ? style.background : caption.strip_bg || "#101014",
    style_reference_urls: (style.source_slide_urls || []).filter(Boolean).slice(0, 2),
    own_caption: caption, ...(card.visual_mode==="own" && card.own_caption_overrides?{own_caption_overrides:card.own_caption_overrides}:{}), panels, text_blocks, scrims: [], lettering_version: 0 };
}
export function applyOwnStyle(plan, style) {
  return { ...plan, slides: plan.slides.map(slide => slide.reference_card?.schema_version === 2
    ? { ...slide, reference_card: ownStyleCard(slide.reference_card, style, slide.role) } : slide) };
}
export function ownStyleReferences(card, style) {
  return [...new Set([...(card.style_reference_urls || []).slice(0, 2), style?.hero?.identity_reference_url, style?.hero_sheet_url].filter(Boolean))].slice(0,4);
}
export function ownPanelPrompt({ card, panelIndex, hero, fix }) {
  const panel = card.panels[panelIndex];
  const [w,h] = card.aspect.split(":").map(Number);
  return `Нарисуй ОДНУ самостоятельную иллюстрацию, пропорции ${(w * panel.bounds.w / (h * panel.bounds.h)).toFixed(3)}:1.
МОЙ ВИЗУАЛЬНЫЙ СТИЛЬ (обязателен): ${card.art_style}.
Моя палитра: ${(card.palette || []).join(", ") || "цвета выбранных образцов моего стиля"}. Свет: ${card.lighting || "как в моём стиле"}.
СЦЕНА: ${panel.scene}
Описание сцены задаёт смысл, а не обязательные текстовые реквизиты. Прайс-лист, чек, вывеску или плакат с информацией замени разговором, жестом или обычным предметом без таблички. Если реквизит требует букв, убери реквизит целиком; не создавай вместо него пустую плашку.
ПАСПОРТ МОЕГО ГЕРОЯ: ${JSON.stringify(hero || {})}.
Паспорт главнее имени прежнего персонажа в описании сцены: замени главного героя сцены героем из паспорта, сохранив действие.
Если герой задан, изображай именно его вид, лицо, одежду и постоянные приметы. Человека не заменяй лисом, животным или антропоморфным гибридом; если в паспорте животное, сохрани именно его вид. Менять одежду можно только по явному описанию сцены.
Приложенные изображения показывают МОЙ художественный стиль и, если есть, лист моего героя. Не копируй их сюжет, надписи или композицию. Первоисточник содержания — СЦЕНА выше.
Выбери самостоятельные ракурс, позу и композицию. Голова со всей причёской, лицо и основные кисти целиком в кадре; отступ от головы, пучка, шапки и главного предмета до каждой кромки — не менее 8% высоты кадра, с запасом под последующую обрезку. Один кадр — одна сцена, без коллажа, рамки, полос и пустых полей. Рисунок заполняет весь холст до четырёх краёв (full bleed). Никаких паспарту, бумажной окантовки, комиксных границ, пустых пузырей речи, карточек, табличек или прямоугольников под подпись. Внизу продолжи обычный фон сцены с низкой детализацией; не выделяй для текста отдельную геометрическую область.
Текст накладывает код позже: верни только чистую сцену. Не пиши даже служебные слова, названия палитры или коды цвета. Ни букв, ни цифр, ни логотипов, ни надписей, ни водяных знаков.
${fix ? `Исправь замечание: ${fix}` : ""}`;
}
export function ownCriticPrompt({ card, panelIndex, hero }) {
  return `Ты проверяешь ПОСЛЕДНЕЕ изображение — готовую иллюстрацию. Предыдущие изображения, если есть, — образцы МОЕГО стиля/героя, их надписи не проверяй.
Требуемая сцена: ${card.panels[panelIndex].scene}.
Текстовые реквизиты вроде прайс-листа можно заменить устным разговором и жестом: оцени смысл, не требуй нарисовать таблицу, вывеску или буквы.
Мой стиль: ${card.art_style}. Палитра: ${(card.palette || []).join(", ")}. Свет: ${card.lighting || "по моему стилю"}.
Паспорт героя: ${JSON.stringify(hero || {})}.
Проверь целостность человека, совпадение вида и внешности героя, рисовку и цветовую гамму моего стиля, соответствие сцене и отсутствие букв/цифр/логотипов.
Лис вместо заданного человека, антропоморфный гибрид или чужая рисовка — брак. Если по паспорту выбран герой-животное, требуй именно его.
Самостоятельные поза, ракурс и расположение героя разрешены. Не требуй композицию чужого поста. Одна цельная сцена без обрезанной головы, коллажа и полос. Любая внешняя бумажная рамка, паспарту, внутренний пустой прямоугольник/пузырь речи, плашка для текста или служебная подпись — composition=false и ok=false; явно потребуй убрать их, продолжив фон до краёв.
Верни {"integrity":true/false,"style":true/false,"composition":true/false,"scene":true/false,"hero":true/false,"text":true/false,"ok":true/false,"problem":"...","fix":"..."}. text=true означает, что обнаружены запрещённые надписи; ok=true только если всё остальное верно и text=false.`;
}
