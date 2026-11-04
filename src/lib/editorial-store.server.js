import { editorialSettings, periodKeys } from "./editorial-policy.js";
export const observed = (row, key) => row[key] === undefined ? { $exists: false } : row[key];
export async function conditionalUpdate(table, row, fields, patch) {
  return (await table.updateMany({ id: row.id, ...Object.fromEntries(fields.map(k => [k, observed(row, k)])) }, { $set: patch })).updated === 1;
}
export async function studioSettings(base44) {
  return (await base44.entities.Settings.list({ sort: "-created_date", limit: 1 })).items?.[0] || null;
}
export async function assertStudioRunning(base44) {
  const settings = await studioSettings(base44);
  if (editorialSettings(settings).paused) {
    const error = new Error("Редакция на паузе. Возобновите работу на главном экране.");
    error.stopRender = true; throw error;
  }
  return settings;
}
export async function reserveStudioUsage(base44, kind, now = new Date()) {
  if (!base44.entities?.Settings) return;
  for (let attempt = 0; attempt < 8; attempt++) {
    const settings = await assertStudioRunning(base44);
    const e = editorialSettings(settings);
    if (!settings || !e.configured) return;
    const { day, week } = periodKeys(e.timezone, now);
    const daily = settings.usage_day === day ? Number(settings[`usage_${kind}_day`]) || 0 : 0;
    const weekly = settings.usage_week === week ? Number(settings[`usage_${kind}_week`]) || 0 : 0;
    if (daily >= e.limits[`${kind}_day`] || weekly >= e.limits[`${kind}_week`]) {
      const error = new Error(`Достигнут дневной или недельный лимит ${kind === "image" ? "рисунков" : kind === "scout" ? "проверок авторов" : "обращений к ИИ"}. Готовая работа сохранена.`);
      error.stopRender = true; throw error;
    }
    const patch = { usage_day: day, usage_week: week };
    for (const k of ["image", "text", "scout"]) {
      patch[`usage_${k}_day`] = (settings.usage_day === day ? Number(settings[`usage_${k}_day`]) || 0 : 0) + (kind === k ? 1 : 0);
      patch[`usage_${k}_week`] = (settings.usage_week === week ? Number(settings[`usage_${k}_week`]) || 0 : 0) + (kind === k ? 1 : 0);
    }
    if (await conditionalUpdate(base44.entities.Settings, settings, ["editorial_revision","editorial_control_version","usage_day", "usage_week", ...["image", "text", "scout"].flatMap(k => [`usage_${k}_day`, `usage_${k}_week`])], patch)) return;
  }
  const error = new Error("Не удалось зарезервировать лимит. Повторите позже."); error.stopRender = true; throw error;
}
export async function editorialEvent(base44, kind, message, carouselId = "", itemId = "") {
  return base44.entities.EditorialEvent.create({ kind, message: String(message).slice(0, 800), carousel_id: carouselId, item_id: itemId, read: false });
}
