import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Check, Loader2, Plus, Trash2, UserRound, ImagePlus } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import SlideCanvas from "@/components/SlideCanvas";
import { Image } from "@/components/ui/image";
import TypographyEditor from "@/components/styles/TypographyEditor";
import SelectHeroReference from "@/components/heroes/SelectHeroReference";
import TextStyleEditor from "@/components/styles/TextStyleEditor";
import HeroPicker from "@/components/heroes/HeroPicker";
import { makeHeroSheet } from "@/lib/author";
import { heroPassport, saveHeroToLibrary } from "@/lib/heroes";
import { normalizeProfile, profileForRole } from "@/lib/slide-renderer";

export const Route = createFileRoute("/_authed/styles/$styleId")({
  head: () => ({ meta: [{ title: "Стиль — Цифровые сотрудники" }] }),
  component: StyleDetailPage,
});

function StyleDetailPage() {
  const { styleId } = Route.useParams();
  const sheetFn = useServerFn(makeHeroSheet);
  const [style, setStyle] = useState(null);
  const [saving, setSaving] = useState("");
  const [rule, setRule] = useState("");
  const [roleTab, setRoleTab] = useState("base");
  const [portraitUri, setPortraitUri] = useState("");
  const [portraitUrl, setPortraitUrl] = useState("");
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    const record = await base44.entities.MyStyle.get(styleId);
    setStyle({ ...record, caption: normalizeProfile(record.caption) });
    const uri = record.hero?.portrait_uri || "";
    setPortraitUri(uri);
    if (uri) {
      base44.integrations.Core.CreateFileSignedUrl({ file_uri: uri })
        .then(({ signed_url }) => setPortraitUrl(signed_url))
        .catch(() => setPortraitUrl(""));
    } else {
      setPortraitUrl("");
    }
  }, [styleId]);

  useEffect(() => {
    load();
  }, [load]);

  const patch = (next) => setStyle((prev) => ({ ...prev, ...next }));

  const persist = async (label, extra) => {
    setSaving(label);
    try {
      await base44.entities.MyStyle.update(styleId, {
        content_format:style.content_format || "illustrated",
        background:style.background || "",
        name: style.name,
        art_style: style.art_style,
        aspect: style.aspect,
        caption: style.caption,
        typography: style.typography || {},
        world: style.world,
        rules: style.rules || [],
        hero: style.hero,
        hero_id: style.hero_id || "",
        hero_sheet_url: style.hero_sheet_url || "",
        ...extra,
      });
      toast.success("Сохранено");
    } catch (e) {
      toast.error(String(e.message || e).slice(0, 200));
    } finally {
      setSaving("");
    }
  };

  const generateSheet = async () => {
    if (!style.hero?.description) return toast.error("Сначала опишите героя");
    setSaving("sheet");
    try {
      const signed = portraitUri ? await base44.integrations.Core.CreateFileSignedUrl({ file_uri: portraitUri }) : null;
      const url = await sheetFn({ data: { art_style: style.art_style, hero: style.hero, reference: signed?.signed_url || style.hero?.identity_reference_url || undefined } });
      patch({ hero_sheet_url: url });
      await base44.entities.MyStyle.update(styleId, { hero_sheet_url: url });
      toast.success("Лист героя готов — все картинки будут в нём");
    } catch (e) {
      toast.error(String(e.message || e).slice(0, 200));
    } finally {
      setSaving("");
    }
  };

  const uploadPortrait = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file });
      const { signed_url } = await base44.integrations.Core.CreateFileSignedUrl({ file_uri });
      setPortraitUri(file_uri);
      setPortraitUrl(signed_url);
      patch({ hero: { ...style.hero, portrait_uri: file_uri } });
      toast.success("Портрет-референс загружен — соберите по нему лист героя");
    } catch (e) {
      toast.error(String(e.message || e).slice(0, 200));
    } finally {
      setUploading(false);
    }
  };

  const pickHero = (id, record) => {
    if (!record) return patch({ hero_id: "" });
    patch({ hero_id: id, hero: heroPassport(record), hero_sheet_url: record.sheet_url || "" });
  };

  const saveHero = async () => {
    if (!style.hero?.description) return toast.error("Сначала опишите героя");
    setSaving("hero");
    try {
      const record = await saveHeroToLibrary({ hero: style.hero, sheet_url: style.hero_sheet_url, art_style: style.art_style });
      patch({ hero_id: record.id });
      toast.success(`«${record.name}» теперь в библиотеке героев`);
    } catch (e) {
      toast.error(String(e.message || e).slice(0, 200));
    } finally {
      setSaving("");
    }
  };

  const addRule = () => {
    const value = rule.trim();
    if (!value) return;
    patch({ rules: [...(style.rules || []), value] });
    setRule("");
  };

  if (!style) return <p className="px-6 py-10 text-[12.5px] text-muted-foreground">Загружаю стиль…</p>;

  if(style.content_format === "text")return <TextStyleEditor style={style} onChange={patch} saving={saving} onSave={()=>persist("save")}/>;
  return (
    <div className="fade-in">
      <div className="flex flex-wrap items-center gap-3 border-b border-border/70 px-5 py-4 md:px-8">
        <Link to="/styles" className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> стили
        </Link>
        <input
          value={style.name}
          onChange={(e) => patch({ name: e.target.value })}
          className="min-w-0 flex-1 bg-transparent text-[18px] font-semibold tracking-tight outline-none"
        />
        <button
          onClick={() => persist("save")}
          className="inline-flex items-center gap-2 rounded-lg bg-[hsl(var(--primary))] px-3.5 py-2 text-[12.5px] font-medium text-[hsl(var(--primary-foreground))] disabled:opacity-50"
          disabled={saving === "save"}
        >
          {saving === "save" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Сохранить
        </button>
      </div>

      <div className="grid gap-6 px-5 py-6 md:px-8 lg:grid-cols-[320px_1fr]">
        <div className="space-y-4">
          <SlideCanvas
            slide={{ text: `${style.name}\n==так выглядит== подпись`, image_url: style.hero_sheet_url }}
            profile={roleTab === "base" ? normalizeProfile(style.caption) : profileForRole(style, roleTab)}
            aspect={style.aspect}
            width={320}
            showDownload
            downloadName="стиль.png"
          />
          <div className="rounded-xl border border-border/70 bg-[hsl(var(--card))] p-3.5">
            <p className="mb-2 text-[12px] font-medium">Пропорции слайда</p>
            <div className="grid grid-cols-3 gap-1.5">
              {["4:5", "3:4", "1:1"].map((a) => (
                <button
                  key={a}
                  onClick={() => patch({ aspect: a })}
                  className={[
                    "rounded-md border px-2 py-1.5 text-[11.5px] transition-colors",
                    style.aspect === a ? "border-[hsl(var(--primary))]/60 bg-[hsl(var(--primary))]/10" : "border-border/70 text-muted-foreground hover:text-foreground",
                  ].join(" ")}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-border/70 bg-[hsl(var(--card))] p-3.5">
            <p className="mb-2 flex items-center gap-1.5 text-[12px] font-medium">
              <UserRound className="h-3.5 w-3.5" /> Персонаж
            </p>
            <div className="mb-2.5 flex items-center gap-2">
              {portraitUrl ? (
                <Image src={portraitUrl} alt="портрет героя" fittingType="cover" className="h-12 w-12 rounded-md border border-border/70" />
              ) : (
                <div className="grid h-12 w-12 place-items-center rounded-md border border-dashed border-border text-muted-foreground">
                  <UserRound className="h-4 w-4" />
                </div>
              )}
              <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-border px-2 text-[11.5px] hover:bg-[hsl(var(--accent))]">
                {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
                {portraitUri ? "Заменить портрет" : "Портрет-референс"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => {
                    uploadPortrait(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
            <div className="space-y-2">
              <input
                value={style.hero?.name || ""}
                onChange={(e) => patch({ hero: { ...style.hero, name: e.target.value } })}
                placeholder="имя героя"
                className="h-8 w-full rounded-md border border-border bg-[hsl(var(--input))]/40 px-2 text-[12px] outline-none"
              />
              <textarea
                value={style.hero?.description || ""}
                onChange={(e) => patch({ hero: { ...style.hero, description: e.target.value } })}
                rows={3}
                placeholder="внешность без слов про одежду"
                className="w-full resize-none rounded-md border border-border bg-[hsl(var(--input))]/40 px-2 py-1.5 text-[11.5px] leading-relaxed outline-none"
              />
              <input
                value={style.hero?.default_outfit || ""}
                onChange={(e) => patch({ hero: { ...style.hero, default_outfit: e.target.value } })}
                placeholder="одежда по умолчанию"
                className="h-8 w-full rounded-md border border-border bg-[hsl(var(--input))]/40 px-2 text-[11.5px] outline-none"
              />
              <input
                value={(style.hero?.never_change || []).join(", ")}
                onChange={(e) => patch({ hero: { ...style.hero, never_change: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) } })}
                placeholder="что нельзя менять никогда"
                className="h-8 w-full rounded-md border border-border bg-[hsl(var(--input))]/40 px-2 text-[11.5px] outline-none"
              />
            </div>
            <button
              onClick={generateSheet}
              disabled={saving === "sheet"}
              className="mt-2.5 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-border px-2 py-1.5 text-[11.5px] hover:bg-[hsl(var(--accent))] disabled:opacity-50"
            >
              {saving === "sheet" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
              {style.hero_sheet_url ? "Пересобрать лист" : "Собрать лист героя"}
            </button>

            {style.hero_sheet_url && (
              <div className="mt-2.5 overflow-hidden rounded-md border border-border/70 bg-[hsl(var(--muted))]">
                <Image src={style.hero_sheet_url} alt="лист героя" fittingType="fit" className="w-full" />
              </div>
            )}

            <div className="mt-3 space-y-2 border-t border-border/70 pt-2.5">
              <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">библиотека героев</p>
            <SelectHeroReference style={style} onSaved={load} />
              <HeroPicker value={style.hero_id} onChange={pickHero} />
              <button
                onClick={saveHero}
                disabled={saving === "hero"}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-border px-2 py-1.5 text-[11.5px] hover:bg-[hsl(var(--accent))] disabled:opacity-50"
              >
                {saving === "hero" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} этого героя в библиотеку
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <section className="rounded-xl border border-border/70 bg-[hsl(var(--card))] p-4">
            <label className="block">
              <span className="mb-1.5 block text-[11px] uppercase tracking-[0.12em] text-muted-foreground">как рисуем</span>
              <textarea
                value={style.art_style || ""}
                onChange={(e) => patch({ art_style: e.target.value })}
                rows={3}
                className="w-full resize-none rounded-lg border border-border bg-[hsl(var(--input))]/40 px-3 py-2 text-[12.5px] leading-relaxed outline-none focus:border-[hsl(var(--primary))]/50"
              />
            </label>
            <label className="mt-3 block">
              <span className="mb-1.5 block text-[11px] uppercase tracking-[0.12em] text-muted-foreground">мир стиля</span>
              <textarea
                value={style.world || ""}
                onChange={(e) => patch({ world: e.target.value })}
                rows={3}
                placeholder="2–4 предложения: где живёт герой, что вокруг него, какие декорации повторяются"
                className="w-full resize-none rounded-lg border border-border bg-[hsl(var(--input))]/40 px-3 py-2 text-[12.5px] leading-relaxed outline-none focus:border-[hsl(var(--primary))]/50"
              />
            </label>
          </section>

          <section className="rounded-xl border border-border/70 bg-[hsl(var(--card))] p-4">
            <p className="mb-3 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">подпись по ролям</p>
            <TypographyEditor
              base={style.caption}
              typography={style.typography}
              role={roleTab}
              onRoleChange={setRoleTab}
              onChange={(next) => patch(next)}
            />
          </section>

          <section className="rounded-xl border border-border/70 bg-[hsl(var(--card))] p-4">
            <p className="mb-2 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">правила Автора</p>
            <p className="mb-3 text-[11.5px] leading-relaxed text-muted-foreground">Каждое правило Автор соблюдает во всех следующих каруселях этого стиля.</p>
            <div className="flex gap-2">
              <input
                value={rule}
                onChange={(e) => setRule(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addRule()}
                placeholder="например: герой никогда не улыбается"
                className="h-8 flex-1 rounded-md border border-border bg-[hsl(var(--input))]/40 px-2.5 text-[12px] outline-none focus:border-[hsl(var(--primary))]/50"
              />
              <button onClick={addRule} className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2.5 text-[11.5px] hover:bg-[hsl(var(--accent))]">
                <Plus className="h-3.5 w-3.5" /> добавить
              </button>
            </div>
            <ul className="mt-2.5 space-y-1.5">
              {(style.rules || []).map((r, i) => (
                <li key={i} className="flex items-start gap-2 rounded-md bg-[hsl(var(--muted))]/60 px-2.5 py-1.5">
                  <span className="flex-1 text-[11.5px] leading-snug">{r}</span>
                  <button
                    onClick={() => patch({ rules: style.rules.filter((_, idx) => idx !== i) })}
                    className="rounded p-0.5 text-muted-foreground hover:text-destructive-foreground"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </li>
              ))}
              {(!style.rules || style.rules.length === 0) && <li className="text-[11.5px] text-muted-foreground">Правил пока нет.</li>}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
