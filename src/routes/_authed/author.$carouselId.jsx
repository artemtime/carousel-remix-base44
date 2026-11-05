import { prepareFinal } from "@/lib/final-artifacts";
import { downloadArtifact } from "@/lib/download-artifact";
import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Loader2, Wand2, BookmarkPlus, Palette, Copy, Download, MessageSquareText } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import FinalReview from "@/components/author/FinalReview";
import SlideRail from "@/components/author/SlideRail";
import SlideEditor from "@/components/author/SlideEditor";
import SaveStyleDialog from "@/components/author/SaveStyleDialog";
import RestyleDialog from "@/components/author/RestyleDialog";
import HeroPicker from "@/components/heroes/HeroPicker";
import ImageModelPicker from "@/components/ImageModelPicker";
import { imageModelLabel } from "@/lib/image-models";
import LanguageSwitch from "@/components/author/LanguageSwitch";
import { isExactMode } from "@/lib/modes";
import { withSourceLettering } from "@/lib/reference-lettering";
import { checkSlides } from "@/lib/reference-check";
import { revisePlan, rereadReference } from "@/lib/author";
import { heroPassport } from "@/lib/heroes";
import { renderSlide, downloadCanvas, normalizeProfile, profileForRole } from "@/lib/slide-renderer";
import { fetchImageData } from "@/lib/server-fns";
import { cn } from "@/lib/utils";
import { cropPanelForModel } from "@/lib/panel-crop";
import { carouselReadiness, stalePatch, panelReady } from "@/lib/readiness";
import { slideOptions } from "@/lib/slide-options";
import { startRender, stopRender, editSlide, changeCarouselHero, changeImageModel } from "@/lib/render-queue";

export const Route = createFileRoute("/_authed/author/$carouselId")({
  head: () => ({ meta: [{ title: "Студия — Цифровые сотрудники" }] }),
  component: StudioPage,
});

const STATUS = { review: "нужна проверка", paused: "пауза", queued: "в очереди Buffer", scheduled: "запланировано", plan: "план", rendering: "рисуется", ready: "готово", published: "опубликовано" };

function StudioPage() {
  const { carouselId } = Route.useParams();
  const startFn = useServerFn(startRender);
  const stopFn = useServerFn(stopRender);
  const editFn = useServerFn(editSlide);
  const heroFn = useServerFn(changeCarouselHero);
  const imageModelFn = useServerFn(changeImageModel);
  const reviseFn = useServerFn(revisePlan);
  const rereadFn = useServerFn(rereadReference);
  const proxy = useServerFn(fetchImageData);
  const prepareFn = useServerFn(prepareFinal);

  const [carousel, setCarousel] = useState(null);
  const [style, setStyle] = useState(null);
  const [hero, setHero] = useState(null);
  const [slides, setSlides] = useState([]);
  const [activeId, setActiveId] = useState("");
  const [progress, setProgress] = useState(null);
  const [taskError, setTaskError] = useState("");
  const drawingId = progress ? "background" : "";
  const drawStep = progress ? `Фоновая очередь: ${progress.done}/${progress.total} кадров` : "";
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState("");
  const [dialog, setDialog] = useState("");
  const saveTimers = useRef(new Map());

  const load = useCallback(async () => {
    let c = await base44.entities.Carousel.get(carouselId);
    const page = await base44.entities.Slide.filter({ carousel_id: carouselId }, { sort: "position", limit: 40 });
    setCarousel(c);
    const jobs = await base44.entities.TaskQueue.filter({ carousel_id: carouselId }, { sort: "-created_date", limit: 10 });
    setTaskError((jobs.items || [])[0]?.error ? `${(jobs.items || [])[0].error} Готовые кадры сохранены; повторный запуск дорисует недостающие.` : "");
    const running = (jobs.items || []).find((job) => ["queued", "running"].includes(job.status));
    if (!running && c.status === "rendering") { c = await base44.entities.Carousel.get(carouselId); setCarousel(c); }
    setProgress(running ? { taskId: running.id, done: running.completed || 0, total: running.total || 0, stopping: running.stop_requested } : null);
    // Проверка уже сохранённых слайдов: единый шрифт и разведённые подписи. Изменения сохраняем один раз.
    const checked = checkSlides((page.items || []).map((slide) => {
      const original = c.reference_profile?.cards?.[(slide.reference_index || slide.position) - 1];
      if (slide.reference_card?.visual_mode === "text" || !isExactMode(c.mode) || !original || slide.reference_card?.lettering_version === 1) return slide;
      return { ...slide, reference_card: withSourceLettering(slide.reference_card, original) };
    }));
    setSlides(checked.slides);
    if (checked.changed.length) {
      base44.entities.Slide.bulkUpdate(checked.changed.map((slide) => ({ id: slide.id, reference_card: slide.reference_card, text: slide.text }))).catch(() => null);
    }
    setActiveId((prev) => prev || page.items?.[0]?.id || "");
    if (c.style_id) {
      const s = await base44.entities.MyStyle.get(c.style_id).catch(() => null);
      setStyle(s ? { ...s, caption: normalizeProfile(s.caption) } : null);
    }
    setHero(c.hero_id ? await base44.entities.Hero.get(c.hero_id).catch(() => null) : null);
  }, [carouselId]);

  useEffect(() => {
    load().catch((error) => toast.error(String(error.message || error).slice(0, 180)));
  }, [load]);

  useEffect(() => {
    if (!progress?.taskId && !carousel?.needs_finalization) return;
    const timer = setInterval(() => load().catch(() => null), 5000);
    return () => clearInterval(timer);
  }, [load, progress?.taskId, carousel?.needs_finalization]);

  const active = slides.find((s) => s.id === activeId) || slides[0];
  // «Зеркало» повторяет оригинал буквально: чужой герой и его стиль остаются как есть.
  const mirror = carousel?.mode === "mirror";
  // Герой из библиотеки меняет только персонажа: палитра, рисование и шрифт остаются стиля.
  const heroChoice = !mirror && hero ? { hero: heroPassport(hero), hero_sheet_url: hero.sheet_url || "" } : null;
  const renderStyle = style ? (mirror ? { ...style, hero: null, hero_sheet_url: "" } : heroChoice ? { ...style, ...heroChoice } : style) : null;
  // В точных режимах подпись кладётся по типографике оригинала, в остальных — по роли слайда.
  const overlayFor = (role) => {
    if (isExactMode(carousel?.mode)) return normalizeProfile(carousel?.reference_profile?.caption || style?.caption);
    return profileForRole(style, role || "body");
  };

  const updateSlide = (id, patch) => {
    const before = slides.find((slide) => slide.id === id);
    const stale = stalePatch(before, { ...before, ...patch });
    setSlides((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch, ...stale } : s)));
    setCarousel(c=>({...c,approved_key:"",final_ready:false,status:stale.image_stale?"plan":"review"}));
    const previous = saveTimers.current.get(id);
    clearTimeout(previous?.timer);
    const pending = { ...previous?.patch, ...patch };
    const timer = setTimeout(async () => {
      try { await editFn({ data: { slideId: id, patch: pending } }); }
      catch (error) { toast.error(String(error.message || error).slice(0, 180)); }
      finally { saveTimers.current.delete(id); }
    }, 600);
    saveTimers.current.set(id, { timer, patch: pending });
  };

  const changeHero = async (id, next) => {
    try { await heroFn({ data: { carouselId, heroId: id || "" } }); setHero(next || null); await load(); }
    catch (error) { toast.error(String(error.message || error).slice(0, 180)); }
  };
  const changeModel = async (imageModel) => {
    setBusy("model");
    try {
      await imageModelFn({ data: { carouselId, imageModel } });
      await load();
      toast.success("Модель сохранена для следующих рисунков");
    } catch (error) { toast.error(String(error.message || error).slice(0, 220)); }
    finally { setBusy(""); }
  };
  const flushEdits = async () => {
    for (const [id,pending] of saveTimers.current) {
      clearTimeout(pending.timer);
      if (id === "caption") await base44.entities.Carousel.update(carouselId,{caption:pending.caption ?? carousel.caption,approved_key:"",status:"review"});
      else if (pending.patch) await editFn({data:{slideId:id,patch:pending.patch}});
    }
    saveTimers.current.clear();
  };
  const queue = async (slideId) => {
    setBusy("queue");
    setTaskError("");
    try {
      await flushEdits();
      // Prepare masked panel references once; the durable worker reuses their stored URLs.
      for (const slide of slides.filter((row) => !slideId || row.id === slideId)) {
        if (slide.reference_card?.schema_version !== 2 || slide.reference_card.visual_mode === "own" || !slide.reference_url) continue;
        const crops = [...(slide.reference_card.panel_crops || [])];
        for (let index = 0; index < slide.reference_card.panels.length; index += 1) {
          if (crops[index] || (!slideId && panelReady(slide, index))) continue;
          crops[index] = await cropPanelForModel({ url: slide.reference_url, bounds: slide.reference_card.panels[index].bounds,
            panelIndex: index, textBlocks: slide.reference_card.text_blocks || [], proxy: (url) => proxy({ data: { url } }) });
        }
        if (crops.some(Boolean)) await editFn({ data: { slideId: slide.id, patch: { reference_card: { ...slide.reference_card, panel_crops: crops } } } });
      }
      const job = await startFn({ data: { carouselId, ...(slideId ? { slideId } : {}) } });
      await load();
      toast.success(job.total === 0 ? "Все иллюстрации уже проверены. Проверьте готовые карточки ниже." : "Очередь запущена. Можно закрыть вкладку — кадры сохранятся.");
    } catch (error) { toast.error(String(error.message || error).slice(0, 220)); }
    finally { setBusy(""); }
  };
  const drawCurrent = () => active && queue(active.id);
  const drawAll = () => queue();

  const revise = async () => {
    if (!instruction.trim()) return;
    setBusy("revise");
    try {
      const plan = {
        title: carousel.title,
        caption: carousel.caption,
        slides: slides.map((s) => ({ role: s.role, scene: s.scene, text: s.text, layout: s.layout, reference_card: s.reference_card })), 
      };
      const next = await reviseFn({ data: { plan, instruction, rules: style?.rules || [], language: carousel.language || "ru" } });
      await base44.entities.Carousel.update(carouselId, { title: next.title || carousel.title, caption: next.caption || carousel.caption });
      const incoming = next.slides || [];
      const updates = [];
      const creates = [];
      for (let i = 0; i < incoming.length; i += 1) {
        const existing = slides[i];
        const data = {
          position: i + 1,
          role: ["hook", "body", "cta"].includes(incoming[i].role) ? incoming[i].role : "body",
          scene: incoming[i].scene || "",
          text: incoming[i].text || "",
          layout: Number(incoming[i].layout) === 2 ? 2 : 1,
          ...(incoming[i].reference_card ? { reference_card: incoming[i].reference_card } : {}),
        };
        if (existing) {
          const changedScene = existing.scene !== data.scene;
          updates.push({ id: existing.id, ...data, ...(changedScene ? stalePatch(existing, { ...existing, ...data }) : {}) });
        } else {
          creates.push({ carousel_id: carouselId, ...data, status: "planned", critic_status: "pending" });
        }
      }
      if (updates.length) await base44.entities.Slide.bulkUpdate(updates);
      if (creates.length) await base44.entities.Slide.bulkCreate(creates);
      if (slides.length > incoming.length) {
        for (const extra of slides.slice(incoming.length)) await base44.entities.Slide.delete(extra.id);
      }
      await base44.entities.Carousel.update(carouselId, { slides_count: incoming.length, status: "plan" });
      setInstruction("");
      await load();
      toast.success("План обновлён");
    } catch (e) {
      toast.error(String(e.message || e).slice(0, 220));
    } finally {
      setBusy("");
    }
  };

  const copyCaption = async () => {
    await navigator.clipboard.writeText(carousel?.caption || "");
    toast.success("Подпись скопирована");
  };

  const downloadAll = async () => {
    setBusy("download");
    try {
      await flushEdits();
      const snapshot=await prepareFn({data:{carouselId}});
      if(snapshot.approved) {
        for(const slide of snapshot.slides)await downloadArtifact(slide.final_image_url,`${slide.position}.png`,url=>proxy({data:{url}}));
        return;
      }
      if(snapshot.slides.some(s=>s.reference_card?.visual_mode !== "text" && (s.image_stale || !s.image_url || s.reference_card?.panels?.length===2 && !s.image_url_2)))throw new Error("Сначала завершите рисование всех кадров");
      toast.info("Скачивается черновик. Для публикации проверьте и утвердите готовые карточки.");
      for (const slide of snapshot.slides) {
        const canvas = document.createElement("canvas");
        await renderSlide(canvas, slideOptions(slide, { profile: overlayFor(slide.role), aspect: style?.aspect,
          proxy: (url) => proxy({ data: { url } }), strict: true }));
        await downloadCanvas(canvas, `${slide.position}.png`);
      }
    } catch (e) {
      toast.error(String(e.message || e).slice(0, 200));
    } finally {
      setBusy("");
    }
  };

  if (!carousel) return <p className="px-6 py-10 text-[12.5px] text-muted-foreground">Загружаю студию…</p>;

  return (
    <div className="fade-in">
      <div className="flex flex-wrap items-center gap-3 border-b border-border/70 px-5 py-4 md:px-8">
        <Link to="/author" className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> карусели
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[16px] font-semibold tracking-tight">{carousel.title}</h1>
          <p className="truncate text-[11.5px] text-muted-foreground">
            {carousel.style_name} · {carousel.status === "ready" && !carousel.approved_key ? "нужна финальная проверка" : STATUS[carousel.status] || carousel.status}
            {carousel.source_handle ? ` · из @${carousel.source_handle}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isExactMode(carousel.mode) && carousel.reference_images?.length > 0 && (
            <button disabled={Boolean(busy) || Boolean(drawingId) || Boolean(progress)} onClick={async () => {
              setBusy("reread");
              try { await rereadFn({ data: { carouselId } }); await load(); toast.success("Оригинал перечитан: текст и кадры восстановлены"); }
              catch (error) { toast.error(String(error.message || error).slice(0, 220)); }
              finally { setBusy(""); }
            }} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[12px] hover:bg-accent disabled:opacity-50">
              {busy === "reread" && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Перечитать оригинал
            </button>
          )}
          {isExactMode(carousel.mode) && (
            <button
              onClick={() => setDialog("style")}
              disabled={Boolean(busy) || Boolean(drawingId) || Boolean(progress)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[12px] hover:bg-[hsl(var(--accent))] disabled:opacity-50"
            >
              <BookmarkPlus className="h-3.5 w-3.5" /> В стиль
            </button>
          )}
          <LanguageSwitch
            carouselId={carouselId}
            value={carousel.language || (mirror ? "orig" : "ru")}
            allowOriginal={mirror}
            disabled={Boolean(busy) || Boolean(drawingId) || Boolean(progress) || !carousel.style_id}
            onDone={load}
          />
          <button
            onClick={() => setDialog("restyle")}
            disabled={Boolean(busy) || Boolean(drawingId) || Boolean(progress)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[12px] hover:bg-[hsl(var(--accent))] disabled:opacity-50"
          >
            <Palette className="h-3.5 w-3.5" /> Стиль
          </button>
          {carousel.content_format !== "text" && (progress ? (
            <button onClick={async () => { await stopFn({ data: { taskId: progress.taskId } }); await load(); }} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[12px] hover:bg-[hsl(var(--accent))]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> {progress.done}/{progress.total} · {progress.stopping ? "останавливаю…" : "пауза"}
            </button>
          ) : (
            <button
              onClick={drawAll}
              disabled={Boolean(busy) || Boolean(drawingId)}
              className="inline-flex items-center gap-2 rounded-lg bg-[hsl(var(--primary))] px-3.5 py-2 text-[12.5px] font-medium text-[hsl(var(--primary-foreground))]"
            >
              <Wand2 className="h-4 w-4" /> {busy === "queue" ? "Готовлю кадры для очереди…" : "Нарисовать все"}
            </button>
          ))}
          <button
            onClick={downloadAll}
            disabled={busy === "download"}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[12px] hover:bg-[hsl(var(--accent))] disabled:opacity-50"
          >
            {busy === "download" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} {carousel.approved_key ? "PNG" : "PNG черновик"}
          </button>

        </div>
      </div>

      <FinalReview carousel={carousel} slides={slides} style={style} hero={hero}
        proxy={(url)=>proxy({data:{url}})} onReviewed={load} disabled={Boolean(progress)}
        onBusy={(value)=>setBusy(value?"final":"")}
        onFlush={flushEdits} />
      {taskError && <p role="alert" className="mx-5 mt-4 rounded-lg border border-amber-500/40 p-3 text-[12px] text-amber-300">{taskError}</p>}
      <div className="grid gap-5 px-5 py-5 md:px-8 lg:grid-cols-[150px_minmax(0,1fr)]">
        <SlideRail
          slides={slides}
          activeId={active?.id}
          onSelect={setActiveId}
          profileOf={(slide) => overlayFor(slide?.role)}
          aspect={style?.aspect}
        />

        <div className="space-y-5">
          {carousel.content_format !== "text" && <div className="rounded-xl border border-border/70 bg-[hsl(var(--card))] p-4">
            {carousel.content_format !== "text" && <ImageModelPicker value={carousel.image_model || "automatic"} onChange={changeModel} disabled={Boolean(busy) || Boolean(progress) || carousel.status === "rendering"} />}
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">Выбор применяется к следующим рисункам и их исправлениям. Для замены готовой карточки нажмите «перерисовать». Во время рисования смена модели недоступна.</p>
            {Object.entries(active?.image_generations || {}).map(([panel, generation]) => <p key={panel} className="mt-1 text-[11px] text-muted-foreground">Рисунок {Number(panel) + 1}: {generation.model ? imageModelLabel(generation.model) : "автоматический выбор; модель не сообщена платформой"}</p>)}
          </div>}
          <div className="rounded-xl border border-border/70 bg-[hsl(var(--card))] p-4">
            <SlideEditor
              slide={active}
              style={renderStyle ? { ...renderStyle, caption: overlayFor(active?.role) } : renderStyle}
              drawing={Boolean(busy) || Boolean(drawingId) || Boolean(progress)}
              drawingNote={drawStep}
              onChange={(patch) => active && updateSlide(active.id, patch)}
              onDraw={drawCurrent}
              heroSlot={carousel.content_format === "text" ? null :
                <div className="rounded-lg border border-border/70 bg-[hsl(var(--muted))]/40 p-2.5">
                  <p className="mb-1.5 text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground">герой карусели</p>
                  <div className={mirror ? "pointer-events-none opacity-40" : ""}>
                    <HeroPicker value={carousel.hero_id} defaultName={style?.hero?.name} onChange={changeHero} />
                  </div>
                  {mirror ? <p className="mt-1.5 text-[10.5px] leading-snug text-muted-foreground">В зеркале персонаж из оригинала — своего героя выбрать нельзя.</p> : <p className="mt-1.5 text-[10.5px] leading-snug text-muted-foreground">Герой меняет только персонажа. Рисовка, цвета и шрифт меняются через «Стиль» → «Адаптация».</p>}
                </div>
              }
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-border/70 bg-[hsl(var(--card))] p-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">подпись к посту</p>
                <button onClick={copyCaption} className="inline-flex items-center gap-1 text-[11.5px] text-muted-foreground hover:text-foreground">
                  <Copy className="h-3 w-3" /> копировать
                </button>
              </div>
              <textarea
                value={carousel.caption || ""}
                onChange={(e) => {
                  setCarousel((c) => ({ ...c, caption: e.target.value }));
                  const caption = e.target.value;
                  clearTimeout(saveTimers.current.get("caption")?.timer);
                  const timer = setTimeout(() => base44.entities.Carousel.update(carouselId, { caption, approved_key: "", status: "review" }).finally(()=>saveTimers.current.delete("caption")).catch((error) => toast.error(String(error.message || error).slice(0, 180))), 700);
                  saveTimers.current.set("caption", { timer, caption });
                }}
                rows={10}
                className="w-full resize-none rounded-lg border border-border bg-[hsl(var(--input))]/40 px-3 py-2 text-[12.5px] leading-relaxed outline-none focus:border-[hsl(var(--primary))]/50"
              />
            </div>

            <div className="rounded-xl border border-border/70 bg-[hsl(var(--card))] p-4">
              <p className="mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                <MessageSquareText className="h-3.5 w-3.5" /> поправить план словами
              </p>
              <textarea
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                rows={3}
                placeholder="например: третий слайд слишком длинный, сделай короче и добавь пример из жизни"
                className="w-full resize-none rounded-lg border border-border bg-[hsl(var(--input))]/40 px-3 py-2 text-[12.5px] leading-relaxed outline-none focus:border-[hsl(var(--primary))]/50"
              />
              <button
                onClick={revise}
                disabled={busy === "revise" || !instruction.trim()}
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[12px] hover:bg-[hsl(var(--accent))] disabled:opacity-50"
              >
                {busy === "revise" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                Переписать план
              </button>
              <div className="mt-4 space-y-1.5">
                {slides.map((s) => (
                  <div key={s.id} className={cn("rounded-md px-2 py-1.5", active?.id === s.id ? "bg-[hsl(var(--accent))]" : "bg-[hsl(var(--muted))]/50")}>
                    <p className="text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground">
                      {s.position} · {s.role}
                    </p>
                    <button onClick={() => setActiveId(s.id)} className="line-clamp-2 text-left text-[11.5px] leading-snug">
                      {s.text}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <SaveStyleDialog open={dialog === "style"} onOpenChange={(v) => setDialog(v ? "style" : "")} carousel={carousel} />
      <RestyleDialog open={dialog === "restyle"} onOpenChange={(v) => setDialog(v ? "restyle" : "")} carousel={carousel} onDone={load} />
    </div>
  );
}
