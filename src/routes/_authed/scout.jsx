import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Radar, Plus, Pause, Play, Trash2, RefreshCw, Film, Check, Database } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import HitCard from "@/components/scout/HitCard";
import KeptAccounts from "@/components/scout/KeptAccounts";
import StartCarouselDialog from "@/components/StartCarouselDialog";
import { useSettings } from "@/hooks/use-settings";
import { scoutHandle, scoutPost } from "@/lib/scout";
import { runWatchBatch } from "@/lib/server-fns";
import { analyzeStyle, makePassport } from "@/lib/author";
import { saveFromHit } from "@/lib/scout-save";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authed/scout")({
  head: () => ({ meta: [{ title: "Разведчик — Цифровые сотрудники" }] }),
  component: ScoutPage,
});

function ScoutPage() {
  const { settings, reload: reloadSettings } = useSettings();
  const scoutFn = useServerFn(scoutHandle);
  const singleFn = useServerFn(scoutPost);
  const runWatchFn = useServerFn(runWatchBatch);
  const analyzeFn = useServerFn(analyzeStyle);
  const passportFn = useServerFn(makePassport);

  const [handle, setHandle] = useState("");
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const searchRequest = useRef(0);
  const searchStarted = useRef(0);

  useEffect(() => {
    if (!loading) return;
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - searchStarted.current) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [loading]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [pick, setPick] = useState(null);
  // Последний запрос: по нему можно принудительно обновить результат из базы.
  const [lastQuery, setLastQuery] = useState("");

  const [watch, setWatch] = useState([]);
  const [newWatch, setNewWatch] = useState("");
  const [pulling, setPulling] = useState(false);
  const [discovered, setDiscovered] = useState([]);

  const load = useCallback(async () => {
    const [w, d] = await Promise.all([
      base44.entities.WatchAuthor.list({ sort: "-updated_date", limit: 50 }),
      base44.entities.SourcePost.filter({ seen: false }, { sort: "-discovered_at", limit: 12 }),
    ]);
    setWatch(w.items || []);
    setDiscovered(d.items || []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (event, forced, force) => {
    event?.preventDefault?.();
    const value = String(forced ?? handle).trim();
    if (!value) return;
    if (forced) setHandle(value);
    setLastQuery(value);
    const requestId = ++searchRequest.current;
    searchStarted.current = Date.now();
    setElapsed(0);
    setLoading(true);
    setError("");
    setResult(null);
    try {
      if (/instagram\.com\/(?:[a-zA-Z0-9._]+\/)?(p|reel|tv)\//i.test(value)) {
        const post = await singleFn({ data: { url: value, force } });
        if (requestId !== searchRequest.current) return;
        setResult({ handle: "пост по ссылке", baseline: 0, total: 1, hits: [{ ...post, ratio: 0, badge: "hot" }], hitsReels: [] });
      } else {
        const res = await scoutFn({ data: { handle: value, limit: settings?.scout_limit || 40, force } });
        if (requestId !== searchRequest.current) return;
        setResult(res);
        if (!res.hits.length) toast.message("Ничего не выстрелило выше обычного уровня — попробуйте другой ник");
      }
    } catch (e) {
      if (requestId === searchRequest.current) setError(String(e.message || e).slice(0, 260));
    } finally {
      if (requestId === searchRequest.current) setLoading(false);
      // История пишется на сервере вместе с поиском — подтягиваем её сразу.
      reloadSettings().catch(() => null);
    }
  };

  const addWatch = async () => {
    const value = newWatch.trim().replace(/^@/, "");
    if (!value) return;
    await base44.entities.WatchAuthor.create({ handle: value, status: "active", with_reels: false, fail_count: 0 });
    setNewWatch("");
    load();
  };

  // Последние 10 оставленных аккаунтов — простая история разведки.
  const kept = [...watch]
    .sort((a, b) => String(b.created_date || "").localeCompare(String(a.created_date || "")))
    .slice(0, 10);
  // История разведки: сначала поиски, потом оставленные аккаунты, без повторов, 10 штук.
  const history = (() => {
    const watched = new Map(kept.map((w) => [String(w.handle).toLowerCase(), w]));
    const seen = new Set();
    const out = [];
    for (const name of [...(settings?.scout_history || []), ...kept.map((w) => w.handle)]) {
      const raw = String(name || "").trim().replace(/^@/, "");
      if (!raw) continue;
      // Ссылку на пост не приводим к нижнему регистру: код поста чувствителен к регистру.
      const value = /^https?:/i.test(raw) ? raw.split("?")[0] : raw.toLowerCase();
      if (seen.has(value.toLowerCase())) continue;
      seen.add(value.toLowerCase());
      out.push({ handle: value, last_note: watched.get(value.toLowerCase())?.last_note });
    }
    return out.slice(0, 10);
  })();
  const resultHandle = result && !result.handle.startsWith("пост") ? result.handle : "";
  const resultKept = kept.some((w) => w.handle.toLowerCase() === resultHandle.toLowerCase());

  const keep = async (name) => {
    const value = String(name || "").trim().replace(/^@/, "");
    if (!value) return;
    await base44.entities.WatchAuthor.create({ handle: value, status: "active", with_reels: false, fail_count: 0 });
    toast.success(`@${value} в истории разведки`);
    await load();
  };

  const pullAll = async () => {
    setPulling(true);
    const seen = new Set();
    let guard = 0, runId = "", waiting = false;
    try {
      while (guard < 500) {
        guard += 1;
        const res = await runWatchFn({ data: runId ? { runId } : { start: true } });
        runId = res.runId || runId;
        if (res.waiting) { waiting = true; break; }
        const first = res?.checked?.[0];
        if (!first) break;
        if (seen.has(first.handle)) break;
        seen.add(first.handle);
        if (!res.remaining) break;
      }
      toast.success(waiting ? "Проход уже выполняется. Сохранённый прогресс не потеряется." : seen.size ? `Проверено авторов: ${seen.size}` : "В разведке нет активных авторов");
      await load();
    } catch (e) {
      toast.error(String(e.message || e).slice(0, 200));
    } finally {
      setPulling(false);
    }
  };

  const openPick = (hit, mode) => setPick({ hit, mode });

  // Отметили галочки на находке — разбираем кадры и кладём в библиотеки.
  const saveHit = async (hit, wants) => {
    const res = await saveFromHit({
      hit,
      analyze: analyzeFn,
      passport: passportFn,
      wantStyle: wants.style,
      wantHero: wants.hero,
    });
    const done = [];
    if (res.style) done.push("стиль");
    if (res.hero) done.push(`герой «${res.hero.name}»`);
    toast.success(`Сохранено в библиотеку: ${done.join(" и ")}`);
  };

  const seenSource = (row) => ({
    url: row.post_url,
    handle: row.handle,
    shortcode: row.shortcode,
    images: row.slide_images || [],
    caption: row.caption_text,
    thumb: row.thumb_url,
    likes: row.likes,
    comments: row.comments,
    baseline: row.baseline,
    ratio: row.ratio,
    badge: row.badge,
  });

  return (
    <div className="fade-in">
      <PageHeader
        eyebrow="разведчик"
        title="Найти чужой хит"
        description="Пришлите ник конкурента или ссылку на пост. Разведчик посмотрит последние посты и покажет карусели, которые выстрелили сильнее обычного уровня автора."
      />

      <div className="space-y-6 px-5 py-6 md:px-8">
        <form onSubmit={run} className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Radar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="@ник конкурента или ссылка на пост"
              className="h-10 w-full rounded-lg border border-border bg-[hsl(var(--input))]/40 pl-9 pr-3 text-[13px] outline-none transition-colors placeholder:text-muted-foreground focus:border-[hsl(var(--primary))]/50"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[hsl(var(--primary))] px-4 text-[13px] font-medium text-[hsl(var(--primary-foreground))] transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radar className="h-4 w-4" />}
            {loading ? "Смотрю посты…" : "Разведка"}
          </button>
        </form>
        {loading && (
          <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 px-3 py-2 text-[12px] text-muted-foreground">
            <span>Запрашиваю посты и выбираю карусели · {elapsed} с</span>
            <button type="button" onClick={() => {
              searchRequest.current += 1;
              setLoading(false);
              toast.message("Ожидание остановлено. Поиск завершится в фоне и сохранится в базе.");
            }} className="underline underline-offset-2">Остановить ожидание</button>
          </div>
        )}

        {error && <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-[12.5px] text-destructive-foreground">{error}</div>}

        <KeptAccounts items={history} active={resultHandle || handle} onRun={(h) => run(null, h)} />

        {result && (
          <section className="space-y-3">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="text-[14px] font-medium">@{result.handle}</h2>
              <p className="text-[12px] text-muted-foreground">
                посмотрели {result.total} постов · обычный уровень {result.baseline} лайков
              </p>
              {result.cached && (
                <span className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-[hsl(var(--muted))]/50 px-2 py-0.5 text-[10.5px] text-muted-foreground">
                  <Database className="h-3 w-3" /> из базы
                </span>
              )}
              {lastQuery && (
                <button
                  onClick={() => run(null, lastQuery, true)}
                  disabled={loading}
                  className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[10.5px] text-muted-foreground transition-colors hover:bg-[hsl(var(--accent))] hover:text-foreground disabled:opacity-50"
                >
                  <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} /> обновить
                </button>
              )}
              {resultHandle &&
                (resultKept ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-border/70 px-2 py-0.5 text-[10.5px] text-muted-foreground">
                    <Check className="h-3 w-3" /> в истории
                  </span>
                ) : (
                  <button
                    onClick={() => keep(resultHandle)}
                    className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[10.5px] transition-colors hover:bg-[hsl(var(--accent))]"
                  >
                    <Plus className="h-3 w-3" /> оставить в истории
                  </button>
                ))}
            </div>
            {result.hits.length === 0 ? (
              <EmptyState icon={Radar} title="Хитов не нашлось" description="Либо аккаунт маленький, либо посты ровные. Попробуйте ник покрупнее." />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {result.hits.map((hit) => (
                  <HitCard key={hit.shortcode || hit.url} hit={hit} onPick={openPick} onSave={saveHit} />
                ))}
              </div>
            )}
            {result.hitsReels?.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {result.hitsReels.map((hit) => (
                  <HitCard key={hit.shortcode} hit={hit} onPick={openPick} onSave={saveHit} />
                ))}
              </div>
            )}
          </section>
        )}

        {discovered.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-[14px] font-medium">Нашлось само</h2>
              <span className="text-[11.5px] text-muted-foreground">из недельной разведки</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {discovered.map((row) => (
                <HitCard
                  key={row.id}
                  hit={{
                    thumb: row.thumb_url,
                    handle: row.handle,
                    images: row.slide_images || [],
                    likes: row.likes,
                    comments: row.comments,
                    caption: row.caption_text,
                    url: row.post_url,
                    ratio: row.ratio,
                    badge: row.badge,
                  }}
                  onPick={(_hit, mode) => setPick({ hit: seenSource(row), mode })}
                  onSave={saveHit}
                />
              ))}
            </div>
          </section>
        )}

        <section className="rounded-xl border border-border/70 bg-[hsl(var(--card))]">
          <header className="flex flex-wrap items-center gap-3 border-b border-border/70 px-4 py-3">
            <div className="flex-1">
              <h2 className="text-[13px] font-medium">Разведка по расписанию</h2>
              <p className="text-[11.5px] text-muted-foreground">Раз в неделю Разведчик сам проверяет авторов и приносит до 3 хитов с каждого.</p>
            </div>
            <button
              onClick={pullAll}
              disabled={pulling || watch.filter((w) => w.status === "active").length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11.5px] transition-colors hover:bg-[hsl(var(--accent))] disabled:opacity-50"
            >
              {pulling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Проверить всех сейчас
            </button>
          </header>

          <div className="flex gap-2 border-b border-border/60 px-4 py-3">
            <input
              value={newWatch}
              onChange={(e) => setNewWatch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addWatch()}
              placeholder="@ник в разведку"
              className="h-8 flex-1 rounded-md border border-border bg-[hsl(var(--input))]/40 px-2.5 text-[12px] outline-none placeholder:text-muted-foreground focus:border-[hsl(var(--primary))]/50"
            />
            <button onClick={addWatch} className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2.5 text-[11.5px] hover:bg-[hsl(var(--accent))]">
              <Plus className="h-3.5 w-3.5" /> добавить
            </button>
          </div>

          {watch.length === 0 ? (
            <p className="px-4 py-8 text-center text-[12.5px] text-muted-foreground">Список пуст — добавьте первых авторов.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {watch.map((w) => (
                <li key={w.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                  <span className={cn("h-1.5 w-1.5 rounded-full", w.status === "active" ? "bg-emerald-400" : "bg-amber-400")} />
                  <span className="text-[12.5px] font-medium">@{w.handle}</span>
                  <span className="text-[11px] text-muted-foreground">{w.last_note || "ещё не проверялся"}</span>
                  <div className="ml-auto flex items-center gap-1">
                    <button
                      onClick={() => base44.entities.WatchAuthor.update(w.id, { with_reels: !w.with_reels }).then(load)}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10.5px] transition-colors",
                        w.with_reels ? "border-border text-foreground" : "border-border/60 text-muted-foreground",
                      )}
                      title="Ловить ещё и рилсы"
                    >
                      <Film className="h-3 w-3" /> рилсы
                    </button>
                    <button
                      onClick={() => base44.entities.WatchAuthor.update(w.id, { status: w.status === "active" ? "paused" : "active", fail_count: 0 }).then(load)}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-[hsl(var(--accent))] hover:text-foreground"
                      title={w.status === "active" ? "Пауза" : "Вернуть"}
                    >
                      {w.status === "active" ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                    </button>
                    <button
                      onClick={() => base44.entities.WatchAuthor.delete(w.id).then(load)}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/15 hover:text-destructive-foreground"
                      title="Убрать"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <StartCarouselDialog
        open={Boolean(pick)}
        onOpenChange={(v) => !v && setPick(null)}
        source={pick?.hit}
        initialMode={pick?.mode}
      />
    </div>
  );
}
