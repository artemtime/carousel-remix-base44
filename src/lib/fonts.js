// Каталог шрифтов из carousel-remix-bot/render.py — все с кириллицей (Google Fonts, OFL).
// variable: у шрифта есть ось толщины, поэтому запрашиваем конкретный вес.

export const FONTS = [
  { key: "Montserrat", family: "Montserrat", variable: true, about: "чистый геометрический гротеск, современный, жирные подписи поверх кадров" },
  { key: "Rubik", family: "Rubik", variable: true, about: "мягкий гротеск со скруглёнными углами, дружелюбный, современный" },
  { key: "Oswald", family: "Oswald", variable: true, about: "узкий жирный гротеск, высокий, газетный / плакатный" },
  { key: "Cuprum", family: "Cuprum", variable: true, about: "узкий гуманистический гротеск, слегка игривый" },
  { key: "Jura", family: "Jura", variable: true, about: "тонкий технический квадратный гротеск, научная фантастика" },
  { key: "RussoOne", family: "Russo One", variable: false, about: "тяжёлый широкий квадратный гротеск, спорт / игры" },
  { key: "ProstoOne", family: "Prosto One", variable: false, about: "тяжёлый округлый акцидентный гротеск, плакат" },
  { key: "SeymourOne", family: "Seymour One", variable: false, about: "сверхчёрный широкий акцидентный, громкие заголовки" },
  { key: "TenorSans", family: "Tenor Sans", variable: false, about: "элегантный светлый гротеск, мода" },
  { key: "Comfortaa", family: "Comfortaa", variable: true, about: "округлый геометрический, мягкий и милый" },
  { key: "KellySlab", family: "Kelly Slab", variable: false, about: "узкий брусок со старостильными формами, острые Л и Д, историческое / эпическое" },
  { key: "Kurale", family: "Kurale", variable: false, about: "каллиграфическая антиква с острыми Л и Д, старая книга / легенда" },
  { key: "Ledger", family: "Ledger", variable: false, about: "крепкая книжная антиква с острыми Л и Д" },
  { key: "Underdog", family: "Underdog", variable: false, about: "чудаковатые рукодельные прописные, сказка" },
  { key: "Philosopher", family: "Philosopher", variable: false, about: "полуантиква с раструбами, мистическое / философское" },
  { key: "Podkova", family: "Podkova", variable: true, about: "брусок со скруглёнными деталями" },
  { key: "Forum", family: "Forum", variable: false, about: "классическая римская антиква капсом, острые Л и Д" },
  { key: "Oranienbaum", family: "Oranienbaum", variable: false, about: "элегантная высококонтрастная узкая антиква" },
  { key: "OldStandard", family: "Old Standard TT", variable: false, about: "книжная антиква XIX века, высокий контраст" },
  { key: "CormorantSC", family: "Cormorant SC", variable: false, about: "изящная капитель, люкс" },
  { key: "YesevaOne", family: "Yeseva One", variable: false, about: "тяжёлая контрастная акцидентная антиква, модные заголовки" },
  { key: "Alice", family: "Alice", variable: false, about: "мягкая сказочная антиква" },
  { key: "ElMessiri", family: "El Messiri", variable: true, about: "современный гротеск с каллиграфическим характером" },
  { key: "RuslanDisplay", family: "Ruslan Display", variable: false, about: "тяжёлый старославянский декоративный акцидентный" },
  { key: "Neucha", family: "Neucha", variable: false, about: "небрежный рукописный маркер капсом, острые Л" },
  { key: "Pangolin", family: "Pangolin", variable: false, about: "округлый рукописный, мелки / детская иллюстрация" },
  { key: "AmaticSC", family: "Amatic SC", variable: false, about: "очень узкие рукописные прописные" },
  { key: "Caveat", family: "Caveat", variable: true, about: "естественный почерк, заметки" },
  { key: "BadScript", family: "Bad Script", variable: false, about: "тонкий небрежный почерк" },
  { key: "MarckScript", family: "Marck Script", variable: false, about: "плавная каллиграфическая пропись" },
  { key: "Lobster", family: "Lobster", variable: false, about: "жирный ретро-скрипт" },
  { key: "RubikDirt", family: "Rubik Dirt", variable: false, about: "гранжевый потёртый гротеск, грубая фактура" },
  { key: "RubikDistressed", family: "Rubik Distressed", variable: false, about: "изношенный потёртый гротеск" },
  { key: "RubikWetPaint", family: "Rubik Wet Paint", variable: false, about: "акцидентный со стекающей краской" },
  { key: "RubikMonoOne", family: "Rubik Mono One", variable: false, about: "тяжёлый моноширинный акцидентный" },
  { key: "YanoneKaffeesatz", family: "Yanone Kaffeesatz", variable: true, about: "узкий винтажный гротеск, лёгкий" },
  { key: "PressStart2P", family: "Press Start 2P", variable: false, about: "пиксельный 8-битный, игры" },
];

export const FONT_BY_KEY = Object.fromEntries(FONTS.map((f) => [f.key, f]));

// Текстовый список для «мозга», как в оригинале.
export const FONT_CATALOG_TEXT = FONTS.map((f) => `${f.key} — ${f.about}`).join("\n");

const byName = new Map();
for (const font of FONTS) {
  byName.set(font.key.toLowerCase(), font);
  byName.set(font.family.toLowerCase(), font);
  byName.set(font.family.toLowerCase().replace(/\s+/g, ""), font);
}

// Модель иногда возвращает название семейства вместо ключа каталога: узнаём оба варианта,
// иначе подпись молча падает на запасной шрифт и перестаёт совпадать с оригиналом.
export function resolveFont(name) {
  const raw = String(name || "").trim().toLowerCase();
  return byName.get(raw) || byName.get(raw.replace(/\s+/g, "")) || FONT_BY_KEY.Montserrat;
}

const links = new Map();

function ensureLink(font, weight) {
  if (typeof document === "undefined") return Promise.resolve();
  const family = font.family.replace(/\s+/g, "+");
  const id = `gf-${family}-${font.variable ? weight : "base"}`;
  if (links.has(id)) return links.get(id);
  const href = font.variable
    ? `https://fonts.googleapis.com/css2?family=${family}:wght@${weight}&display=swap`
    : `https://fonts.googleapis.com/css2?family=${family}&display=swap`;
  const promise = new Promise((resolve) => {
    const existing = document.getElementById(id);
    if (existing) return resolve();
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = href;
    link.onload = () => resolve();
    link.onerror = () => resolve();
    document.head.appendChild(link);
  });
  links.set(id, promise);
  return promise;
}

export async function loadFonts(key, weight = 600, boldWeight = 800) {
  const font = resolveFont(key);
  if (typeof document === "undefined") return;
  const weights = font.variable ? Array.from(new Set([weight, boldWeight])) : [400];
  await Promise.all(weights.map((w) => ensureLink(font, w)));
  if (document.fonts) {
    await Promise.all(weights.map((w) => document.fonts.load(`${w} 64px "${font.family}"`, "АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЫЭЮЯабвгдеёжзийклмнопрстуфхцчшщыэюя").catch(() => null)));
    await document.fonts.ready;
  }
  return font.family;
}

export function familyOf(key) {
  return resolveFont(key).family;
}