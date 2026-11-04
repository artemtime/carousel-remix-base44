export const FEEDBACK_STATUSES = [
  { id: "new", label: "Новое", tone: "text-amber-300 border-amber-400/40 bg-amber-400/10" },
  { id: "in_progress", label: "В работе", tone: "text-sky-300 border-sky-400/40 bg-sky-400/10" },
  { id: "fixed", label: "Исправлено", tone: "text-emerald-300 border-emerald-400/40 bg-emerald-400/10" },
  { id: "declined", label: "Не будем", tone: "text-muted-foreground border-border bg-[hsl(var(--muted))]" },
];

export const feedbackStatus = (id) => FEEDBACK_STATUSES.find((item) => item.id === id) || FEEDBACK_STATUSES[0];

export const FEEDBACK_KINDS = {
  bug: "Сломалось",
  idea: "Идея",
  other: "Другое",
};