// Герои библиотеки: паспорт для рисования и сохранение нового героя.
import { base44 } from "@/api/base44Client";

export function heroPassport(hero) {
  if (!hero) return null;
  return {
    name: hero.name || "",
    description: hero.description || "",
    default_outfit: hero.default_outfit || "",
    signature_details: hero.signature_details || [],
    never_change: hero.never_change || [],
    identity_reference_url: hero.identity_reference_url || "",
    identity_bounds: hero.identity_bounds || null,
    identity_status: hero.identity_status || "",
  };
}

export function saveHeroToLibrary({ hero, sheet_url, art_style, name }) {
  return base44.entities.Hero.create({
    name: String(name || hero?.name || "герой").slice(0, 80),
    description: hero?.description || "",
    default_outfit: hero?.default_outfit || "",
    signature_details: hero?.signature_details || [],
    never_change: hero?.never_change || [],
    sheet_url: sheet_url || "",
    art_style: art_style || "",
    identity_reference_url: hero?.identity_reference_url || "",
    ...(hero?.identity_bounds ? { identity_bounds: hero.identity_bounds } : {}),
    identity_status: hero?.identity_status || "",
  });
}
