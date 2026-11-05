import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Palette, Plus, Trash2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import SlideCanvas from "@/components/SlideCanvas";
import NewTextStyleButton from "@/components/styles/NewTextStyleButton";
import NewStyleDialog from "@/components/styles/NewStyleDialog";

export const Route = createFileRoute("/_authed/styles/")({
  head: () => ({ meta: [{ title: "Мои стили — Цифровые сотрудники" }] }),
  component: StylesPage,
});

function StylesPage() {
  const navigate = useNavigate();
  const [styles, setStyles] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const page = await base44.entities.MyStyle.list({ sort: "-updated_date", limit: 60 });
    setStyles(page.items || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="fade-in">
      <PageHeader
        eyebrow="библиотека"
        title="Мои стили"
        description="Сохраните шрифты, цвета и оформление для следующих каруселей. Для текста герой не нужен; для иллюстраций можно добавить своего персонажа."
        actions={<div className="flex flex-wrap gap-2"><NewTextStyleButton onCreated={record=>navigate({to:"/styles/$styleId",params:{styleId:record.id}})}/>
          <button
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-[hsl(var(--primary))] px-3.5 py-2 text-[13px] font-medium text-[hsl(var(--primary-foreground))] transition-opacity hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Новый стиль
          </button></div>
        }
      />

      <div className="px-5 py-6 md:px-8">
        {loading ? (
          <p className="text-[12.5px] text-muted-foreground">Загружаю…</p>
        ) : styles.length === 0 ? (
          <EmptyState icon={Palette} title="Стилей пока нет" description="Снимите стиль с чужой карусели: пропорции, манера рисования, шрифт подписей и герой.">
            <button onClick={() => setOpen(true)} className="rounded-lg bg-[hsl(var(--primary))] px-3.5 py-2 text-[12.5px] font-medium text-[hsl(var(--primary-foreground))]">
              Снять первый стиль
            </button>
          </EmptyState>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {styles.map((style) => (
              <div key={style.id} className="group overflow-hidden rounded-xl border border-border/70 bg-[hsl(var(--card))]">
                <Link to="/styles/$styleId" params={{ styleId: style.id }} className="block bg-[hsl(var(--muted))] p-3">
                  <SlideCanvas
                    slide={{ text: `${style.name}\n==так выглядит== подпись`, image_url: style.hero_sheet_url }}
                    profile={style.caption}
                    aspect={style.aspect}
                    width={320}
                  />
                </Link>
                <div className="border-t border-border/60 px-3.5 py-3">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-medium">{style.name}</p>
                      <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
                        @{style.author_handle || "—"} · {style.hero?.name || "без героя"} · {(style.rules || []).length} правил
                      </p>
                    </div>
                    <button
                      onClick={async () => {
                        await base44.entities.MyStyle.delete(style.id);
                        load();
                      }}
                      className="rounded p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/15 hover:text-destructive-foreground group-hover:opacity-100"
                      title="Удалить"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <button
                    onClick={() => navigate({ to: "/styles/$styleId", params: { styleId: style.id } })}
                    className="mt-2.5 w-full rounded-md border border-border px-2.5 py-1.5 text-[11.5px] transition-colors hover:bg-[hsl(var(--accent))]"
                  >
                    Открыть стиль
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <NewStyleDialog open={open} onOpenChange={setOpen} onCreated={(record) => navigate({ to: "/styles/$styleId", params: { styleId: record.id } })} />
    </div>
  );
}