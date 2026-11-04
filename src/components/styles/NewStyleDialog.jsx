import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Radar, Wand2, Check } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import SlideCanvas from "@/components/SlideCanvas";
import CaptionControls from "@/components/styles/CaptionControls";
import { scoutHandle } from "@/lib/scout";
import { analyzeStyle, suggestHeroes, makePassport } from "@/lib/author";
import { normalizeProfile } from "@/lib/slide-renderer";
import { useSettings } from "@/hooks/use-settings";
import { cn } from "@/lib/utils";

const SAMPLE = "Вот так выглядит\n==ваша подпись== на слайде";

export default function NewStyleDialog({ open, onOpenChange, onCreated }) {
  const { settings } = useSettings();
  const scoutFn = useServerFn(scoutHandle);
  const analyzeFn = useServerFn(analyzeStyle);
  const heroesFn = useServerFn(suggestHeroes);
  const passportFn = useServerFn(makePassport);

  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState("");
  const [hits, setHits] = useState([]);
  const [chosen, setChosen] = useState(null);
  const [style, setStyle] = useState(null);
  const [profile, setProfile] = useState(null);
  const [name, setName] = useState("");
  const [variants, setVariants] = useState([]);
  const [heroText, setHeroText] = useState("");

  useEffect(() => {
    if (open) return;
    setHits([]);
    setChosen(null);
    setStyle(null);
    setProfile(null);
    setVariants([]);
    setHeroText("");
    setName("");
    setHandle("");
  }, [open]);

  const find = async () => {
    if (!handle.trim()) return;
    setBusy("find");
    try {
      const res = await scoutFn({ data: { handle, limit: 30 } });
      setHits(res.hits);
      if (!res.hits.length) toast.message("Каруселей выше обычного уровня не нашлось");
    } catch (e) {
      toast.error(String(e.message || e).slice(0, 220));
    } finally {
      setBusy("");
    }
  };

  const takeStyle = async (hit) => {
    setBusy("style");
    setChosen(hit);
    try {
      const data = await analyzeFn({ data: { images: (hit.images || [hit.thumb]).slice(0, 8) } });
      setStyle(data);
      setProfile(normalizeProfile(data.caption || {}));
      setName(`${hit.handle || "Автор"} · ${data.font_kind || "стиль"}`);
    } catch (e) {
      toast.error(String(e.message || e).slice(0, 220));
    } finally {
      setBusy("");
    }
  };

  const findHeroes = async () => {
    setBusy("heroes");
    try {
      const list = await heroesFn({
        data: {
          art_style: style?.art_style || "",
          competitor_character: style?.competitor_character || "",
          topic: settings?.blog_topic || "",
        },
      });
      setVariants(list || []);
      setHeroText(list?.[0] || "");
    } catch (e) {
      toast.error(String(e.message || e).slice(0, 220));
    } finally {
      setBusy("");
    }
  };

  const finish = async () => {
    if (!name.trim()) return toast.error("Дайте стилю имя");
    if (!style) return;
    setBusy("save");
    try {
      let hero = null;
      if (heroText.trim()) hero = await passportFn({ data: { raw: heroText } });
      const record = await base44.entities.MyStyle.create({
        name: name.trim(),
        author_handle: chosen?.handle || handle,
        aspect: style.aspect || "4:5",
        art_style: style.art_style || "",
        palette: style.palette || [],
        lighting: style.lighting || "",
        background: style.background || "",
        caption: profile,
        hero,
        hero_variants: variants,
        world: "",
        rules: [],
        font_kind: style.font_kind || "",
        source_slide_urls: (style.source_slide_urls || chosen?.images || []).slice(0, 6),
      });
      toast.success("Стиль сохранён");
      onOpenChange(false);
      onCreated?.(record);
    } catch (e) {
      toast.error(String(e.message || e).slice(0, 220));
    } finally {
      setBusy("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto border-border bg-[hsl(var(--card))]">
        <DialogHeader>
          <DialogTitle className="text-[17px]">Новый стиль</DialogTitle>
          <DialogDescription className="text-[12.5px] text-muted-foreground">
            Снимаем пропорции, манеру рисования и подпись с чужой карусели, придумываем своего героя.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Radar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="@ник автора, чей вид нравится"
              className="h-9 w-full rounded-lg border border-border bg-[hsl(var(--input))]/40 pl-9 pr-3 text-[13px] outline-none placeholder:text-muted-foreground focus:border-[hsl(var(--primary))]/50"
            />
          </div>
          <button onClick={find} disabled={busy !== ""} className="inline-flex h-9 items-center gap-2 rounded-lg bg-[hsl(var(--primary))] px-3.5 text-[12.5px] font-medium text-[hsl(var(--primary-foreground))] disabled:opacity-50">
            {busy === "find" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radar className="h-4 w-4" />} Найти карусели
          </button>
        </div>

        {hits.length > 0 && !style && (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {hits.map((hit) => (
              <button key={hit.shortcode} onClick={() => takeStyle(hit)} className="group overflow-hidden rounded-lg border border-border/70 transition-colors hover:border-[hsl(var(--primary))]/60">
                {hit.thumb ? <img src={hit.thumb} alt="" className="aspect-[4/5] w-full object-cover" /> : <div className="aspect-[4/5] w-full bg-[hsl(var(--muted))]" />}
                <span className="block px-1.5 py-1 text-[10.5px] text-muted-foreground">×{hit.ratio}</span>
              </button>
            ))}
          </div>
        )}

        {busy === "style" && (
          <p className="flex items-center gap-2 py-6 text-[12.5px] text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Снимаю стиль и подпись…
          </p>
        )}

        {style && profile && (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-[220px_1fr]">
              <SlideCanvas slide={{ text: SAMPLE }} profile={profile} aspect={style.aspect || "4:5"} width={220} />
              <div className="space-y-3">
                <label className="block">
                  <span className="mb-1.5 block text-[11px] text-muted-foreground">Как рисуем</span>
                  <textarea
                    value={style.art_style || ""}
                    onChange={(e) => setStyle({ ...style, art_style: e.target.value })}
                    rows={4}
                    className="w-full resize-none rounded-lg border border-border bg-[hsl(var(--input))]/40 px-2.5 py-2 text-[12px] leading-relaxed outline-none focus:border-[hsl(var(--primary))]/50"
                  />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="mb-1.5 block text-[11px] text-muted-foreground">Имя стиля</span>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="h-8 w-full rounded-md border border-border bg-[hsl(var(--input))]/40 px-2 text-[12px] outline-none focus:border-[hsl(var(--primary))]/50"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-[11px] text-muted-foreground">Пропорции</span>
                    <select
                      value={style.aspect || "4:5"}
                      onChange={(e) => setStyle({ ...style, aspect: e.target.value })}
                      className="h-8 w-full rounded-md border border-border bg-[hsl(var(--input))]/40 px-2 text-[12px] outline-none"
                    >
                      {["4:5", "3:4", "1:1"].map((a) => (
                        <option key={a} value={a}>
                          {a}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-border/70 p-3">
                <p className="mb-3 text-[12px] font-medium">Подпись</p>
                <CaptionControls profile={profile} onChange={setProfile} />
              </div>
              <div className="rounded-lg border border-border/70 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[12px] font-medium">Постоянный герой</p>
                  <button onClick={findHeroes} disabled={busy !== ""} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] hover:bg-[hsl(var(--accent))] disabled:opacity-50">
                    {busy === "heroes" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />} придумать
                  </button>
                </div>
                {variants.length > 0 ? (
                  <div className="space-y-1.5">
                    {variants.map((v, i) => (
                      <button
                        key={i}
                        onClick={() => setHeroText(v)}
                        className={cn(
                          "flex w-full gap-2 rounded-md border px-2.5 py-2 text-left text-[11.5px] leading-snug transition-colors",
                          heroText === v ? "border-[hsl(var(--primary))]/60 bg-[hsl(var(--primary))]/10" : "border-border/70 text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {heroText === v && <Check className="mt-0.5 h-3 w-3 shrink-0 text-[hsl(var(--primary))]" />}
                        {v}
                      </button>
                    ))}
                  </div>
                ) : (
                  <textarea
                    value={heroText}
                    onChange={(e) => setHeroText(e.target.value)}
                    rows={5}
                    placeholder="Опишите героя словами или нажмите «придумать»"
                    className="w-full resize-none rounded-md border border-border bg-[hsl(var(--input))]/40 px-2.5 py-2 text-[11.5px] leading-relaxed outline-none focus:border-[hsl(var(--primary))]/50"
                  />
                )}
              </div>
            </div>

            <button
              onClick={finish}
              disabled={busy !== ""}
              className="inline-flex items-center gap-2 rounded-lg bg-[hsl(var(--primary))] px-4 py-2.5 text-[13px] font-medium text-[hsl(var(--primary-foreground))] disabled:opacity-50"
            >
              {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Сохранить стиль
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
