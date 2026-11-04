import { loadFonts, familyOf } from "@/lib/fonts";
import { sourceLettering } from "@/lib/reference-lettering";
import { measuredScrims } from "@/lib/reference-scrims";
import { repairCard } from "@/lib/reference-check";
import { fitReferenceText } from "@/lib/reference-text-layout";

// Промежуток между двумя кадрами одной карточки закрываем: иначе на стыке
// остаётся полоса фона (обычно чёрная) — она и читается как разделитель.
function sealedBounds(panels) {
  const boxes = panels.map((panel) => ({ ...panel.bounds }));
  if (boxes.length !== 2) return boxes;
  const [a, b] = boxes;
  const gapY = b.y - (a.y + a.h);
  const gapX = b.x - (a.x + a.w);
  const sameWidth = Math.abs(a.x - b.x) < 0.02 && Math.abs(a.w - b.w) < 0.02;
  const sameHeight = Math.abs(a.y - b.y) < 0.02 && Math.abs(a.h - b.h) < 0.02;
  if (sameWidth && gapY > 0 && gapY < 0.25) {
    // Стык двух кадров проходит ровно посередине зазора.
    a.h += gapY / 2;
    b.y -= gapY / 2;
    b.h += gapY / 2;
  } else if (sameHeight && gapX > 0 && gapX < 0.25) {
    a.w += gapX / 2;
    b.x -= gapX / 2;
    b.w += gapX / 2;
  }
  return boxes;
}

function rgba(hex, alpha) {
  const clean = String(hex || "#000000").replace("#", "").trim();
  const full = clean.length === 3 ? clean.split("").map((part) => part + part).join("") : clean;
  const num = parseInt(full, 16);
  if (!Number.isFinite(num)) return `rgba(0,0,0,${alpha})`;
  return `rgba(${(num >> 16) & 255},${(num >> 8) & 255},${num & 255},${Math.max(0, Math.min(1, alpha))})`;
}

// Затемнение под подписью, снятое с оригинала: без него текст теряется на иллюстрации.
function drawScrims(ctx, scrims, W, H) {
  for (const scrim of scrims) {
    const b = scrim.bounds;
    const x = b.x * W;
    const y = b.y * H;
    const w = Math.max(1, b.w * W);
    const h = Math.max(1, b.h * H);
    const opacity = Math.max(0, Math.min(1, Number(scrim.opacity ?? 0.45)));
    let fill;
    if (scrim.stops?.length) {
      fill = ctx.createLinearGradient(0, y, 0, y + h);
      scrim.stops.forEach((stop) => fill.addColorStop(stop.at, rgba(scrim.color, stop.opacity)));
    } else if (scrim.fade === "top" || scrim.fade === "bottom") {
      fill = ctx.createLinearGradient(0, y, 0, y + h);
      fill.addColorStop(0, rgba(scrim.color, scrim.fade === "top" ? 0 : opacity));
      fill.addColorStop(1, rgba(scrim.color, scrim.fade === "top" ? opacity : 0));
    } else {
      fill = rgba(scrim.color, opacity);
    }
    ctx.save();
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  }
}

export default async function renderReferenceCard(canvas, options, helpers) {
  // Перед отрисовкой подписи всегда проверяются: рамки разводятся, кегли подгоняются.
  const { referenceCard: raw, imageUrl, imageUrl2, proxy } = options;
  const card = repairCard(raw);
  const [aw, ah] = card.aspect.split(":").map(Number);
  const W = 1080, H = Math.round(W * ah / aw);
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = card.background || "#101014"; ctx.fillRect(0, 0, W, H);
  const [images, original] = await Promise.all([
    Promise.all([imageUrl, imageUrl2].map((url) => helpers.loadImage(url, proxy))),
    card.lettering_version === 1 ? helpers.loadImage(card.reference_url, proxy) : null,
  ]);
  const boxes = sealedBounds(card.panels);
  boxes.forEach((b, i) => {
    const x = b.x * W, y = b.y * H, w = b.w * W, h = b.h * H;
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    if (images[i]) helpers.coverImage(ctx, images[i], x, y, w, h, card.panels[i].image_align_y ?? .5);
    else helpers.drawPlaceholder(ctx, x, y, w, h);
    ctx.restore();
  });
  const scrims = measuredScrims(card, original, boxes);
  drawScrims(ctx, scrims, W, H);
  const lettering = card.text_blocks.map((block) => sourceLettering(original, block));
  await Promise.all(card.text_blocks.map((block, i) => lettering[i] ? null : loadFonts(block.font, block.weight, block.weight)));
  for (const [index, block] of card.text_blocks.entries()) {
    const letters = lettering[index];
    if (letters) {
      const b = letters.bounds;
      ctx.drawImage(letters.canvas, b.x * W, b.y * H, b.w * W, b.h * H);
      continue;
    }
    const b = block.bounds, family = familyOf(block.font);
    const width = b.w * W, height = b.h * H, leading = block.line_height || 1.15;
    const { size, lines } = fitReferenceText(ctx, {
      text: block.text, maxSize: block.font_size * H, width, height, lineHeight: leading,
      font: value => helpers.fontString(block.weight, value, family),
    });
    ctx.save(); ctx.font = helpers.fontString(block.weight, size, family);
    ctx.fillStyle = block.color; ctx.textAlign = block.align; ctx.textBaseline = "alphabetic";
    if (block.shadow) { ctx.shadowColor = "rgba(0,0,0,.78)"; ctx.shadowBlur = size * .3; ctx.shadowOffsetY = size * .02; }
    const ink = ctx.measureText("Ддбру");
    const ascent = ink.actualBoundingBoxAscent || size * .8;
    const descent = ink.actualBoundingBoxDescent || size * .2;
    const total = ascent + descent + Math.max(0, lines.length - 1) * size * leading;
    const x = (b.x + (block.align === "center" ? b.w / 2 : block.align === "right" ? b.w : 0)) * W;
    const top = b.y * H + (height - total) / 2;
    lines.forEach((line, i) => ctx.fillText(line, x, top + ascent + i * size * leading));
    ctx.restore();
  }
}