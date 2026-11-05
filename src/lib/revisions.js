export const FINAL_RENDER_VERSION = 3;
// Content identities deliberately omit database timestamps and display-only metadata.
export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().filter(k => value[k] !== undefined).map(k => [k, canonical(value[k])]));
  return value;
}
export async function digest(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(canonical(value)));
  const result = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(result), n => n.toString(16).padStart(2, "0")).join("");
}
export function visualContent(style, hero, mode) {
  if(style?.content_format === "text") {style={...style,hero:null,hero_sheet_url:"",source_slide_urls:[]};hero=null;}
  const pick = (item, keys) => Object.fromEntries(keys.map(key => [key, item?.[key]]));
  return {
    mode,
    style: mode === "mirror" ? null : pick(style, ["art_style", "palette", "lighting", "background", "world", "rules", "aspect", "source_slide_urls", "hero_sheet_url"]),
    hero: mode === "mirror" ? null : pick(hero || style?.hero, ["name", "description", "default_outfit", "signature_details", "never_change", "sheet_url", "portrait_url", "identity_reference_url", "identity_bounds"]),
  };
}
export function renderContent(slide, style, mode) {
  return { position: slide.position, role: slide.role, text: slide.text, scene: slide.scene, layout: slide.layout,
    image_url: slide.image_url, image_url_2: slide.image_url_2, reference_card: slide.reference_card,
    ...(slide.final_renderer ? {renderer:slide.final_renderer} : {}),
    caption: mode === "mirror" || mode === "remix" ? null : style?.caption,
    typography: mode === "mirror" || mode === "remix" ? null : style?.typography, aspect: style?.aspect };
}
export async function finalKeys(carousel, slides, style, hero) {
  if(carousel.content_format === "text") {style={...style,content_format:"text",hero:null,hero_sheet_url:""};hero=null;}
  const visuals = visualContent(style, hero, carousel.mode);
  const keys = await Promise.all(slides.map(s => digest({ version: FINAL_RENDER_VERSION, ...renderContent(s, style, carousel.mode), visuals })));
  return { keys, approval: await digest({ version: FINAL_RENDER_VERSION, mode: carousel.mode, language: carousel.language, caption: carousel.caption || "", slides: slides.map((s,i) => ({ id:s.id, key:keys[i] })) }) };
}
export function approvedOutputs(carousel, slides, revision) {
  return Boolean(carousel.approved_key && carousel.approved_key === revision.approval && carousel.approved_caption === (carousel.caption || "") && slides.length === carousel.slides_count && slides.length && slides.every((s,i) => s.final_image_url && s.final_render_key === revision.keys[i] && s.final_check_status === "ok"));
}
