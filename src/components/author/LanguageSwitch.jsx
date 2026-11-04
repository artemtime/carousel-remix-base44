import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Languages } from "lucide-react";
import { toast } from "sonner";
import { relanguageCarousel } from "@/lib/author";
import { LANGS, ORIGINAL_LANG } from "@/lib/languages";
import { cn } from "@/lib/utils";

// Язык надписей на готовой карусели: пересобираем план в том же стиле и форме.
// «Как в оригинале» — только у «Зеркала»: остальные уровни всегда говорят на языке.
export default function LanguageSwitch({ carouselId, value = "ru", disabled, allowOriginal = false, onDone }) {
  const relanguage = useServerFn(relanguageCarousel);
  const [busy, setBusy] = useState(false);
  const langs = allowOriginal ? [ORIGINAL_LANG, ...LANGS] : LANGS;

  const pick = async (language) => {
    if (busy || language === value) return;
    setBusy(true);
    try {
      await relanguage({ data: { carouselId, language } });
      await onDone();
      toast.success(
        language === ORIGINAL_LANG.id
          ? "Надписи и подпись вернулись к оригиналу. Изображения сохранены."
          : "Надписи и подпись переписаны на другом языке. Изображения сохранены.",
      );
    } catch (error) {
      toast.error(String(error.message || error).slice(0, 220));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2 py-1.5">
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Languages className="h-3.5 w-3.5 text-muted-foreground" />}
      {langs.map((lang) => (
        <button
          key={lang.id}
          onClick={() => pick(lang.id)}
          disabled={disabled || busy}
          className={cn(
            "rounded px-1.5 py-0.5 text-[11.5px] uppercase transition-colors disabled:opacity-40",
            value === lang.id ? "bg-[hsl(var(--primary))]/15 text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {lang.short}
        </button>
      ))}
    </div>
  );
}