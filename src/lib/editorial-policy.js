export const EDITORIAL_MODES = [
  { id: "manual", label: "Ручной", hint: "Вы запускаете каждый этап." },
  { id: "editor", label: "Редактор", hint: "ИИ готовит материалы, вы утверждаете идеи и публикации." },
  { id: "autopilot", label: "Автопилот", hint: "Этапы выполняются по вашим правилам и утверждённому образцу." },
];
export const STAGES = [
  { id: "scout", label: "Разведка по расписанию" },
  { id: "ideas", label: "Выбор идей" },
  { id: "production", label: "План и рисунки" },
  { id: "repair", label: "Исправление замечаний" },
  { id: "approval", label: "Утверждение готовых карточек" },
  { id: "publish", label: "Публикация по расписанию" },
];
export const PRESETS = {
  manual: { scout: false, ideas: false, production: false, repair: false, approval: false, publish: false },
  editor: { scout: true, ideas: false, production: true, repair: true, approval: false, publish: false },
  autopilot: { scout: true, ideas: true, production: true, repair: true, approval: true, publish: false },
};
export const DEFAULT_EDITORIAL = {
  configured: false, paused: false, mode: "manual", stages: PRESETS.manual,
  audience: "", product: "", goal: "subscribers", voice: "", good_examples: "", bad_examples: "",
  topics: "", excluded_topics: "", style_id: "", hero_id: "", image_model: "automatic",
  posts_per_week: 3, publish_hour: 12, publish_days: [1, 3, 5], timezone: "Europe/Moscow",
  content_mode: "adapt", language: "ru", channel_id: "", daily_report: true,
  limits: { image_day: 60, image_week: 200, text_day: 160, text_week: 600, scout_day: 10, scout_week: 50 },
  template_signature: "", template_carousel_id: "", template_url: "", template_confirmed_at: "",
};
export function editorialSettings(settings) {
  const e = settings?.editorial || {};
  return { ...DEFAULT_EDITORIAL, ...e, stages: { ...PRESETS[e.mode || "manual"], ...e.stages }, limits: { ...DEFAULT_EDITORIAL.limits, ...e.limits } };
}
export function stageAutomatic(settings, stage) {
  const e = editorialSettings(settings);
  return e.configured && !e.paused && Boolean(e.stages[stage]);
}
export function periodKeys(timezone = "UTC", now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" }).formatToParts(now).map(x => [x.type, x.value]));
  const day = `${p.year}-${p.month}-${p.day}`;
  const weekday = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }[p.weekday];
  const week = new Date(Date.parse(`${day}T12:00:00Z`) - weekday * 86400000).toISOString().slice(0, 10);
  return { day, week };
}
export function briefPrompt(settings) {
  const e = editorialSettings(settings);
  if (!e.configured) return "";
  return `\nЗАДАНИЕ МОЕЙ РЕДАКЦИИ (это ограничения содержания, визуальный стиль не меняй):\nАудитория: ${e.audience}\nПродукт: ${e.product}\nЦель: ${e.goal}\nТемы: ${e.topics}\nИсключённые темы: ${e.excluded_topics}\nГолос автора: ${e.voice}\nУдачные формулировки: ${e.good_examples}\nНеудачные формулировки: ${e.bad_examples}\nНе выдумывай личный опыт, результаты клиентов, цены или факты о моём продукте.`;
}
export function blockedTopic(text, excluded) {
  const lower = String(text || "").toLocaleLowerCase();
  return String(excluded || "").split(/[\n,;]+/).map(x => x.trim().toLocaleLowerCase()).filter(x => x.length >= 3).find(x => lower.includes(x)) || "";
}
export function nextPublicationSlot(e, occupied = [], now = new Date()) {
  const used = new Set(occupied.filter(x=>Number.isFinite(Date.parse(x))).map(x => periodKeys(e.timezone,new Date(x)).day));
  const weekdays = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  // Search UTC instants and test local calendar parts: DST transitions are not guessed.
  const start = Math.ceil((now.getTime() + 30 * 60000) / 900000) * 900000;
  for (let i = 0; i < 96 * 28; i++) {
    const date = new Date(start + i * 900000);
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: e.timezone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date).map(x => [x.type, x.value]));
    if (e.publish_days.includes(weekdays[p.weekday]) && Number(p.hour) === e.publish_hour && Number(p.minute) === 0 && !used.has(periodKeys(e.timezone,date).day)) return date.toISOString();
  }
  throw new Error("Нет свободного времени публикации в ближайшие четыре недели");
}
export const ITEM_LABELS = { idea: "Утвердить идею", approved: "Можно готовить", planning: "Пишется план", planned: "Запустить рисование", rendering: "Рисуется", checking: "Проверяются карточки", repair: "Нужно исправление", review: "Утвердить публикацию", ready: "Готово к публикации", scheduled: "Запланировано", queued: "В очереди Buffer", published: "Опубликовано", deferred: "Отложено", skipped: "Пропущено", error: "Нужно решение" };
