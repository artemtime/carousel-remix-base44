import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import PageHeader from "@/components/PageHeader";
import ReportCard from "@/components/feedback/ReportCard";
import { FEEDBACK_STATUSES } from "@/components/feedback/statuses";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authed/feedback")({
  ssr: false,
  head: () => ({ meta: [{ title: "Отчёты" }] }),
  component: FeedbackPage,
});

function FeedbackPage() {
  const { user, isLoadingAuth } = useAuth();
  const isAdmin = user?.role === "admin";
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      // Автор видит все отчёты, остальные — только свои: так видно, что починили.
      const query = isAdmin ? {} : { created_by_id: user.id };
      const page = await base44.entities.Feedback.filter(query, { sort: "-created_date", limit: 100 });
      setItems(page.items || []);
    } catch (error) {
      toast.error(String(error.message || error).slice(0, 200));
    } finally {
      setLoading(false);
    }
  }, [user?.id, isAdmin]);

  useEffect(() => {
    if (!isLoadingAuth) load();
  }, [isLoadingAuth, load]);

  const counts = useMemo(() => {
    const base = { new: 0, in_progress: 0, fixed: 0, declined: 0 };
    items.forEach((item) => {
      if (base[item.status] !== undefined) base[item.status] += 1;
    });
    return base;
  }, [items]);

  const shown = filter === "all" ? items : items.filter((item) => item.status === filter);
  const total = items.length;

  const patch = async (report, data) => {
    setItems((prev) => prev.map((item) => (item.id === report.id ? { ...item, ...data } : item)));
    try {
      await base44.entities.Feedback.update(report.id, data);
    } catch (error) {
      toast.error(String(error.message || error).slice(0, 180));
      load();
    }
  };

  const changeStatus = (report, status) => {
    if (report.status === status) return;
    patch(report, { status, resolved_at: status === "fixed" || status === "declined" ? new Date().toISOString() : "" });
  };

  const openShot = async (report) => {
    try {
      const { signed_url } = await base44.integrations.Core.CreateFileSignedUrl({ file_uri: report.image_uri, expires_in: 300 });
      window.open(signed_url, "_blank", "noopener");
    } catch (error) {
      toast.error(String(error.message || error).slice(0, 180));
    }
  };

  return (
    <div className="fade-in">
      <PageHeader
        eyebrow="обратная связь"
        title="Отчёты"
        description={
          isAdmin
            ? "Всё, что люди написали из кнопки «Что не получилось?». Меняйте статус — человек увидит ответ у себя в списке."
            : "Здесь ваши отчёты и их статус: видно, что уже исправлено, а что в работе."
        }
      />

      <div className="space-y-4 px-5 py-5 md:px-8">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: "новых", value: counts.new },
            { label: "в работе", value: counts.in_progress },
            { label: "исправлено", value: counts.fixed },
            { label: "всего", value: total },
          ].map((card) => (
            <div key={card.label} className="rounded-xl border border-border/70 bg-[hsl(var(--card))] px-3 py-2.5">
              <p className="text-[19px] font-semibold leading-none">{card.value}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{card.label}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {[{ id: "all", label: "Все" }, ...FEEDBACK_STATUSES].map((item) => (
            <button
              key={item.id}
              onClick={() => setFilter(item.id)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-[12px] transition-colors",
                filter === item.id
                  ? "border-[hsl(var(--primary))]/60 bg-[hsl(var(--primary))]/10 text-foreground"
                  : "border-border/70 text-muted-foreground hover:text-foreground",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="inline-flex items-center gap-2 text-[12.5px] text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Читаю отчёты…
          </p>
        ) : shown.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-5 py-10 text-center">
            <p className="text-[13.5px] font-medium">{total ? "В этом статусе пусто" : "Отчётов пока нет"}</p>
            <p className="mt-1 text-[12px] text-muted-foreground">
              {total ? "Выберите другой статус." : "Кнопка «Что не получилось?» справа внизу — на любой странице."}
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {shown.map((report) => (
              <ReportCard
                key={report.id}
                report={report}
                isAdmin={isAdmin}
                onStatus={changeStatus}
                onNote={(row, note) => note !== (row.admin_note || "") && patch(row, { admin_note: note })}
                onOpenShot={openShot}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}