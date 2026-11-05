import opentype from "opentype.js";
import { resolveFont } from "@/lib/fonts";
import { normalizeProfile } from "@/lib/slide-renderer";
import { fetchTrustedImage } from "@/lib/trusted-images.server";
import {decodeArtwork,paintOwnCard,paintTextCard} from "@/lib/server-card-paint";
const fonts = new Map();
async function readBounded(response, limit) {
  if (!response.ok || Number(response.headers.get("content-length")) > limit) throw new Error("Не загрузился шрифт");
  const reader = response.body.getReader(), chunks = []; let size = 0;
  try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > limit) { await reader.cancel(); throw new Error("Шрифт слишком большой"); } chunks.push(value); } } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; } return bytes;
}
async function fontFor(font, weight, characters) {
  const key = `${font.key}:${weight}:${characters}`;
  if (fonts.has(key)) return fonts.get(key);
  const task = (async () => {
    const family = font.family.replace(/ /g, "+") + (font.variable ? `:wght@${weight}` : "");
    const cssUrl = `https://fonts.googleapis.com/css2?family=${family}&text=${encodeURIComponent(characters)}`;
    const cssResponse=await fetch(cssUrl, { headers: { "User-Agent": "DigitalEmployees/1.0" }, redirect: "manual", signal: AbortSignal.timeout(15000) });
    if(!cssResponse.ok)throw new Error("Не загрузился выбранный шрифт для фоновой сборки");
    const css = await cssResponse.text();
    const url = /src:\s*url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/.exec(css)?.[1];
    if (!url) throw new Error("Не удалось получить выбранный шрифт для фоновой сборки");
    const bytes = await readBounded(await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(15000) }), 2_000_000);
    return opentype.parse(bytes.buffer);
  })();
  fonts.set(key, task); if (fonts.size > 8) fonts.delete(fonts.keys().next().value);
  try { return await task; } catch (e) { fonts.delete(key); throw e; }
}
export async function renderServerCard(slide) {
  const card = slide.reference_card, p = normalizeProfile(card?.own_caption);
  const text = (card?.text_blocks || []).map(b => b.text).join(" ");
  const chars = [...new Set((text + text.toUpperCase()).replace(/[\u{1F000}-\u{1FAFF}\u2600-\u27BF]/gu, "").replace(/\uFE0F|\u200D|\r|\n/gu, "").split(""))].sort().join("");
  const font = resolveFont(p.font), weights = [...new Set([p.weight, p.bold_weight])], loaded = new Map();
  await Promise.all(weights.map(async weight => loaded.set(weight, await fontFor(font, weight, chars || "АаAa"))));
  if(card?.visual_mode === "text")return paintTextCard(card,p,weight=>loaded.get(weight));
  const images = [];let totalPixels=0;
  for (const url of [slide.image_url, slide.image_url_2].slice(0, card.panels.length)) {
    const file = await fetchTrustedImage(url, { maxBytes: 10_000_000 });
    const { imageDimensions } = await import("@/lib/image-dimensions");
    const dimensions=imageDimensions(file.bytes);
    totalPixels+=dimensions.width*dimensions.height;
    if(totalPixels>5_000_000)throw new Error("Рисунки слишком большие для фоновой сборки. Откройте обычный редактор.");
    images.push(decodeArtwork(file));
  }
  return paintOwnCard(card,images,p,weight=>loaded.get(weight));
}
