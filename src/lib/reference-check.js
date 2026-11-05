// Проверка разложенного текста ДО того, как рисуется кадр.
// Два правила карусели: шрифт один на все карточки и подписи никогда не наезжают друг на друга.
// Модуль чистый (без canvas), поэтому работает и на сервере в момент сборки плана,
// и в браузере перед отрисовкой уже сохранённых слайдов.
import { resolveFont } from "@/lib/fonts";

const TOP_LIMIT = 0.035;
const BOTTOM_LIMIT = 0.965;
const GAP = 0.012;
const LEADING = 1.15;
const MIN_SIZE = 0.014;

function aspectOf(card) {
  const [w, h] = String(card?.aspect || "4:5").split(":").map(Number);
  return w > 0 && h > 0 ? w / h : 0.8;
}

// Ширина знака в долях высоты кадра: у узких шрифтов строка вмещает больше букв.
function glyphRatio(font) {
  const family = resolveFont(font).family.toLowerCase();
  if (/oswald|amatic|yanone|jura|cuprum|kelly slab|oranienbaum|seymour|russo/.test(family)) return 0.44;
  if (/press start|rubik mono/.test(family)) return 0.72;
  if (/tenor|cormorant|forum|philosopher|ledger|kurale|alice|old standard/.test(family)) return 0.47;
  if (/prosto|comfortaa/.test(family)) return 0.62;
  return 0.55;
}

// Сколько строк займёт подпись в рамке заданной ширины при заданном кегле.
function linesOf(text, size, widthUnits, ratio) {
  const perLine = Math.max(4, Math.floor(widthUnits / Math.max(0.001, size * ratio)));
  let lines = 0;
  for (const para of String(text || "").split("\n")) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines += 1;
      continue;
    }
    let row = 1;
    let used = words[0].length;
    for (let i = 1; i < words.length; i += 1) {
      const word = words[i];
      if (used + 1 + word.length > perLine) {
        row += 1;
        used = word.length;
      } else {
        used += 1 + word.length;
      }
    }
    lines += row;
  }
  return Math.max(1, lines);
}

// Высота, которая реально нужна подписи (в долях высоты карточки).
function heightFor(block, size, aspect) {
  const widthUnits = Math.max(0.02, (block.bounds?.w || 0.5) * aspect);
  return linesOf(block.text, size, widthUnits, glyphRatio(block.font)) * size * LEADING;
}

// Разводим подписи карточки: каждой рамке — высота по её тексту,
// затем ставим их сверху вниз с зазором. Если не влезло в карточку — ужимаем кегли и повторяем.
export function repairCard(card) {
  const blocks = (card?.text_blocks || []).map((block) => ({ ...block, bounds: { ...block.bounds } }));
  if (!blocks.length) return card;
  const aspect = aspectOf(card);
  let sizes = blocks.map((block) => Math.max(MIN_SIZE, Number(block.font_size) || 0.04));
  let items = null;

  for (let pass = 0; pass < 5; pass += 1) {
    items = blocks
      .map((block, i) => ({
        i,
        size: sizes[i],
        need: heightFor(block, sizes[i], aspect),
        center: block.bounds.y + block.bounds.h / 2,
      }))
      .sort((a, b) => a.center - b.center);
    let cursor = Math.max(TOP_LIMIT, items[0].center - items[0].need / 2);
    for (const item of items) {
      cursor = Math.max(cursor, item.center - item.need / 2, TOP_LIMIT);
      item.top = cursor;
      cursor += item.need + GAP;
    }
    const bottom = items[items.length - 1].top + items[items.length - 1].need;
    if (bottom <= BOTTOM_LIMIT) break;
    const room = Math.max(0.05, BOTTOM_LIMIT - items[0].top);
    const k = Math.max(0.35, room / Math.max(0.001, bottom - items[0].top));
    sizes = sizes.map((size) => Math.max(MIN_SIZE, size * k));
  }

  const text_blocks = blocks.map((block, i) => {
    const item = items.find((entry) => entry.i === i);
    if (!item) return block;
    const y = Math.min(Math.max(item.top, 0), Math.max(0, 1 - item.need));
    return {
      ...block,
      font_size: Number(item.size.toFixed(4)),
      bounds: { ...block.bounds, y: Number(y.toFixed(4)), h: Number(item.need.toFixed(4)) },
    };
  });
  return { ...card, text_blocks };
}

// Один шрифт на всю карусель: берём самый частый в карточках. При равенстве — шрифт первой карточки.
export function unifiedFont(cards) {
  const counts = new Map();
  for (const card of cards) {
    for (const block of card?.text_blocks || []) {
      const key = resolveFont(block.font).key;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  if (!counts.size) return "";
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function checkCard(card, font) {
  // Own-style cards render through the full saved role typography. Do not
  // replace its fonts or resize/reflow source text boxes on every page load.
  if (card.visual_mode === "own" || card.visual_mode === "text") return { ...card, text: card.text_blocks.map(block => block.text).join("\n\n") };
  const text_blocks = (card.text_blocks || []).map((block) => ({ ...block, font: font || block.font }));
  const next = repairCard({ ...card, text_blocks });
  return { ...next, text: next.text_blocks.map((block) => block.text).join("\n\n") };
}

// План перед сохранением: единый шрифт и проверенная раскладка в каждой карточке.
export function checkPlanCards(plan) {
  const slides = plan?.slides || [];
  const cards = slides.map((slide) => slide.reference_card).filter((card) => card?.schema_version === 2);
  if (!cards.length) return plan;
  const font = unifiedFont(cards);
  return {
    ...plan,
    slides: slides.map((slide) => {
      if (slide.reference_card?.schema_version !== 2) return slide;
      const reference_card = checkCard(slide.reference_card, font);
      return { ...slide, reference_card, text: reference_card.text };
    }),
  };
}

// Уже сохранённые слайды: та же проверка при открытии карусели.
// Возвращаем и список изменившихся — их нужно переписать в базе один раз.
export function checkSlides(slides = []) {
  const cards = slides.map((slide) => slide.reference_card).filter((card) => card?.schema_version === 2);
  if (!cards.length) return { slides, changed: [] };
  const font = unifiedFont(cards);
  const fixed = slides.map((slide) => {
    if (slide.reference_card?.schema_version !== 2) return slide;
    const reference_card = checkCard(slide.reference_card, font);
    if (JSON.stringify(reference_card) === JSON.stringify(slide.reference_card)) return slide;
    return { ...slide, reference_card, text: reference_card.text };
  });
  return { slides: fixed, changed: fixed.filter((slide, i) => slide !== slides[i]) };
}
