// Серия на неделю: одна тема и стиль, несколько отдельных каруселей.
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Layers, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { planSeries, buildSeriesPost } from "@/lib/author";
import { cn } from "@/lib/utils";

const COUNTS = [2, 3, 4, 5, 6];

export default function SeriesDialog({ open, onOpenChange, onDone }) {
  const navigate = useNavigate();
  const anglesFn = useServerFn(planSeries);
  const postFn = useServerFn(buildSeriesPost);
  const [styles, setStyles] = useState([]);
  const [styleId, setStyleId] = useState("");
  const [topic, setTopic] = useState("");
  const [count, setCount] = useState(4);
  const [busy, setBusy] = useState("");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [created, setCreated] = useState([]);

  useEffect(() => {
    if (!open) return;
    setCreated([]);
    setProgress({ done: 0, total: 0 });
    base44.entities.MyStyle.list({ sort: "-updated_date", limit: 30 }).then((page) => {
      const items = page.items || [];
      setStyles(items);
      setStyleId(items[0]?.id || "");
    });
  }, [open]);

  const run = async () => {
    if (!styleId) return toast.error("Сначала создайте стиль");
    if (topic.trim().length < 3) return toast.error("Опишите тему серии");
    setBusy("angles");
    setCreated([]);
    try {
      const { posts } = await anglesFn({ data: { styleId, topic: topic.trim(), count } });
      setBusy("posts");
      setProgress({ done: 0, total: posts.length });
      const done = [];
      for (let i = 0; i < posts.length; i += 1) {
        try {
          const record = await postFn({ data: { styleId, topic: topic.trim(), angle: posts[i], index: i + 1, total: posts.length } });
          done.push(record);
          setCreated([...done]);
        } catch (error) {
          toast.error(`Пост ${i + 1}: ${String(error.message || error).slice(0, 120)}`);
        }
        setProgress({ done: i + 1, total: posts.length });
      }
      setBusy("");
      if (done.length) {
        toast.success(`Готово: ${done.length} карусели в серии`);
        onDone?.();
      }
    } catch (error) {
      setBusy("");
      toast.error(String(error.message || error).slice(0, 220));
    }
  };

  const working = Boolean(busy);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto border-border bg-[hsl(var(--card))]">
        <DialogHeader>
          <DialogTitle className="text-[17px]">Серия на неделю</DialogTitle>
          <DialogDescription className="text-[12.5px] text-muted-foreground">
            Одна тема — несколько отдельных каруселей в одном стиле. Автор сам разведёт посты по разным углам, каждая карусель откроется и рисуется отдельно.
          </DialogDescription>
        </DialogHeader>

        {styles.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center">
            <p className="text-[13px] font-medium">Сначала нужен стиль</p>
            <p className="mt-1 text-[12px] text-muted-foreground">Снимите стиль с референса в «Моих стилях».</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="mb-1.5 block text-[11px] uppercase tracking-[0.12em] text-muted-foreground">стиль</label>
              <select
                value={styleId}
                onChange={(e) => setStyleId(e.target.value)}
                disabled={working}
                className="h-9 w-full rounded-lg border border-border bg-[hsl(var(--input))]/40 px-2.5 text-[12.5px] outline-none focus:border-[hsl(var(--primary))]/50"
              >
                {styles.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-[11px] uppercase tracking-[0.12em] text-muted-foreground">тема серии</label>
              <textarea
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                rows={2}
                disabled={working}
                placeholder="например: как перестать ждать разрешения жить"
                className="w-full resize-none rounded-lg border border-border bg-[hsl(var(--input))]/40 px-3 py-2 text-[12.5px] leading-relaxed outline-none focus:border-[hsl(var(--primary))]/50"
              />
            </div>

            <div>
              <p className="mb-1.5 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">постов на неделю</p>
              <div className="flex gap-1.5">
                {COUNTS.map((n) => (
                  <button
                    key={n}
                    onClick={() => setCount(n)}
                    disabled={working}
                    className={cn(
                      "h-8 w-9 rounded-md border text-[12px] transition-colors",
                      count === n ? "border-[hsl(var(--primary))]/60 bg-[hsl(var(--primary))]/10" : "border-border/70 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={run}
              disabled={working}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[hsl(var(--primary))] px-4 py-2.5 text-[13px] font-medium text-[hsl(var(--primary-foreground))] transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <Layers className="h-4 w-4" />}
              {busy === "angles" ? "Автор ищет разные углы…" : busy === "posts" ? `Пишу посты: ${progress.done} из ${progress.total}` : "Собрать серию"}
            </button>

            {created.length > 0 && (
              <div className="space-y-1 rounded-lg border border-border/70 bg-[hsl(var(--muted))]/50 p-2">
                {created.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => navigate({ to: "/author/$carouselId", params: { carouselId: item.id } })}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11.5px] hover:bg-[hsl(var(--accent))]"
                  >
                    <span className="w-4 shrink-0 text-muted-foreground">{item.index}</span>
                    <span className="min-w-0 flex-1 truncate">{item.title}</span>
                    <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}