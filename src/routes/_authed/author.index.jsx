import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { PenLine, Trash2, ArrowRight, Search, Layers } from "lucide-react";
import { base44 } from "@/api/base44Client";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import SeriesDialog from "@/components/SeriesDialog";

export const Route = createFileRoute("/_authed/author/")({
  head: () => ({ meta: [{ title: "Автор — Цифровые сотрудники" }] }),
  component: AuthorPage,
});

const STATUS = { plan: "план", rendering: "рисуется", ready: "готово", published: "опубликовано" };

function AuthorPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [seriesOpen, setSeriesOpen] = useState(false);

  const load = useCallback(async () => {
    const page = await base44.entities.Carousel.list({ sort: "-updated_date", limit: 60 });
    setItems(page.items || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="fade-in">
      <PageHeader
        eyebrow="автор"
        title="Карусели"
        description="План текста, слайды и подпись к посту. Текст правится на месте — картинка перерисовывается мгновенно."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setSeriesOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3.5 py-2 text-[13px] font-medium hover:bg-[hsl(var(--accent))]"
            >
              <Layers className="h-4 w-4" /> Серия на неделю
            </button>
            <Link to="/scout" className="inline-flex items-center gap-2 rounded-lg bg-[hsl(var(--primary))] px-3.5 py-2 text-[13px] font-medium text-[hsl(var(--primary-foreground))]">
              <Search className="h-4 w-4" /> Из разведки
            </Link>
          </div>
        }
      />

      <div className="px-5 py-6 md:px-8">
        {loading ? (
          <p className="text-[12.5px] text-muted-foreground">Загружаю…</p>
        ) : items.length === 0 ? (
          <EmptyState icon={PenLine} title="Здесь пока пусто" description="Автор собирает карусель из найденного поста или из расшифровки рилса.">
            <Link to="/scout" className="rounded-lg bg-[hsl(var(--primary))] px-3.5 py-2 text-[12.5px] font-medium text-[hsl(var(--primary-foreground))]">
              Начать разведку
            </Link>
          </EmptyState>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((c) => (
              <div key={c.id} className="group rounded-xl border border-border/70 bg-[hsl(var(--card))] p-4 transition-colors hover:border-border">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-medium">{c.title}</p>
                    <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
                      {c.style_name} · {c.slides_count || 0} слайдов · {c.mode === "adapt" ? "в своём мире" : "как у автора"}
                      {c.series ? ` · серия: ${c.series} (${c.series_index}/${c.series_total})` : ""}
                    </p>
                  </div>
                  <button
                    onClick={async () => {
                      const slides = await base44.entities.Slide.filter({ carousel_id: c.id }, { limit: 50 });
                      await Promise.all((slides.items || []).map((s) => base44.entities.Slide.delete(s.id)));
                      await base44.entities.Carousel.delete(c.id);
                      load();
                    }}
                    className="rounded p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/15 hover:text-destructive-foreground group-hover:opacity-100"
                    title="Удалить"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <span className="rounded-full bg-[hsl(var(--muted))] px-2 py-0.5 text-[10.5px] text-muted-foreground">{STATUS[c.status] || c.status}</span>
                  <button
                    onClick={() => navigate({ to: "/author/$carouselId", params: { carouselId: c.id } })}
                    className="ml-auto inline-flex items-center gap-1 text-[11.5px] text-[hsl(var(--primary))]"
                  >
                    открыть <ArrowRight className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <SeriesDialog open={seriesOpen} onOpenChange={setSeriesOpen} onDone={load} />
    </div>
  );
}