import { useState } from "react";
import { Loader2, Wand2, Download, AlertTriangle, CheckCircle2, Columns2, Square } from "lucide-react";
import SlideCanvas from "@/components/SlideCanvas";
import CompareView from "@/components/author/CompareView";
import TextCardFields from "@/components/author/TextCardFields";
import ReferenceFields from "@/components/author/ReferenceFields";
import ReferencePreview from "@/components/author/ReferencePreview";
import PanelChecks from "@/components/author/PanelChecks";

export default function SlideEditor({ slide, style, drawing, drawingNote, onChange, onDraw, heroSlot }) {
  const [compare, setCompare] = useState(false);
  if (!slide) return <p className="text-[12.5px] text-muted-foreground">Выберите слайд слева.</p>;

  const canCompare = Boolean(slide.reference_url);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0">
        {compare && canCompare ? (
          <CompareView slide={slide} profile={style?.caption} aspect={style?.aspect} />
        ) : (
          <SlideCanvas
            slide={slide}
            profile={style?.caption}
            aspect={style?.aspect}
            width={430}
            className="mx-auto"
            showDownload
            downloadName={`слайд-${slide.position}.png`}
          />
        )}

        {canCompare && (
          <button
            onClick={() => setCompare((v) => !v)}
            className="mx-auto mt-1.5 flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            {compare ? <Square className="h-3 w-3" /> : <Columns2 className="h-3 w-3" />}
            {compare ? "только мой кадр" : "сравнить с оригиналом"}
          </button>
        )}
      </div>

      <div className="space-y-3">
        {slide.reference_card?.visual_mode !== "text" && heroSlot}

        {slide.reference_url && (
          <ReferencePreview url={slide.reference_url} index={slide.reference_index} brief={slide.reference_brief} />
        )}

        {slide.reference_card?.visual_mode === "text" ? <TextCardFields slide={slide} onChange={onChange}/> : slide.reference_card?.schema_version === 2 ? <ReferenceFields slide={slide} onChange={onChange} /> : <>
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">текст на слайде</label>
            <span className="text-[10.5px] text-muted-foreground">**жирный** · ==акцент== · ^^мелкий^^</span>
          </div>
          <textarea
            value={slide.text || ""}
            onChange={(e) => onChange({ text: e.target.value })}
            rows={5}
            className="w-full resize-none rounded-lg border border-border bg-[hsl(var(--input))]/40 px-3 py-2 text-[12.5px] leading-relaxed outline-none focus:border-[hsl(var(--primary))]/50"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-[11px] uppercase tracking-[0.12em] text-muted-foreground">что нарисовано</label>
          <textarea
            value={slide.scene || ""}
            onChange={(e) => onChange({ scene: e.target.value })}
            rows={4}
            className="w-full resize-none rounded-lg border border-border bg-[hsl(var(--input))]/40 px-3 py-2 text-[12px] leading-relaxed outline-none focus:border-[hsl(var(--primary))]/50"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11.5px] text-muted-foreground">раскладка</span>
          {[1, 2].map((n) => (
            <button
              key={n}
              onClick={() => onChange({ layout: n })}
              className={[
                "rounded-md border px-2.5 py-1 text-[11px] transition-colors",
                Number(slide.layout) === n ? "border-[hsl(var(--primary))]/60 bg-[hsl(var(--primary))]/10" : "border-border/70 text-muted-foreground",
              ].join(" ")}
            >
              {n} кадра
            </button>
          ))}
        </div>
        </>}

        {slide.reference_card?.visual_mode !== "text" && <button
          onClick={onDraw}
          disabled={drawing}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[hsl(var(--primary))] px-3 py-2.5 text-[12.5px] font-medium text-[hsl(var(--primary-foreground))] transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {drawing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
          {drawing && drawingNote ? drawingNote : slide.image_url ? "Перерисовать кадр" : "Нарисовать кадр"}
        </button>}

        {slide.image_url && (
          <a
            href={slide.image_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[11.5px] text-muted-foreground transition-colors hover:text-foreground"
          >
            <Download className="h-3.5 w-3.5" /> открыть картинку кадра
          </a>
        )}

        <PanelChecks checks={slide.panel_checks} />

        {!slide.panel_checks?.length && slide.critic_note && (
          <div className="flex items-start gap-2 rounded-lg border border-border/70 bg-[hsl(var(--muted))]/60 px-2.5 py-2">
            {slide.critic_status === "ok" ? (
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
            ) : (
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
            )}
            <p className="text-[11px] leading-snug text-muted-foreground">{slide.critic_note}</p>
          </div>
        )}
      </div>
    </div>
  );
}