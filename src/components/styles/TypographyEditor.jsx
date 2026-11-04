// Типографика по ролям: у хука, текста и финала может быть свой размер, цвет и шрифт.
import CaptionControls from "@/components/styles/CaptionControls";
import { SLIDE_ROLES, normalizeProfile } from "@/lib/slide-renderer";
import { cn } from "@/lib/utils";

const TABS = [{ id: "base", label: "общая" }, ...SLIDE_ROLES];

export default function TypographyEditor({ base, typography, role = "base", onRoleChange, onChange }) {
  const custom = role !== "base" && typography?.[role];
  const current = normalizeProfile(role === "base" ? base : { ...(base || {}), ...(custom || {}) });

  const set = (next) => {
    if (role === "base") return onChange({ caption: next });
    onChange({ typography: { ...(typography || {}), [role]: next } });
  };

  const reset = () => {
    if (role === "base") return;
    const next = { ...(typography || {}) };
    delete next[role];
    onChange({ typography: next });
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5">
        {TABS.map((tab) => {
          const own = tab.id !== "base" && Boolean(typography?.[tab.id]);
          return (
            <button
              key={tab.id}
              onClick={() => onRoleChange(tab.id)}
              className={cn(
                "rounded-md border px-2.5 py-1 text-[11.5px] transition-colors",
                role === tab.id ? "border-[hsl(var(--primary))]/60 bg-[hsl(var(--primary))]/10 text-foreground" : "border-border/70 text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
              {own && <span className="ml-1 text-[hsl(var(--primary))]">•</span>}
            </button>
          );
        })}
      </div>

      {role !== "base" && (
        <div className="flex items-center justify-between gap-2 rounded-md bg-[hsl(var(--muted))]/60 px-2.5 py-1.5">
          <p className="text-[11px] leading-snug text-muted-foreground">
            {custom ? "Роль настроена отдельно от общей подписи." : "Пока как общая. Любое изменение включит отдельную настройку."}
          </p>
          {custom && (
            <button onClick={reset} className="shrink-0 text-[11px] text-muted-foreground hover:text-foreground">
              как общая
            </button>
          )}
        </div>
      )}

      <CaptionControls profile={current} onChange={set} />
    </div>
  );
}