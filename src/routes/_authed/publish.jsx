import { prepareFinal } from "@/lib/final-artifacts";
import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Download, Send, Loader2, Instagram } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import BufferPanel from "@/components/publish/BufferPanel";
import { normalizeProfile } from "@/lib/slide-renderer";
import { fetchImageData } from "@/lib/server-fns";
import { cn } from "@/lib/utils";
import { assertReady } from "@/lib/readiness";
import { downloadArtifact } from "@/lib/download-artifact";
import { isExactMode } from "@/lib/modes";

export const Route = createFileRoute("/_authed/publish")({
  head: () => ({ meta: [{ title: "Публикатор — Цифровые сотрудники" }] }),
  component: PublishPage,
});

function PublishPage() {
  const proxy = useServerFn(fetchImageData);
  const prepare=useServerFn(prepareFinal);
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [slides, setSlides] = useState([]);
  const [style, setStyle] = useState(null);
  const [styleAspect, setStyleAspect] = useState("4:5");
  const [carousel, setCarousel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    const page = await base44.entities.Carousel.list({ sort: "-updated_date", limit: 40 });
    const list = (page.items || []).filter((c) => c.approved_key && ["ready", "published", "queued", "scheduled"].includes(c.status));
    setItems(list);
    setSelectedId((prev) => (list.some((c) => c.id === prev) ? prev : list[0]?.id || ""));
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    (async () => {
      if (!selectedId) {
        setSlides([]);
        setCarousel(null);
        return;
      }
      const snapshot=await prepare({data:{carouselId:selectedId}});
      if(!snapshot.approved){setCarousel(null);setSlides([]);toast.error("Карусель изменилась. Повторно проверьте и утвердите её в Авторе.");return;}
      const c = snapshot.carousel;
      const page = {items:snapshot.slides};
      setCarousel(c);
      setSlides(page.items || []);
      if (c.style_id) {
        const s = await base44.entities.MyStyle.get(c.style_id).catch(() => null);
        setStyle(s ? normalizeProfile(isExactMode(c.mode) ? c.reference_profile?.caption || s.caption : s.caption) : null);
        setStyleAspect(s?.aspect || "4:5");
      } else {
        setStyle(null);
        setStyleAspect("4:5");
      }
    })();
  }, [selectedId,prepare,items]);

  const finalCaption = () => carousel?.approved_caption ?? carousel?.caption ?? "";

  const copy = async () => {
    await navigator.clipboard.writeText(finalCaption());
    toast.success("Подпись скопирована");
  };

  const downloadAll = async () => {
    setBusy("download");
    try {
      const snapshot=await prepare({data:{carouselId:selectedId}});
      if(!snapshot.approved)throw new Error("Карточки изменились. Повторно утвердите их в Авторе.");
      assertReady(snapshot.slides, snapshot.carousel.slides_count);
      for (const slide of snapshot.slides) {
        await downloadArtifact(slide.final_image_url, `${slide.position}.png`, (url)=>proxy({data:{url}}));
      }
      toast.success("Слайды сохранены");
    } catch (e) {
      toast.error(String(e.message || e).slice(0, 200));
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="fade-in">
      <PageHeader
        eyebrow="публикатор"
        title="Альбом и подпись"
        description="Ваш ник, кодовое слово и подарок уже подставлены. Отправьте карусель в Buffer в очередь или на выбранное время — либо скачайте PNG и выложите вручную."
      />

      <div className="space-y-4 px-5 py-6 md:px-8">
        {loading ? (
          <p className="text-[12.5px] text-muted-foreground">Загружаю…</p>
        ) : items.length === 0 ? (
          <EmptyState icon={Send} title="Нечего публиковать" description="Проверьте готовые карточки и нажмите «Утвердить» в студии Автора." />
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {items.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-[12px] transition-colors",
                    selectedId === c.id ? "border-[hsl(var(--primary))]/60 bg-[hsl(var(--primary))]/10" : "border-border/70 text-muted-foreground hover:text-foreground",
                  )}
                >
                  {c.title}
                  {c.status === "published" && <span className="ml-1.5 text-[10px] text-emerald-400">●</span>}
                </button>
              ))}
            </div>

            {carousel && (
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
                <div className="rounded-xl border border-border/70 bg-[hsl(var(--card))] p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">альбом · {slides.length} слайдов</p>
                    <button
                      onClick={downloadAll}
                      disabled={busy === "download"}
                      className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[11.5px] hover:bg-[hsl(var(--accent))] disabled:opacity-50"
                    >
                      {busy === "download" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} скачать все PNG
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                    {slides.map((s) => (
                      <a key={s.id} href={s.final_image_url} target="_blank" rel="noreferrer"><img src={s.final_image_url} alt={`Утверждённая карточка ${s.position}`} className="w-full rounded-lg" /></a>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="rounded-xl border border-border/70 bg-[hsl(var(--card))] p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">подпись</p>
                      <button onClick={copy} className="inline-flex items-center gap-1 text-[11.5px] text-muted-foreground hover:text-foreground">
                        <Copy className="h-3 w-3" /> копировать
                      </button>
                    </div>
                    <pre className="max-h-[320px] overflow-y-auto whitespace-pre-wrap font-body text-[12.5px] leading-relaxed text-muted-foreground">{finalCaption()}</pre>
                  </div>

                  <BufferPanel
                    carousel={carousel}
                    slides={slides}
                    style={style}
                    aspect={styleAspect}
                    caption={finalCaption()}
                    onDone={load}
                  />

                  <a
                    href="https://www.instagram.com/"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[hsl(var(--primary))] px-3 py-2.5 text-[12.5px] font-medium text-[hsl(var(--primary-foreground))]"
                  >
                    <Instagram className="h-4 w-4" /> Открыть Instagram
                  </a>
                  <button
                    onClick={async () => {
                      await base44.entities.Carousel.update(carousel.id, { status: "published" });
                      toast.success("Отмечено опубликованным");
                      load();
                    }}
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[12px] hover:bg-[hsl(var(--accent))]"
                  >
                    <Send className="h-3.5 w-3.5" /> Отметить опубликованным
                  </button>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    Пока выкладываем вручную: скачайте PNG по порядку, загрузите каруселью и вставьте подпись.
                  </p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
