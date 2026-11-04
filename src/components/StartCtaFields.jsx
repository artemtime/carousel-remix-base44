import { MessageSquareText } from "lucide-react";

// Призыв подтверждается здесь же, на шаге сборки: он встанет в последний слайд
// и в конец подписи, и запомнится для выбранного языка.
export default function StartCtaFields({ languageLabel, cta, codeword, onChange }) {
  return (
    <div className="rounded-lg border border-border/70 bg-[hsl(var(--muted))]/40 p-3">
      <p className="mb-1.5 flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground">
        <MessageSquareText className="h-3.5 w-3.5" /> призыв в конце · {languageLabel}
      </p>
      <textarea
        value={cta}
        onChange={(e) => onChange({ cta: e.target.value })}
        rows={2}
        placeholder="напишите «ХОЧУ» в комментариях — пришлю подарок"
        className="w-full resize-none rounded-lg border border-border bg-[hsl(var(--input))]/40 px-3 py-2 text-[12.5px] leading-snug outline-none focus:border-[hsl(var(--primary))]/50"
      />
      <label className="mt-2 flex items-center gap-2">
        <span className="text-[11px] text-muted-foreground">кодовое слово</span>
        <input
          value={codeword}
          onChange={(e) => onChange({ codeword: e.target.value })}
          className="w-40 rounded-md border border-border bg-[hsl(var(--input))]/40 px-2 py-1 text-[12px] outline-none focus:border-[hsl(var(--primary))]/50"
        />
      </label>
      <p className="mt-1.5 text-[10.5px] leading-snug text-muted-foreground">
        Этим призывом закончатся последний слайд и подпись. Запоминаю его для этого языка и подставлю в следующий раз.
      </p>
    </div>
  );
}