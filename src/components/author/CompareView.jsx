// Сравнение: оригинальный кадр целиком рядом с моим результатом.
import SlideCanvas from "@/components/SlideCanvas";
import { Image } from "@/components/ui/image";

export default function CompareView({ slide, profile, aspect }) {
  const card = slide?.reference_card?.schema_version === 2 ? slide.reference_card : null;
  const [aw, ah] = (card?.aspect || aspect || "4:5").split(":").map(Number);
  const box = aw > 0 && ah > 0 ? `${aw} / ${ah}` : "4 / 5";

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <figure className="min-w-0 space-y-1.5">
        <figcaption className="text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground">оригинал целиком</figcaption>
        <div className="overflow-hidden rounded-xl border border-border/70 bg-[hsl(var(--muted))]">
          <div style={{ aspectRatio: box }} className="w-full">
            <Image src={slide.reference_url} alt="оригинал" fittingType="fit" className="h-full w-full" />
          </div>
        </div>
        {card && (
          <p className="text-[11px] text-muted-foreground">
            {card.panels.length === 2 ? "двойной кадр: сверху и снизу" : "один кадр"} · {card.aspect}
          </p>
        )}
      </figure>

      <figure className="min-w-0 space-y-1.5">
        <figcaption className="text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground">у меня</figcaption>
        <SlideCanvas slide={slide} profile={profile} aspect={aspect} width={430} />
      </figure>
    </div>
  );
}