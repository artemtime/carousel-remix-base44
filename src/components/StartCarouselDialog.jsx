import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Sparkles, ScanLine } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { makePlan, scanReference, saveCarouselPlan } from "@/lib/author";
import { referenceImages } from "@/lib/reference-model";
import { MODES, isExactMode } from "@/lib/modes";
import { LANGS, ORIGINAL_LANG, pickLanguage, isTranslated } from "@/lib/languages";
import { ctaFor, rememberCta } from "@/lib/cta";
import { useSettings } from "@/hooks/use-settings";
import StartCtaFields from "@/components/StartCtaFields";
import {TEXT_STYLE,textStyle} from "@/lib/text-cards";
import HeroPicker from "@/components/heroes/HeroPicker";
import ImageModelPicker from "@/components/ImageModelPicker";
import { heroPassport } from "@/lib/heroes";
import { cn } from "@/lib/utils";

// Общий вход в Автора: из карусели конкурента или из расшифровки рилса.
export default function StartCarouselDialog({ open, onOpenChange, source, initialMode }) {
  const navigate = useNavigate();
  const makePlanFn = useServerFn(makePlan);
  const scanFn = useServerFn(scanReference);
  const saveFn = useServerFn(saveCarouselPlan);
  const { settings, save } = useSettings();
  const [styles, setStyles] = useState([]);
  const [loadingStyles, setLoadingStyles] = useState(true);
  // Призыв, который подтвердит пользователь: он запомнится для выбранного языка.
  const [cta, setCta] = useState({ cta: "", codeword: "" });
  const [format,setFormat]=useState("illustrated");
  const [styleId, setStyleId] = useState("");
  const [pickedHero, setPickedHero] = useState(null);
  const [pickedImageModel, setPickedImageModel] = useState(null);
  const [mode, setMode] = useState("remix");
  // Явный выбор языка; пока его нет, режим подсказывает умолчание.
  const [pickedLanguage, setPickedLanguage] = useState(null);
  const [busy, setBusy] = useState("");
  const [scan, setScan] = useState(null);

  const cards = referenceImages(source?.images || []);

  useEffect(() => {
    if (!open) return;
    setScan(null);
    setPickedHero(null);
    setPickedImageModel(null);
    setLoadingStyles(true);
    setMode(initialMode || settings?.editorial?.content_mode || "remix");
    setPickedLanguage(null);
    (async () => {
      const page = await base44.entities.MyStyle.list({ sort: "-updated_date", limit: 30 });
      const items = page.items || [];
      setStyles(items);
      if(settings?.editorial?.hero_id)setPickedHero(await base44.entities.Hero.get(settings.editorial.hero_id).catch(()=>null));
      const initial=items.find(item=>item.id===settings?.editorial?.style_id) || (items.length===1?items[0]:null);
      if(initial?.content_format === "text")setFormat("text");
      setStyleId(previous => items.some(item => item.id === previous) ? previous : initial?.id || "");
      setLoadingStyles(false);
    })();
  }, [open,settings?.editorial?.style_id]);

  const textOnly=format === "text";
  const style = styles.find((s) => s.id === styleId) || (mode === "mirror" ? { name: "Стиль оригинала" } : textOnly ? TEXT_STYLE : null);
  // «Зеркало» повторяет оригинал один-в-один: персонаж, палитра и шрифт чужие,
  // поэтому выбирать своего героя здесь бессмысленно — выбор блокируем.
  const mirror = mode === "mirror";
  const selectedStyle = textOnly ? textStyle(style) : pickedHero ? { ...style, hero: heroPassport(pickedHero), hero_id: pickedHero.id, hero_sheet_url: pickedHero.sheet_url || "" } : style;
  // «Зеркало» умеет и оставить надписи как в оригинале, и перевести их.
  const language = pickLanguage(pickedLanguage, mirror);
  const langOptions = mirror ? [ORIGINAL_LANG, ...LANGS] : LANGS;
  // Память призывов: подставляем сохранённый для этого языка, иначе собранный из настроек.
  const ctaPreset = ctaFor(settings, language);

  useEffect(() => {
    if (!open || !ctaPreset) return;
    setCta({ cta: ctaPreset.cta, codeword: ctaPreset.codeword });
  }, [open, language, settings?.id, settings?.gift, settings?.codeword]);

  const build = async () => {
    if (!style) return toast.error("Сначала создайте стиль");
    // Форму оригинала снимаем всегда: число карточек и двойные кадры не зависят от режима.
    const exact = isExactMode(mode) && !source?.transcript;
    const isCarousel = !source?.transcript;
    if (isCarousel && !cards.length) return toast.error("Нужны изображения карточек оригинала, а не только подпись.");
    // Подтверждённый призыв идёт в план и запоминается как предпочтение этого языка.
    const memory = rememberCta(settings, language, cta);
    setBusy(exact ? "scan" : "plan");
    try {
      // 1. Чертёж по ВСЕМ карточкам референса.
      let profile = null;
      if (isCarousel) {
        if (exact) setBusy("scan");
        profile = await scanFn({ data: { images: cards, caption: source?.caption || "", format } });
        setScan(profile);
        setBusy("plan");
      }

      // 2. План карточка к карточке по чертежу.
      const plan = await makePlanFn({
        data: {
          format,
          style: selectedStyle,
          hero: selectedStyle.hero,
          rules: style.rules || [],
          settings: { ...(settings || {}), cta_memory: memory },
          mode,
          adapt: mode === "adapt",
          sourceImages: cards,
          sourceText: source?.transcript || source?.caption || "",
          sourceKind: source?.transcript ? "reel" : "carousel",
          reference: profile || undefined,
          language,
        },
      });

      const savedStyle=textOnly && !selectedStyle.id ? await base44.entities.MyStyle.create(selectedStyle) : selectedStyle;
      const carousel = await saveFn({ data: { plan, style: savedStyle, source, mode, language,
        imageModel: pickedImageModel ?? settings?.editorial?.image_model ?? settings?.image_model ?? "automatic" } });
      if (isTranslated(language) && cta.cta.trim()) await save({ cta_memory: memory }).catch(() => null);
      toast.success(textOnly ? "Текстовые карточки готовы — проверьте текст и итоговые PNG" : profile && exact ? `Прочитано ${profile.cards_count} карточек: план готов` : "План в вашем стиле готов — проверьте и запускайте рисование");
      onOpenChange(false);
      navigate({ to: "/author/$carouselId", params: { carouselId: carousel.id } });
    } catch (error) {
      toast.error(String(error.message || error).slice(0, 220));
    } finally {
      setBusy("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto border-border bg-[hsl(var(--card))]">
        <DialogHeader>
          <DialogTitle className="text-[17px]">Собрать карусель</DialogTitle>
          <DialogDescription className="text-[12.5px] text-muted-foreground">
            {textOnly ? "Текст и оформление карточек без героя, портрета и рисования." : source?.transcript
              ? "Автор разберёт сценарий рилса и перескажет его вашим героем."
              : isExactMode(mode) ? `Прочитаем все ${cards.length || ""} карточек и сохраним оформление оригинала.` : "Сюжет берём из поста, рисовку, цвета и шрифты — из выбранного вами стиля."}
          </DialogDescription>
        </DialogHeader>

        <fieldset className="flex gap-2"><legend className="mb-2 text-xs">Формат карточек</legend>{[["illustrated","С иллюстрациями"],["text","Только текст · без героя"]].map(([id,label])=><button key={id} type="button" disabled={Boolean(busy)} onClick={()=>{setFormat(id);setPickedHero(null);if(id==="illustrated" && style?.content_format==="text")setStyleId("");if(id==="text"){if(style?.content_format!=="text")setStyleId(styles.find(s=>s.content_format==="text")?.id || "");if(mode==="remix")setMode("adapt");}}} aria-pressed={format===id} className={cn("rounded-lg border px-3 py-2 text-sm",format===id?"border-primary bg-accent":"border-border")}>{label}</button>)}</fieldset>
        {loadingStyles ? <p className="text-[12px] text-muted-foreground">Загружаю стили…</p> : styles.length === 0 && !mirror && !textOnly ? (
          <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center">
            <p className="text-[13px] font-medium">Библиотека стилей пуста</p>
            <p className="mt-1 text-[12px] text-muted-foreground">Сначала снимите стиль в разделе «Мои стили».</p>
          </div>
        ) : (
          <>
            {mirror && (
              <p className="rounded-lg border border-border/70 bg-[hsl(var(--muted))]/50 px-3 py-2 text-[11.5px] leading-snug text-muted-foreground">
                {textOnly ? "В зеркале сохраняются текст, фон, шрифт и расположение блоков оригинала. Героя и иллюстраций не будет." : "В зеркале персонаж, палитра и шрифт берутся из оригинала. Своего героя выбрать нельзя — для него есть «Максимально близко» или «Адаптация»."}
              </p>
            )}
            {!mirror && <div
              aria-disabled={mirror}
              className={cn("max-h-[240px] space-y-1.5 overflow-y-auto pr-1", mirror && "pointer-events-none select-none opacity-40")}
            >
              {styles.filter(s=>!textOnly || s.content_format === "text").map((s) => (
                <button
                  key={s.id}
                  disabled={mirror}
                  onClick={() => { setStyleId(s.id); if(s.content_format === "text")setFormat("text"); setPickedHero(null); }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                    styleId === s.id ? "border-[hsl(var(--primary))]/60 bg-[hsl(var(--primary))]/[0.07]" : "border-border/70 hover:bg-[hsl(var(--accent))]/50",
                  )}
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-[hsl(var(--muted))] text-[11px] font-semibold uppercase">
                    {(s.name || "?").slice(0, 2)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">{!s.name || s.name.startsWith("undefined") ? (s.author_handle || "Стиль без названия") : s.name}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {s.content_format === "text" ? "текстовый стиль · без героя" : s.hero?.name ? `герой: ${s.hero.name}` : "без героя"} · {(s.rules || []).length} правил
                    </span>
                  </span>
                </button>
              ))}
            </div>}

            {!mirror && style && !textOnly && (
              <div className="space-y-2 rounded-lg border border-border/70 p-3">
                <p className="text-[12px] font-medium">Стиль: {style.name} · шрифт {style.caption?.font || "из стиля"}</p>
                <HeroPicker value={pickedHero?.id || ""} defaultName={style.hero?.name} onChange={(_id, hero) => setPickedHero(hero)} />
                <p className="text-[11px] text-muted-foreground">Герой: {selectedStyle.hero?.name || "не задан"}. {isExactMode(mode) ? "Рисовка, цвета и шрифт — из оригинала; заменяется герой." : "Рисовка, цвета, шрифт и оформление — из выбранного стиля. Героя можно выбрать отдельно."}</p>
              </div>
            )}
            {!style && !mirror && <p className="text-[12px] text-muted-foreground">Выберите стиль для этой карусели.</p>}

            <div className="grid gap-1.5 pt-1 sm:grid-cols-2">
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
                  <span className="mt-0.5 block text-[11px] leading-snug">{textOnly ? ({mirror:"Текст и расположение блоков как у конкурента.",remix:"Сохранить текст и оформление без персонажей.",adapt:"Смысл исходника, свои слова и типографика.",original:"Свои аргументы и текст по теме исходника."}[m.id]) : m.hint}</span>
                </button>
              ))}
            </div>

            {textOnly && <p className="text-xs text-muted-foreground">Герой и модель рисования не используются. Можно начать без сохранённого стиля: будет светлый фон, тёмный текст и цветной акцент. Для своих шрифтов и цветов создайте текстовый стиль в «Моих стилях».</p>}
            {!textOnly && <ImageModelPicker value={pickedImageModel ?? settings?.editorial?.image_model ?? settings?.image_model ?? "automatic"} onChange={setPickedImageModel} disabled={Boolean(busy)} />}
            <div className="pt-1">
              <p className="mb-1.5 text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground">язык текста</p>
              <div className="flex flex-wrap gap-1.5">
                {langOptions.map((lang) => (
                  <button
                    key={lang.id}
                    onClick={() => setPickedLanguage(lang.id)}
                    className={cn(
                      "rounded-lg border px-3 py-1.5 text-[12px] transition-colors",
                      language === lang.id
                        ? "border-[hsl(var(--primary))]/60 bg-[hsl(var(--primary))]/10 text-foreground"
                        : "border-border/70 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {lang.label}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
                {mirror
                  ? "Зеркало повторяет оригинал: надписи и подпись можно оставить как есть или перевести на выбранный язык."
                  : "Надписи и подпись к посту выйдут на этом языке. Оформление определяется выбранным режимом и стилем."}
              </p>
            </div>

            {ctaPreset && (
              <StartCtaFields
                languageLabel={(langOptions.find((l) => l.id === language) || {}).label || ""}
                cta={cta.cta}
                codeword={cta.codeword}
                onChange={(patch) => setCta((prev) => ({ ...prev, ...patch }))}
              />
            )}

            {isExactMode(mode) && !source?.transcript && (
              <p className="text-[11.5px] leading-relaxed text-muted-foreground">
                {cards.length
                  ? textOnly ? `Прочитаю текст всех ${cards.length} карточек и сохраню расположение блоков. Рисование не запускается.` : `Прочитаю все ${cards.length} карточек дословно. Двойные кадры останутся двойными, каждый со своей сценой и подписью. Подпись под постом не заменяет текст карточек.`
                  : "Нет изображений: точный режим остановится, а не придумает карусель по подписи."}
              </p>
            )}

            {scan && (
              <div className="rounded-lg border border-border/70 bg-[hsl(var(--muted))]/50 px-3 py-2 text-[11.5px] leading-relaxed text-muted-foreground">
                чертёж: {scan.cards?.length || 0} карточек · {scan.aspect} · {scan.lighting}
              </div>
            )}

            <button
              onClick={build}
              disabled={Boolean(busy) || !style}
              className="mt-2 inline-flex items-center justify-center gap-2 rounded-lg bg-[hsl(var(--primary))] px-4 py-2.5 text-[13px] font-medium text-[hsl(var(--primary-foreground))] transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy === "scan" ? <ScanLine className="h-4 w-4 animate-pulse" /> : busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {busy === "scan" ? "Снимаю чертёж со всех карточек…" : busy === "plan" ? "Автор пишет план карточка в карточку…" : "Собрать план"}
            </button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
