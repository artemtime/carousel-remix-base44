import { useState } from "react";
import { Send, ArrowUpRight } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const STEPS = [
  "Нажмите кнопку «Открыть бота» ниже — ссылка сама привяжет бота к вашему аккаунту.",
  "В Telegram нажмите «Запустить»: синяя кнопка снизу на экране чата (или «Start» под шапкой).",
  "Напишите «привет» — бот ответит приветствием студии. Дальше просто просите: «разведай @ник», «сделай карусель».",
];

// Ссылка сама проводит через вход: бот студии сразу узнаёт, кто ему пишет.
export default function TelegramConnect() {
  const [open, setOpen] = useState(false);
  const href = base44.agents.getTelegramConnectURL("studio");

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="mt-1 flex w-full items-center gap-2.5 rounded-lg border border-[hsl(var(--primary))]/35 bg-[hsl(var(--primary))]/10 px-3 py-2 text-[13.5px] font-medium text-foreground transition-colors hover:bg-[hsl(var(--primary))]/18"
      >
        <Send className="h-4 w-4 text-[hsl(var(--primary))]" />
        Подключить Telegram
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[16px]">Бот студии в Telegram</DialogTitle>
            <DialogDescription className="text-[12.5px]">Три шага — и студия у вас в телефоне.</DialogDescription>
          </DialogHeader>

          <ol className="space-y-3">
            {STEPS.map((step, i) => (
              <li key={i} className="flex gap-2.5 text-[12.5px] leading-relaxed text-muted-foreground">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[hsl(var(--primary))]/15 text-[11px] font-semibold text-[hsl(var(--primary))]">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>

          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            onClick={() => setOpen(false)}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[hsl(var(--primary))] px-4 py-2.5 text-[13px] font-semibold text-[hsl(var(--primary-foreground))] transition-opacity hover:opacity-90"
          >
            Открыть бота <ArrowUpRight className="h-4 w-4" />
          </a>

          <p className="text-[11.5px] leading-relaxed text-muted-foreground">
            Ссылка ведёт через само приложение, поэтому сначала опубликуйте его кнопкой Publish в редакторе — до публикации
            откроется страница «приложение ещё не доступно». Бот тоже должен быть подключён: редактор агента, вкладка Telegram.
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}