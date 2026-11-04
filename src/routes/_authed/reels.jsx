import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Film, Loader2, Link2, Upload, Download, Wand2, Clapperboard, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import StartCarouselDialog from "@/components/StartCarouselDialog";
import { useSettings } from "@/hooks/use-settings";
import { readReel, makeScenario, scoutHandle } from "@/lib/scout";

export const Route = createFileRoute("/_authed/reels")({
  head: () => ({ meta: [{ title: "Рилсы — Цифровые сотрудники" }] }),
  component: ReelsPage,
});

function ReelsPage() {
  const { settings } = useSettings();
  const readFn = useServerFn(readReel);
  const scenarioFn = useServerFn(makeScenario);
  const scoutFn = useServerFn(scoutHandle);
  const fileRef = useRef(null);

  const [link, setLink] = useState("");
  const [busy, setBusy] = useState("");
  const [reel, setReel] = useState(null);
  const [scenario, setScenario] = useState(null);
  const [pick, setPick] = useState(null);
  const [hits, setHits] = useState(null);
  const [history, setHistory] = useState([]);

  const loadHistory = useCallback(async () => {
    const page = await base44.entities.ReelTranscript.list({ sort: "-created_date", limit: 8 });
    setHistory(page.items || []);
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const save = async (data) => {
    await base44.entities.ReelTranscript.create({
      source_url: data.source_url || link || "своё видео",
      handle: data.handle || "",
      title: (data.summary || "").slice(0, 80),
      kind: "transcript",
      transcript: data.transcript,
      lines: data.lines || [],
      summary: data.summary,
      hook: data.hook,
      why_viral: data.why_viral,
    });
    loadHistory();
  };

  const read = async (url) => {
    setBusy("read");
    setReel(null);
    setScenario(null);
    try {
      const data = await readFn({ data: { url } });
      setReel(data);
      await save(data);
    } catch (e) {
      toast.error(String(e.message || e).slice(0, 220));
    } finally {
      setBusy("");
    }
  };

  const uploadVideo = async (file) => {
    if (!file) return;
    setBusy("upload");
    try {
      const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file });
      const { signed_url } = await base44.integrations.Core.CreateFileSignedUrl({ file_uri, expires_in: 900 });
      const data = await readFn({ data: { audio_url: signed_url } });
      setReel({ ...data, source_url: "своё видео" });
      await save({ ...data, source_url: "своё видео" });
    } catch (e) {
      toast.error(String(e.message || e).slice(0, 220));
    } finally {
      setBusy("");
    }
  };

  const buildScenario = async () => {
    if (!reel) return;
    setBusy("scenario");
    try {
      const data = await scenarioFn({
        data: { transcript: reel.transcript, topic: settings?.blog_topic || "", codeword: settings?.codeword || "" },
      });
      setScenario(data);
    } catch (e) {
      toast.error(String(e.message || e).slice(0, 220));
    } finally {
      setBusy("");
    }
  };

  const downloadTranscript = () => {
    if (!reel) return;
    const text = [reel.summary, reel.hook && `Хук: ${reel.hook}`, reel.why_viral && `Почему залетел: ${reel.why_viral}`, "", ...(reel.lines || []).map((l) => l.text), "", reel.transcript]
      .filter(Boolean)
      .join("\n");
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "расшифровка.txt";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  };

  const findHits = async () => {
    if (!link.trim()) return;
    setBusy("hits");
    try {
      const res = await scoutFn({ data: { handle: link, limit: settings?.scout_limit || 40, kind: "reel" } });
      setHits(res);
      if (!res.hitsReels.length) toast.message("Рилсы не выстрелили выше обычного уровня");
    } catch (e) {
      toast.error(String(e.message || e).slice(0, 220));
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="fade-in">
      <PageHeader
        eyebrow="рилсы"
        title="Разобрать рилс"
        description="Расшифровка речи, разбор хука и сценарий под вашу тему. Или карусель из того же рассказа."
      />

      <div className="space-y-6 px-5 py-6 md:px-8">
        <div className="rounded-xl border border-border/70 bg-[hsl(var(--card))] p-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="ссылка на рилс или @ник автора"
                className="h-10 w-full rounded-lg border border-border bg-[hsl(var(--input))]/40 pl-9 pr-3 text-[13px] outline-none placeholder:text-muted-foreground focus:border-[hsl(var(--primary))]/50"
              />
            </div>
            <button
              onClick={() => read(link.trim())}
              disabled={busy !== "" || !link.trim()}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[hsl(var(--primary))] px-4 text-[13px] font-medium text-[hsl(var(--primary-foreground))] transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy === "read" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clapperboard className="h-4 w-4" />}
              Расшифровать
            </button>
            <button
              onClick={findHits}
              disabled={busy !== "" || !link.trim()}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border px-4 text-[13px] transition-colors hover:bg-[hsl(var(--accent))] disabled:opacity-50"
            >
              <Film className="h-4 w-4" /> Хиты-рилсы
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3 text-[12px] text-muted-foreground">
            <button
              onClick={() => fileRef.current?.click()}
              disabled={busy !== ""}
              className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-border px-2.5 py-1.5 transition-colors hover:bg-[hsl(var(--accent))] disabled:opacity-50"
            >
              {busy === "upload" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              своё видео файлом
            </button>
            <input ref={fileRef} type="file" accept="video/*" className="hidden" onChange={(e) => uploadVideo(e.target.files?.[0])} />
            <span>или ссылка Google Диск / Dropbox</span>
          </div>
        </div>

        {hits && (
          <section className="space-y-3">
            <h2 className="text-[14px] font-medium">Хиты-рилсы @{hits.handle}</h2>
            {hits.hitsReels.length === 0 ? (
              <EmptyState icon={Film} title="Рилсы не выстрелили" description="Обычный уровень автора слишком ровный. Попробуйте другой ник." />
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {hits.hitsReels.map((h) => (
                  <div key={h.shortcode} className="flex items-center gap-3 rounded-lg border border-border/70 bg-[hsl(var(--card))] p-3">
                    {h.thumb && <img src={h.thumb} alt="" className="h-12 w-9 rounded object-cover" />}
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium">×{h.ratio} к обычному</p>
                      <p className="truncate text-[11px] text-muted-foreground">{h.likes} лайков</p>
                    </div>
                    <button
                      onClick={() => {
                        setLink(h.url);
                        read(h.url);
                      }}
                      className="shrink-0 rounded-md border border-border px-2 py-1 text-[11px] hover:bg-[hsl(var(--accent))]"
                    >
                      разобрать
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {reel && (
          <section className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
            <div className="rounded-xl border border-border/70 bg-[hsl(var(--card))]">
              <header className="flex items-center justify-between border-b border-border/70 px-4 py-3">
                <h2 className="text-[13px] font-medium">Расшифровка</h2>
                <button onClick={downloadTranscript} className="inline-flex items-center gap-1 text-[11.5px] text-muted-foreground hover:text-foreground">
                  <Download className="h-3.5 w-3.5" /> файлом
                </button>
              </header>
              <ul className="max-h-[420px] divide-y divide-border/50 overflow-y-auto">
                {(reel.lines || []).map((l, i) => (
                  <li key={i} className="flex gap-3 px-4 py-2">
                    <span className="w-6 shrink-0 text-[10.5px] leading-5 text-muted-foreground">{i + 1}</span>
                    <span className="text-[12.5px] leading-5">{l.text}</span>
                  </li>
                ))}
                {(!reel.lines || reel.lines.length === 0) && <li className="px-4 py-3 text-[12.5px] text-muted-foreground">{reel.transcript}</li>}
              </ul>
            </div>

            <div className="space-y-3">
              <div className="rounded-xl border border-border/70 bg-[hsl(var(--card))] p-4">
                <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">разбор</p>
                <p className="mt-1.5 text-[13px] leading-relaxed">{reel.summary}</p>
                {reel.hook && (
                  <p className="mt-3 border-l-2 border-[hsl(var(--primary))]/50 pl-3 text-[12.5px] italic leading-relaxed text-muted-foreground">
                    «{reel.hook}»
                  </p>
                )}
                {reel.why_viral && <p className="mt-3 text-[12.5px] leading-relaxed text-muted-foreground">{reel.why_viral}</p>}
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    onClick={buildScenario}
                    disabled={busy !== ""}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[hsl(var(--primary))] px-3 py-2 text-[12px] font-medium text-[hsl(var(--primary-foreground))] disabled:opacity-50"
                  >
                    {busy === "scenario" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                    Сценарий для меня
                  </button>
                  <button
                    onClick={() => setPick({ url: reel.source_url, handle: "", transcript: reel.transcript, images: [], thumb: "" })}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[12px] transition-colors hover:bg-[hsl(var(--accent))]"
                  >
                    Карусель из рилса <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {scenario && (
                <div className="rounded-xl border border-border/70 bg-[hsl(var(--card))] p-4">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">сценарий</p>
                  {scenario.hook_type && <p className="mt-1.5 text-[12px] text-muted-foreground">Хук: {scenario.hook_type} · эмоция: {scenario.emotion}</p>}
                  {scenario.structure?.length > 0 && (
                    <ol className="mt-2 space-y-1 text-[12.5px] leading-relaxed">
                      {scenario.structure.map((s, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="text-muted-foreground">{i + 1}.</span> {s}
                        </li>
                      ))}
                    </ol>
                  )}
                  {scenario.hooks?.length > 0 && (
                    <div className="mt-3 space-y-1.5">
                      {scenario.hooks.map((h, i) => (
                        <p key={i} className="rounded-md bg-[hsl(var(--muted))] px-2.5 py-1.5 text-[12px]">
                          {h}
                        </p>
                      ))}
                    </div>
                  )}
                  {scenario.script && <p className="mt-3 whitespace-pre-wrap text-[12.5px] leading-relaxed">{scenario.script}</p>}
                </div>
              )}
            </div>
          </section>
        )}

        {history.length > 0 && (
          <section className="rounded-xl border border-border/70 bg-[hsl(var(--card))]">
            <header className="border-b border-border/70 px-4 py-3">
              <h2 className="text-[13px] font-medium">Недавние расшифровки</h2>
            </header>
            <ul className="divide-y divide-border/60">
              {history.map((h) => (
                <li key={h.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px]">{h.summary || h.title || "без разбора"}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{h.source_url}</p>
                  </div>
                  <button onClick={() => setReel(h)} className="text-[11.5px] text-[hsl(var(--primary))]">
                    открыть
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <StartCarouselDialog open={Boolean(pick)} onOpenChange={(v) => !v && setPick(null)} source={pick} />
    </div>
  );
}