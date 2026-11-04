import { useState } from "react";
import { Bug } from "lucide-react";
import ReportDialog from "@/components/feedback/ReportDialog";

// Кнопка отчёта живёт на всех страницах: человек в любой момент может сказать,
// что не получилось, не разыскивая форму.
export default function FeedbackButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 z-40 inline-flex items-center gap-2 rounded-full border border-border/70 bg-[hsl(var(--card))] px-3 py-2 text-[12px] text-muted-foreground shadow-lg shadow-black/30 transition-colors hover:text-foreground md:bottom-6 md:right-6 md:px-4 md:text-[12.5px]"
      >
        <Bug className="h-4 w-4 text-[hsl(var(--primary))]" />
        <span className="hidden sm:inline">Что не получилось?</span>
      </button>
      <ReportDialog open={open} onOpenChange={setOpen} />
    </>
  );
}