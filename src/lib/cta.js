import { isTranslated } from "@/lib/languages";

// Кодовое слово по умолчанию для каждого языка публикации.
const DEFAULT_CODEWORD = { ru: "ХОЧУ", es: "QUIERO", en: "WANT" };

// Готовый призыв собираем из кодового слова и подарка, пока память пуста.
const TEMPLATE = {
  ru: (word, gift) => `Напишите «${word}» в комментариях — пришлю ${gift || "подарок"}`,
  es: (word, gift) => `Escribe «${word}» en los comentarios y te envío ${gift || "el regalo"}`,
  en: (word, gift) => `Comment «${word}» and I'll send you ${gift || "the gift"}`,
};

// Призыв для языка публикации: память главнее, иначе собираем из настроек.
// «Как в оригинале» перевода не делаем — памяти для него нет.
export function ctaFor(settings, language) {
  if (!isTranslated(language)) return null;
  const saved = settings?.cta_memory?.[language] || {};
  // Русское кодовое слово задано в настройках; у других языков память своя.
  const codeword = saved.codeword || (language === "ru" ? settings?.codeword : "") || DEFAULT_CODEWORD[language];
  const cta = saved.cta || (TEMPLATE[language] || TEMPLATE.ru)(codeword, settings?.gift);
  return { cta, codeword };
}

// Настройки вместе с призывом языка — их получают промпты плана и перевода.
export function withCta(settings, language) {
  const cta = ctaFor(settings, language);
  return cta ? { ...settings, cta: cta.cta, codeword: cta.codeword } : settings;
}

// Подтверждённый или исправленный призыв запоминаем в память этого языка.
export function rememberCta(settings, language, value) {
  const memory = settings?.cta_memory || {};
  if (!isTranslated(language) || !value?.cta?.trim()) return memory;
  return {
    ...memory,
    [language]: {
      cta: value.cta.trim(),
      codeword: String(value.codeword || "").trim(),
    },
  };
}
// Подтверждённый призыв сохраняется дословно и вытесняет чужой финальный призыв.
export function applyConfirmedCta(plan, settings, language) {
  if (!isTranslated(language) || !settings?.cta?.trim() || !plan.slides?.length) return plan;
  const ownHandle = String(settings.instagram_handle || "").replace(/^@/, "").trim();
  const cta = settings.cta.trim();
  const finalText = ownHandle && !cta.includes(`@${ownHandle}`) ? `${cta}\n@${ownHandle}` : cta;
  const slides = plan.slides.map((slide, i) => {
    if (i !== plan.slides.length - 1) return slide;
    const blocks = slide.reference_card?.text_blocks;
    if (!blocks?.length) return { ...slide, role: "cta", text: finalText };
    const text_blocks = blocks.map((block, n) => ({ ...block, text: n === 0 ? finalText : "" }));
    return { ...slide, role: "cta", text: finalText, reference_card: { ...slide.reference_card, text_blocks } };
  });
  const caption = String(plan.caption || "").split("\n")
    .filter((line) => !(/(?:follow|подпиш|suscr|sigue|segu)/i.test(line) && (/@[a-zA-Z0-9._]+/.test(line) || /(?:на\s+для|подпиш[а-яё]*\s+для|follow\s+(?:for|to))/i.test(line))))
    .join("\n").replace(/@[a-zA-Z0-9._]+/g, ownHandle ? `@${ownHandle}` : "").trim();
  const body = caption.split(finalText).join("").split(cta).join("").split("\n").filter(line => !/^\s*[.!?,;:]\s*$/.test(line)).join("\n").trim().replace(/\n{3,}/g, "\n\n");
  return { ...plan, slides, caption: [body, finalText].filter(Boolean).join("\n\n") };
}
