import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { Bug, ImagePlus, Lightbulb, Loader2, MessageCircleQuestion, X } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const KINDS = [
  { id: "bug", label: "Что-то сломалось", icon: Bug },
  { id: "idea", label: "Идея улучшения", icon: Lightbulb },
  { id: "other", label: "Другое", icon: MessageCircleQuestion },
];

// Отчёт уходит автору приложения: страница и устройство подставляются сами,
// чтобы человеку осталось только написать, что не получилось.
export default function ReportDialog({ open, onOpenChange }) {
  const { user } = useAuth();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [kind, setKind] = useState("bug");
  const [message, setMessage] = useState("");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [device, setDevice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDevice(`${navigator.platform || "web"} · ${window.innerWidth}px`);
  }, [open]);

  useEffect(() => {
    if (!file) return setPreview("");
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const reset = () => {
    setKind("bug");
    setMessage("");
    setFile(null);
    setPreview("");
  };

  const send = async () => {
    if (message.trim().length < 5) return toast.error("Напишите пару слов, что не получилось");
    setBusy(true);
    try {
      let image_uri = "";
      if (file) {
        const uploaded = await base44.integrations.Core.UploadPrivateFile({ file });
        image_uri = uploaded.file_uri;
      }
      await base44.entities.Feedback.create({
        kind,
        message: message.trim(),
        page: path,
        device,
        image_uri,
        status: "new",
        user_email: user?.email || "",
        user_name: user?.full_name || "",
      });
      base44.analytics.track({ eventName: "feedback_submitted", properties: { kind } });
      toast.success("Спасибо, отчёт ушёл — он появился в списке «Отчёты»");
      reset();
      onOpenChange(false);
    } catch (error) {
      toast.error(String(error.message || error).slice(0, 200));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto border-border bg-[hsl(var(--card))]">
        <DialogHeader>
          <DialogTitle className="text-[17px]">Что не получилось?</DialogTitle>
          <DialogDescription className="text-[12.5px] leading-relaxed text-muted-foreground">
            Опишите своими словами. Страница, где вы нажали кнопку, приложится сама — автор увидит отчёт и починит.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-1.5 sm:grid-cols-3">
          {KINDS.map((item) => (
            <button
              key={item.id}
              onClick={() => setKind(item.id)}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-2 text-[12px] transition-colors",
                kind === item.id
                  ? "border-[hsl(var(--primary))]/60 bg-[hsl(var(--primary))]/10 text-foreground"
                  : "border-border/70 text-muted-foreground hover:text-foreground",
              )}
            >
              <item.icon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{item.label}</span>
            </button>
          ))}
        </div>

        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={5}
          maxLength={2000}
          placeholder="Например: нажал «Собрать план», крутилось и ничего не появилось"
          className="w-full resize-none rounded-lg border border-border bg-[hsl(var(--input))]/30 px-3 py-2.5 text-[13px] leading-relaxed outline-none transition-colors focus:border-[hsl(var(--primary))]/50"
        />

        <div className="flex items-center justify-between gap-3">
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[12px] text-muted-foreground transition-colors hover:text-foreground">
            <ImagePlus className="h-3.5 w-3.5" /> скриншот
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </label>
          {preview && (
            <span className="relative">
              <img src={preview} alt="скриншот" className="h-10 w-14 rounded-md border border-border object-cover" />
              <button
                onClick={() => setFile(null)}
                className="absolute -right-1.5 -top-1.5 grid h-4 w-4 place-items-center rounded-full bg-[hsl(var(--card))] text-muted-foreground ring-1 ring-border"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          )}
          <button
            onClick={send}
            disabled={busy}
            className="ml-auto inline-flex items-center gap-2 rounded-lg bg-[hsl(var(--primary))] px-4 py-2 text-[13px] font-medium text-[hsl(var(--primary-foreground))] transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Отправить
          </button>
        </div>
        <p className="text-[10.5px] leading-relaxed text-muted-foreground">
          Скриншот хранится приватно (stored privately) — открыть его может только автор приложения.
        </p>
      </DialogContent>
    </Dialog>
  );
}