// Кадр вырезается из оригинала прямо в браузере: модели отдаём ровно один кадр,
// а не всю карточку с двумя кадрами — иначе она рисует разделитель и коллаж.
import { base44 } from "@/api/base44Client";
import { loadImage } from "@/lib/slide-renderer";

// Надписи оригинала размываем прямо в вырезе: иначе модель перерисовывает буквы в кадре.
function maskText(ctx, canvas, blockBounds, sw, sh, x, y, w, h) {
  for (const b of blockBounds) {
    if (!b) continue;
    const bx = b.x * sw - x;
    const by = b.y * sh - y;
    const bw = b.w * sw;
    const bh = b.h * sh;
    if (bx + bw < 0 || by + bh < 0 || bx > w || by > h) continue;
    const pad = Math.round(Math.max(bh, 8) * 0.6);
    ctx.save();
    ctx.beginPath();
    ctx.rect(Math.max(0, bx - pad), Math.max(0, by - pad), Math.min(w, bw + pad * 2), Math.min(h, bh + pad * 2));
    ctx.clip();
    ctx.filter = "blur(18px)";
    ctx.drawImage(canvas, 0, 0);
    ctx.restore();
  }
}

export async function cropPanelForModel({ url, bounds, panelIndex = 0, proxy, textBlocks = [] }) {
  if (!url || !bounds) return "";
  const img = await loadImage(url, proxy);
  if (!img) return "";
  const sw = img.naturalWidth || img.width;
  const sh = img.naturalHeight || img.height;
  if (!sw || !sh) return "";
  const x = Math.max(0, Math.round(bounds.x * sw));
  const y = Math.max(0, Math.round(bounds.y * sh));
  const w = Math.min(sw - x, Math.round(bounds.w * sw));
  const h = Math.min(sh - y, Math.round(bounds.h * sh));
  if (w < 16 || h < 16) return "";
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, x, y, w, h, 0, 0, w, h);
  maskText(ctx, canvas, textBlocks.map((block) => block?.bounds), sw, sh, x, y, w, h);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
  if (!blob) return "";
  const file = new File([blob], `panel-${panelIndex + 1}.jpg`, { type: "image/jpeg" });
  const { file_url } = await base44.integrations.Core.UploadPublicFile({ file });
  return file_url || "";
}