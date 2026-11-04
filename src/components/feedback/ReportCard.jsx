import { useState } from "react";
import { ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { FEEDBACK_STATUSES, FEEDBACK_KINDS, feedbackStatus } from "@/components/feedback/statuses";

const when = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
};

export default function ReportCard({ report, isAdmin, onStatus, onNote, onOpenShot }) {
  const status = feedbackStatus(report.status);
  const [note, setNote] = useState(report.admin_note || "");

  return (
    <article className="rounded-xl border border-border/70 bg-[hsl(var(--card))] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-[hsl(var(--muted))] px-2 py-0.5 text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground">
          {FEEDBACK_KINDS[report.kind] || "Другое"}
        </span>
        <span className={cn("rounded-md border px-2 py-0.5 text-[11px]", status.tone)}>{status.label}</span>
        <span className="text-[11px] text-muted-foreground">{when(report.created_date)}</span>
        {report.page && <span className="truncate text-[11px] text-muted-foreground">· {report.page}</span>}
      </div>

      <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed">{report.message}</p>

      <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
        {report.user_email && <span>{isAdmin ? report.user_email : "мой отчёт"}</span>}
        {report.device && <span className="opacity-70">{report.device}</span>}
        {report.image_uri && (
          <button onClick={() => onOpenShot(report)} className="inline-flex items-center gap-1 text-[hsl(var(--primary))] hover:opacity-80">
            <ImageIcon className="h-3 w-3" /> скриншот
          </button>
        )}
      </div>

      {isAdmin ? (
        <div className="mt-3 space-y-2 border-t border-border/70 pt-3">
          <div className="flex flex-wrap gap-1.5">
            {FEEDBACK_STATUSES.map((item) => (
              <button
                key={item.id}
                onClick={() => onStatus(report, item.id)}
                className={cn(
                  "rounded-lg border px-2.5 py-1 text-[11.5px] transition-colors",
                  report.status === item.id ? item.tone : "border-border/70 text-muted-foreground hover:text-foreground",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => onNote(report, note)}
            placeholder="Что сделано — человек увидит этот ответ"
            className="w-full rounded-lg border border-border/70 bg-[hsl(var(--input))]/30 px-3 py-1.5 text-[12px] outline-none focus:border-[hsl(var(--primary))]/50"
          />
        </div>
      ) : (
        report.admin_note && (
          <p className="mt-3 rounded-lg border border-border/70 bg-[hsl(var(--muted))]/50 px-3 py-2 text-[12px] leading-relaxed text-muted-foreground">
            Ответ автора: {report.admin_note}
          </p>
        )
      )}
    </article>
  );
}