import { AlertTriangle, CheckCircle2 } from "lucide-react";

// Результат самопроверки по каждому кадру: что проверено и что осталось неисправленным.
export default function PanelChecks({ checks }) {
  const items = (checks || []).filter(Boolean);
  if (!items.length) return null;

  return (
    <div className="space-y-1.5">
      {items.map((check) => (
        <div
          key={check.panel}
          className="flex items-start gap-2 rounded-lg border border-border/70 bg-[hsl(var(--muted))]/60 px-2.5 py-2"
        >
          {check.status === "ok" ? (
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
          ) : (
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
          )}
          <p className="text-[11px] leading-snug text-muted-foreground">
            Кадр {check.panel} — {check.note || (check.status === "ok" ? "проверено" : "брак не исправлен")}
          </p>
        </div>
      ))}
    </div>
  );
}