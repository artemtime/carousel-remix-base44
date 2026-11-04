import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, Loader2, KeyRound } from "lucide-react";
import { toast } from "sonner";
import PageHeader from "@/components/PageHeader";
import { useSettings } from "@/hooks/use-settings";
import ImageModelPicker from "@/components/ImageModelPicker";

export const Route = createFileRoute("/_authed/settings")({
  head: () => ({ meta: [{ title: "Настройки — Цифровые сотрудники" }] }),
  component: SettingsPage,
});

const DAYS = ["понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье"];
const ZONES = ["Europe/Moscow", "Europe/Kaliningrad", "Europe/Kyiv", "Europe/Berlin", "Europe/Lisbon", "Asia/Almaty", "Asia/Tbilisi", "Asia/Dubai", "UTC"];

function SettingsPage() {
  const { settings, loading, save } = useSettings();
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings && !form) setForm(settings);
  }, [settings, form]);

  if (loading || !form) return <p className="px-6 py-10 text-[12.5px] text-muted-foreground">Загружаю…</p>;

  const set = (patch) => setForm({ ...form, ...patch });

  const submit = async () => {
    setSaving(true);
    try {
      await save({
        instagram_handle: (form.instagram_handle || "").replace(/^@/, ""),
        codeword: form.codeword,
        gift: form.gift,
        blog_topic: form.blog_topic,
        text_mode: form.text_mode,
        image_model: form.image_model || "automatic",
        digest_day: Number(form.digest_day),
        digest_hour: Number(form.digest_hour),
        timezone: form.timezone,
        scout_limit: Number(form.scout_limit) || 40,
        max_image_requests_per_carousel: Math.max(1,Math.min(200,Number(form.max_image_requests_per_carousel)||80)),
      });
      toast.success("Настройки сохранены");
    } catch (e) {
      toast.error(String(e.message || e).slice(0, 200));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fade-in">
      <PageHeader
        eyebrow="настройки"
        title="Ваш голос"
        description="Ник, кодовое слово и подарок подставляются в каждую карусель. Расписание — для недельной разведки."
        actions={
          <button
            onClick={submit}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-[hsl(var(--primary))] px-3.5 py-2 text-[13px] font-medium text-[hsl(var(--primary-foreground))] disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Сохранить
          </button>
        }
      />

      <div className="grid gap-5 px-5 py-6 md:px-8 lg:grid-cols-2">
        <Link to="/editorial" className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-[13px] lg:col-span-2">Задание, режимы самостоятельности и общие лимиты теперь находятся в разделе «Редакция» →</Link>
        <section className="rounded-xl border border-border/70 bg-[hsl(var(--card))] p-4">
          <p className="mb-3 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">профиль</p>
          <div className="space-y-3">
            <Field label="Ваш ник в Instagram">
              <input value={form.instagram_handle || ""} onChange={(e) => set({ instagram_handle: e.target.value })} placeholder="без @" className={inputClass} />
            </Field>
            <Field label="Кодовое слово">
              <input value={form.codeword || ""} onChange={(e) => set({ codeword: e.target.value })} placeholder="ХОЧУ" className={inputClass} />
            </Field>
            <Field label="Подарок за кодовое слово">
              <input value={form.gift || ""} onChange={(e) => set({ gift: e.target.value })} placeholder="гайд по каруселям" className={inputClass} />
            </Field>
            <Field label="Тема блога">
              <input value={form.blog_topic || ""} onChange={(e) => set({ blog_topic: e.target.value })} placeholder="о чём вы пишете" className={inputClass} />
            </Field>
            <Field label="Режим текста">
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { id: "close", label: "близко к оригиналу" },
                  { id: "own", label: "своими словами" },
                ].map((m) => (
                  <button
                    key={m.id}
                    onClick={() => set({ text_mode: m.id })}
                    className={[
                      "rounded-md border px-2 py-1.5 text-[11.5px] transition-colors",
                      form.text_mode === m.id ? "border-[hsl(var(--primary))]/60 bg-[hsl(var(--primary))]/10" : "border-border/70 text-muted-foreground",
                    ].join(" ")}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </Field>
          </div>
        </section>

        <section className="space-y-5">
          <div className="rounded-xl border border-border/70 bg-[hsl(var(--card))] p-4">
            <p className="mb-3 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">недельная разведка</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="День">
                <select value={Number(form.digest_day) || 1} onChange={(e) => set({ digest_day: Number(e.target.value) })} className={inputClass}>
                  {DAYS.map((d, i) => (
                    <option key={d} value={i + 1}>
                      {d}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Час">
                <select value={Number.isInteger(Number(form.digest_hour)) ? Number(form.digest_hour) : 9} onChange={(e) => set({ digest_hour: Number(e.target.value) })} className={inputClass}>
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>
                      {String(i).padStart(2, "0")}:00
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Field label="Часовой пояс">
                <select value={form.timezone || "Europe/Moscow"} onChange={(e) => set({ timezone: e.target.value })} className={inputClass}>
                  {ZONES.map((z) => (
                    <option key={z} value={z}>
                      {z}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Постов на проверку">
                <input
                  type="number"
                  min={10}
                  max={80}
                  value={form.scout_limit || 40}
                  onChange={(e) => set({ scout_limit: Number(e.target.value) })}
                  className={inputClass}
                />
              </Field>
            </div>
            <p className="mt-3 text-[11.5px] leading-relaxed text-muted-foreground">
              Раз в неделю Разведчик проверяет список авторов и приносит до 3 хитов с каждого. Показанное не повторяется.
            </p>
          </div>

          <div className="rounded-xl border border-border/70 bg-[hsl(var(--card))] p-4">
            <Field label="Максимум рисунков на одну карусель">
              <input type="number" min={1} max={200} value={form.max_image_requests_per_carousel ?? 80} onChange={e=>set({max_image_requests_per_carousel:Number(e.target.value)})} className={inputClass} />
            </Field>
            <p className="mt-2 text-[11.5px] text-muted-foreground">Общий лимит включает автоматические исправления и повторные запуски. Достигнув лимита, рисование остановится, а готовые кадры сохранятся.</p>
          </div>
          <div className="rounded-xl border border-border/70 bg-[hsl(var(--card))] p-4">
            <ImageModelPicker label="Модель рисования по умолчанию" value={form.image_model || "automatic"} onChange={image_model => set({image_model})} />
            <p className="mt-3 text-[11.5px] leading-relaxed text-muted-foreground">Используется в новых каруселях и при создании листа героя. В каждой карусели можно выбрать другую модель. Генерации расходуют кредиты приложения; надписи по-прежнему рисует код.</p>
          </div>
          <div className="rounded-xl border border-border/70 bg-[hsl(var(--card))] p-4">
            <p className="mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
              <KeyRound className="h-3.5 w-3.5" /> ключи и доступы
            </p>
            <ul className="space-y-1.5 text-[11.5px] leading-relaxed text-muted-foreground">
              <li>
                <span className="text-foreground">APIFY_TOKEN</span> — ключ Apify для разведки. Добавляется в разделе Secrets приложения, в интерфейс не попадает.
              </li>
              <li>Картинки рисует платформа, отдельных ключей не нужно.</li>
              <li>Telegram-бот подключается к агенту приложения из редактора.</li>
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}

const inputClass =
  "h-8 w-full rounded-md border border-border bg-[hsl(var(--input))]/40 px-2.5 text-[12px] outline-none placeholder:text-muted-foreground focus:border-[hsl(var(--primary))]/50";

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
