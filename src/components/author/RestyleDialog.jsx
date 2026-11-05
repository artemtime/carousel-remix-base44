import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { restyleCarousel } from "@/lib/author";
import { MODES } from "@/lib/modes";
import { cn } from "@/lib/utils";

// Пересборка готовой карусели: другой стиль и другой уровень адаптации.
export default function RestyleDialog({ open, onOpenChange, carousel, onDone }) {
  const restyleFn = useServerFn(restyleCarousel);
  const [styles, setStyles] = useState([]);
  const [styleId, setStyleId] = useState("");
  const [mode, setMode] = useState("adapt");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !carousel) return;
    setMode(carousel.mode || "adapt");
    (async () => {
      const page = await base44.entities.MyStyle.list({ sort: "-updated_date", limit: 30 });
      const items = page.items || [];
      setStyles(items);
      setStyleId((prev) => prev || carousel.style_id || items[0]?.id || "");
    })();
  }, [open, carousel]);

  const run = async () => {
    if (!carousel || !styleId) return;
    setBusy(true);
    setError("");
    try {
      const res = await restyleFn({ data: { carouselId: carousel.id, styleId, mode } });
      toast.success(`Пересобрано в стиле «${res.style_name}»: ${res.slides} слайдов. Проверьте новый результат`);
      onOpenChange(false);
      onDone?.();
    } catch (e) {
      const message = String(e.message || e).slice(0, 400);
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto border-border bg-[hsl(var(--card))]">
        <DialogHeader>
          <DialogTitle className="text-[17px]">Стиль и уровень</DialogTitle>
          <DialogDescription className="text-[12.5px] text-muted-foreground">
            {carousel?.content_format === "text" ? "Текст и оформление собираются заново. Затем проверьте и утвердите готовые PNG; рисование не требуется." : "План собирается заново под выбранный стиль. Нарисованные кадры сбрасываются — их нужно отрисовать снова."}
          </DialogDescription>
        </DialogHeader>

        {styles.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-[12.5px] text-muted-foreground">
            Стилей пока нет: откройте «Мои стили» и снимите один с карусели конкурента.
          </div>
        ) : (
          <>
            <div className="max-h-[200px] space-y-1.5 overflow-y-auto pr-1">
              {styles.filter(s=>carousel?.content_format !== "text" || s.content_format === "text").map((s) => (
                <button
                  key={s.id}
                  onClick={() => setStyleId(s.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors",
                    styleId === s.id ? "border-[hsl(var(--primary))]/60 bg-[hsl(var(--primary))]/[0.07]" : "border-border/70 hover:bg-[hsl(var(--accent))]/50",
                  )}
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-[hsl(var(--muted))] text-[11px] font-semibold uppercase">
                    {(s.name || "?").slice(0, 2)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">{s.name}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {s.hero?.name ? `герой: ${s.hero.name}` : "без героя"} · {s.aspect || "4:5"}
                    </span>
                  </span>
                </button>
              ))}
            </div>

            <div className="grid gap-1.5 sm:grid-cols-2">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setMode(m.id)}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-left transition-colors",
                    mode === m.id ? "border-[hsl(var(--primary))]/60 bg-[hsl(var(--primary))]/10" : "border-border/70 text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span className="block text-[12.5px] font-medium text-foreground">{m.label}</span>
                  <span className="mt-0.5 block text-[11px] leading-snug">{carousel?.content_format === "text" ? ({mirror:"Текст и оформление исходника без иллюстраций.",remix:"Сохранить слова и типографику без героя.",adapt:"Смысл исходника своими словами и в своём оформлении.",original:"Новые аргументы и текст по теме исходника."}[m.id]) : m.hint}</span>
                </button>
              ))}
            </div>

            {error && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-[12px] text-destructive">{error}</p>}
            <button
              onClick={run}
              disabled={busy || !styleId}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[hsl(var(--primary))] px-4 py-2.5 text-[13px] font-medium text-[hsl(var(--primary-foreground))] disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {busy ? "Собираю план заново…" : "Пересобрать карусель"}
            </button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}