import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { BookmarkPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { saveStyleFromCarousel } from "@/lib/author";

// Сохраняет палитру, манеру рисования и шрифт разобранного референса как свой стиль.
export default function SaveStyleDialog({ open, onOpenChange, carousel, onSaved }) {
  const saveFn = useServerFn(saveStyleFromCarousel);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const font = carousel?.reference_profile?.cards?.[0]?.text_blocks?.[0]?.font || "стиль";
  const artStyle = carousel?.reference_profile?.art_style || carousel?.reference_profile?.cards?.[0]?.art_style || "";
  const aspect = carousel?.reference_profile?.aspect || "4:5";

  useEffect(() => {
    if (!open) return;
    setName(`${carousel?.source_handle || "референс"} · ${font}`);
  }, [open, carousel, font]);

  const save = async () => {
    if (!carousel) return;
    setBusy(true);
    try {
      const record = await saveFn({ data: { carouselId: carousel.id, name: name.trim() || undefined } });
      toast.success(`Стиль «${record.name}» сохранён — ищите его в «Моих стилях»`);
      onOpenChange(false);
      onSaved?.(record);
    } catch (e) {
      toast.error(String(e.message || e).slice(0, 220));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto border-border bg-[hsl(var(--card))]">
        <DialogHeader>
          <DialogTitle className="text-[17px]">Сохранить стиль</DialogTitle>
          <DialogDescription className="text-[12.5px] text-muted-foreground">
            {carousel?.content_format === "text" ? "Сохраним фон, шрифт и цвета текстового референса. Портрет и герой не нужны." : "Снимем с этого референса манеру рисования, палитру, шрифт и раскладку подписи. Дальше этот стиль можно прикладывать к любому залетевшему посту и к своему герою."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 rounded-lg border border-border/70 bg-[hsl(var(--muted))]/40 px-3 py-2.5 text-[11.5px] leading-relaxed text-muted-foreground">
          <p>пропорции: {aspect}</p>
          <p className="line-clamp-3">рисовка: {artStyle || "не описана"}</p>
          <p>шрифт: {font}</p>
        </div>

        <label className="block">
          <span className="mb-1.5 block text-[11px] text-muted-foreground">Имя стиля</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-9 w-full rounded-lg border border-border bg-[hsl(var(--input))]/40 px-3 text-[12.5px] outline-none focus:border-[hsl(var(--primary))]/50"
          />
        </label>

        <p className="text-[11.5px] leading-relaxed text-muted-foreground">
          {carousel?.content_format === "text" ? "Новый стиль появится в «Моих стилях» как текстовый. Там можно изменить шрифт, фон и цвет текста." : "Персонажа из референса не копирую: в «Моих стилях» у стиля свой герой, его можно придумать или вписать словами. Пока героя нет — кадры рисуются с персонажами оригинала."}
        </p>

        <button
          onClick={save}
          disabled={busy}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-[hsl(var(--primary))] px-4 py-2.5 text-[13px] font-medium text-[hsl(var(--primary-foreground))] disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookmarkPlus className="h-4 w-4" />} Сохранить стиль
        </button>
      </DialogContent>
    </Dialog>
  );
}