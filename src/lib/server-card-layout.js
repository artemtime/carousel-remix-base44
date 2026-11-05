import { fitCaption, captionArea, captionTop } from "./caption-layout.js";

export function xml(value) { return String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]); }
export function safeColor(value, fallback = "#FFFFFF") {
  return /^(#[a-f\d]{3,8}|rgba?\([\d\s.,%]+\)|[a-z]{1,20})$/i.test(String(value || "")) ? value : fallback;
}
export function measuredFontContext(fontForWeight) {
  return { font: '400 64px "font"', measureText(text) {
    const match = /^(\d+)\s+(\d+)px/.exec(this.font);
    const font = fontForWeight(Number(match?.[1] || 400)), size = Number(match?.[2] || 64);
    for (const c of text) if (!/\s/.test(c) && !font.charToGlyphIndex(c)) throw new Error(`В выбранном шрифте нет символа «${c}»`);
    const path = font.getPath(text, 0, 0, size), box = path.getBoundingBox();
    return { width: font.getAdvanceWidth(text, size), actualBoundingBoxAscent: Math.max(0, -box.y1), actualBoundingBoxDescent: Math.max(0, box.y2) };
  } };
}
export function captionSvg(text, profile, fontForWeight, width, height, id) {
  const p = profile, area = captionArea(width, height, p.placement, p);
  const layout = fitCaption(measuredFontContext(fontForWeight), text, p, "font", { width: area.width, height: area.height, startSize: Math.round(p.size * width / 1080), maxLines:p.text_only?24:3, minSize: Math.max(18, Math.round(width * .022)) });
  const strip = p.placement === "strip" ? height * p.strip_height : 0;
  const center = p.placement === "strip" ? height - strip / 2 : p.placement === "band" ? height - height * p.band_height / 2 : height * p.position;
  const top = captionTop(area, layout.total, center);
  const paths = [];
  for (const [lineIndex, line] of layout.lines.entries()) {
    let x = -line.width / p.squeeze / 2;
    const baseline = top + lineIndex * layout.lineHeight + layout.ascent;
    for (const token of line.tokens) {
      const path = fontForWeight(token.weight).getPath(token.text, x, 0, token.size).toPathData(3);
      paths.push(`<path d="${path}" fill="${xml(safeColor(token.accent ? p.accent : p.color))}" transform="translate(${width / 2} ${baseline}) scale(${p.squeeze} 1)"/>`);
      x += token.w / p.squeeze;
    }
  }
  let backdrop = "";
  if (p.placement === "strip") backdrop = `<rect x="0" y="${height - strip}" width="${width}" height="${strip}" fill="${xml(safeColor(p.strip_bg))}"/>`;
  const scrim = Math.max(0, Math.min(.95, Number(p.scrim_opacity ?? (p.shadow === false ? 0 : .7))));
  if (p.placement === "band" || scrim) {
    const start = Math.max(0, top - layout.size * 1.2);
    backdrop += `<defs><linearGradient id="shade-${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="${p.placement === "band" ? .85 : scrim}"/></linearGradient></defs><rect x="0" y="${start}" width="${width}" height="${height - start}" fill="url(#shade-${id})"/>`;
  }
  // Paths use the same measured glyphs as fitting: no font fallback can overflow the PNG.
  const body = paths.join("");
  const shadow = p.shadow || p.glow > 0 ? `<g transform="translate(0 2)" stroke="#000" stroke-opacity=".65" stroke-width="${Math.max(1, layout.size * .045)}" stroke-linejoin="round">${body}</g>` : "";
  return { svg: backdrop + shadow + body, layout, area };
}
export function ownCardSvg(card, images, profile, fontForWeight) {
  if (card?.visual_mode !== "own" || !card.panels?.length || card.panels.length > 2) throw new Error("Серверная сборка доступна для карточек в своём стиле");
  const [w, h] = card.aspect.split(":").map(Number), W = 1080, H = Math.round(W * h / w);
  if (!(H >= 400 && H <= 3000)) throw new Error("Неверные пропорции карточки");
  const content = [];
  for (const [index, panel] of card.panels.entries()) {
    const p={...profile,...card.own_caption_overrides?.[index]};
    const image = images[index];
    if (!image?.href?.startsWith("data:image/") || !(image.width > 0 && image.height > 0)) throw new Error("Не загрузился рисунок кадра");
    const b = panel.bounds, x = Math.round(b.x * W), y = Math.round(b.y * H), width = Math.round(b.w * W), height = Math.round((b.y + b.h) * H) - y;
    if (panel.trim_footer) throw new Error("Для кадра с ручной обрезкой полосы используйте обычную сборку в Авторе");
    const picHeight = p.placement === "strip" ? height * (1 - p.strip_height) : height;
    const scale = Math.max(width / image.width, picHeight / image.height), iw = image.width * scale, ih = image.height * scale;
    const text = card.text_blocks.filter(t => (t.panel_index ?? 0) === index).map(t => t.text).filter(Boolean).join("\n\n");
    const caption = text ? captionSvg(text, p, fontForWeight, width, height, index) : { svg: "" };
    content.push(`<svg x="${x}" y="${y}" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" overflow="hidden"><image href="${image.href}" x="${(width - iw) / 2}" y="${(picHeight - ih) * Math.max(0, Math.min(1, panel.image_align_y ?? .5))}" width="${iw}" height="${ih}"/>${caption.svg}</svg>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${content.join("")}</svg>`;
}
