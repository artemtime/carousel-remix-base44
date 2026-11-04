// Сохранение находки Разведчика в библиотеки: стиль и/или персонаж.
import { base44 } from "@/api/base44Client";
import { normalizeProfile } from "@/lib/slide-renderer";
import { saveHeroToLibrary } from "@/lib/heroes";

export async function saveFromHit({ hit, analyze, passport, wantStyle, wantHero }) {
  const pics = ((hit.images || []).length ? hit.images : hit.thumb ? [hit.thumb] : []).filter(Boolean).slice(0, 8);
  if (!pics.length) throw new Error("У этого поста нет картинок — разбирать нечего");

  const analysis = await analyze({ data: { images: pics } });
  const handle = String(hit.handle || "").replace(/^@/, "");

  let style = null;
  if (wantStyle) {
    style = await base44.entities.MyStyle.create({
      name: `${handle || "чужой"} · ${analysis.font_kind || "стиль"}`.slice(0, 110),
      author_handle: handle,
      aspect: analysis.aspect || "4:5",
      art_style: analysis.art_style || "",
      caption: normalizeProfile(analysis.caption || {}),
      world: "",
      rules: [],
      font_kind: analysis.font_kind || "",
      source_slide_urls: pics.slice(0, 6),
    });
  }

  let hero = null;
  if (wantHero) {
    const raw = analysis.competitor_character;
    if (!raw) throw new Error("На кадрах не нашлось персонажа — сохраните только стиль");
    const passportHero = await passport({ data: { raw } });
    hero = await saveHeroToLibrary({ hero: passportHero, art_style: analysis.art_style });
    if (style) await base44.entities.MyStyle.update(style.id, { hero_id: hero.id, hero: passportHero });
  }

  return { style, hero };
}