import { History, Radar, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";

// История разведки: последние поиски и оставленные аккаунты.
// Клик — сразу повторить этот поиск.
const isPost = (value) => /^https?:/i.test(value);
const labelOf = (value) => (isPost(value) ? `пост ${value.split("/p/")[1]?.replace(/\/.*$/, "") || "по ссылке"}` : `@${value}`);

export default function KeptAccounts({ items, active, onRun }) {
  if (!items.length) {
    return (
      <section className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground">
        <History className="h-3 w-3" /> история разведки появится после первого поиска
      </section>
    );
  }
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground">
        <History className="h-3 w-3" /> история разведки · последние {items.length}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((w) => (
          <button
            key={w.handle}
            onClick={() => onRun(w.handle)}
            title={w.last_note || "ещё не проверялся"}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] transition-colors",
              active?.toLowerCase() === w.handle.toLowerCase()
                ? "border-[hsl(var(--primary))]/60 bg-[hsl(var(--primary))]/10 text-foreground"
                : "border-border/70 text-muted-foreground hover:bg-[hsl(var(--accent))] hover:text-foreground",
            )}
          >
            {isPost(w.handle) ? <Link2 className="h-3 w-3" /> : <Radar className="h-3 w-3" />}
            {labelOf(w.handle)}
          </button>
        ))}
      </div>
    </section>
  );
}