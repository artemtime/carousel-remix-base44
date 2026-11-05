import { slideReady } from "@/lib/readiness";
import SlideCanvas from "@/components/SlideCanvas";
import { cn } from "@/lib/utils";

const ROLE = { hook: "хук", body: "слайд", cta: "призыв" };

export default function SlideRail({ slides, activeId, onSelect, profileOf, aspect }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 lg:h-full lg:flex-col lg:overflow-y-auto lg:overflow-x-hidden lg:pb-0">
      {slides.map((slide) => (
        <button
          key={slide.id}
          onClick={() => onSelect(slide.id)}
          className={cn(
            "flex w-[68px] shrink-0 flex-col gap-1 rounded-lg border p-1 text-left transition-colors lg:w-full lg:flex-row lg:items-center lg:gap-2 lg:p-1.5",
            activeId === slide.id ? "border-[hsl(var(--primary))]/60 bg-[hsl(var(--primary))]/[0.07]" : "border-border/60 hover:bg-[hsl(var(--accent))]/50",
          )}
        >
          <SlideCanvas slide={slide} profile={profileOf?.(slide)} aspect={aspect} width={56} className="w-[56px] shrink-0 lg:w-[38px]" />
          <span className="min-w-0 lg:flex-1">
            <span className="block truncate text-[10.5px] font-medium lg:text-[11.5px]">
              {slide.position}. {ROLE[slide.role] || slide.role}
            </span>
            <span className="hidden truncate text-[10.5px] text-muted-foreground lg:block">
              {slide.image_stale ? "нужна перерисовка" : slideReady(slide) ? (slide.reference_card?.visual_mode === "text" ? "текст готов" : "проверен") : slide.image_url ? "нужна проверка" : "ждёт картинку"}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}