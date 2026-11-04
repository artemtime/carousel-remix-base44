import { useState } from "react";
import { Flame, Trophy, TrendingUp, Heart, MessageCircle, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const BADGES = {
  hot: { label: "свежий хит", icon: Flame, tone: "bg-orange-500/12 text-orange-300" },
  best: { label: "лучшее вообще", icon: Trophy, tone: "bg-amber-400/12 text-amber-300" },
  rising: { label: "ещё набирает", icon: TrendingUp, tone: "bg-emerald-500/12 text-emerald-300" },
};

export default function HitCard({ hit, onPick, onSave }) {
  const badge = BADGES[hit.badge] || BADGES.hot;
  const Icon = badge.icon;
  const [wants, setWants] = useState({ style: false, hero: false });
  const [busy, setBusy] = useState(false);
  const empty = !wants.style && !wants.hero;

  const save = async () => {
    setBusy(true);
    try {
      await onSave(hit, wants);
    } catch (e) {
      toast.error(String(e.message || e).slice(0, 220));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="group flex flex-col overflow-hidden rounded-xl border border-border/70 bg-[hsl(var(--card))] transition-colors hover:border-border">
      <div className="flex gap-3 p-3">
        <div className="relative h-[104px] w-[84px] shrink-0 overflow-hidden rounded-lg bg-[hsl(var(--muted))]">
          {hit.thumb && <img src={hit.thumb} alt="" className="h-full w-full object-cover" />}
          <span className={["absolute left-1 top-1 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9.5px] font-medium backdrop-blur", badge.tone].join(" ")}>
            <Icon className="h-2.5 w-2.5" /> {badge.label}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-[15px] font-semibold tabular-nums text-[hsl(var(--primary))]">×{hit.ratio}</span>
            <span className="text-[11px] text-muted-foreground">к обычному уровню</span>
          </div>
          <div className="mt-1 flex items-center gap-3 text-[11.5px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Heart className="h-3 w-3" /> {compact(hit.likes)}
            </span>
            <span className="inline-flex items-center gap-1">
              <MessageCircle className="h-3 w-3" /> {compact(hit.comments)}
            </span>
          </div>
          <p className="mt-1.5 line-clamp-3 text-[11.5px] leading-snug text-muted-foreground">{hit.caption || "без подписи"}</p>
        </div>
      </div>

      <div className="mt-auto space-y-2 border-t border-border/60 px-3 py-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Mark label="стиль" on={wants.style} onClick={() => setWants((w) => ({ ...w, style: !w.style }))} />
          <Mark label="персонаж" on={wants.hero} onClick={() => setWants((w) => ({ ...w, hero: !w.hero }))} />
          <button
            onClick={save}
            disabled={busy || empty}
            title={empty ? "Отметьте, что сохранить" : "Сохранить в библиотеку"}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[11px] transition-colors hover:bg-[hsl(var(--accent))] disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            {busy ? "разбираю…" : "сохранить"}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <a href={hit.url} target="_blank" rel="noreferrer" className="text-[11.5px] text-muted-foreground hover:text-foreground">
            открыть пост
          </a>
          <button
            onClick={() => onPick(hit, "mirror")}
            className="ml-auto rounded-md border border-border px-2 py-1.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
            title="Оригинал один-в-один: чужая композиция, цвета и персонажи"
          >
            как в оригинале
          </button>
          <button
            onClick={() => onPick(hit, "adapt")}
            className="rounded-md bg-[hsl(var(--primary))] px-2.5 py-1.5 text-[11.5px] font-medium text-[hsl(var(--primary-foreground))] transition-opacity hover:opacity-90"
            title="Тот же сюжет и сцены, но мой стиль и мой герой"
          >
            Сделать в своём стиле
          </button>
        </div>
      </div>
    </div>
  );
}

function Mark({ label, on, onClick }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] transition-colors",
        on ? "border-[hsl(var(--primary))]/60 bg-[hsl(var(--primary))]/10 text-foreground" : "border-border/60 text-muted-foreground hover:text-foreground",
      )}
    >
      <span
        className={cn(
          "grid h-3 w-3 place-items-center rounded-[3px] border",
          on ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]" : "border-border",
        )}
      >
        {on && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
      </span>
      {label}
    </button>
  );
}

function compact(n) {
  if (!n) return "0";
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}