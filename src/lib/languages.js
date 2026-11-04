// Языки надписей на карточках и подписи к посту.
// «orig» — оставить как в оригинале: доступен только в «Зеркале».
export const LANGS = [
  { id: "ru", label: "Русский", short: "рус" },
  { id: "es", label: "Español", short: "esp" },
  { id: "en", label: "English", short: "eng" },
];

export const ORIGINAL_LANG = { id: "orig", label: "Как в оригинале", short: "ориг" };

export const LANGUAGE_IDS = [...LANGS.map((lang) => lang.id), ORIGINAL_LANG.id];

// Переводить имеет смысл только на настоящий язык: «как в оригинале» оставляет текст как есть.
export const isTranslated = (language) => LANGS.some((lang) => lang.id === language);

// Язык по умолчанию: «Зеркало» ничего не переводит, остальные режимы говорят по-русски.
export const defaultLanguage = (mirror) => (mirror ? ORIGINAL_LANG.id : "ru");

// Явный выбор пользователя главнее режима; несовместимый с режимом — откатывается к умолчанию.
export const pickLanguage = (picked, mirror) => {
  if (isTranslated(picked)) return picked;
  if (mirror && (!picked || picked === ORIGINAL_LANG.id)) return ORIGINAL_LANG.id;
  return defaultLanguage(mirror);
};