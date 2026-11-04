// Снимаем только плавный профиль яркости подложки, без пикселей и деталей сцены.
const cache = new WeakMap();

function sampledRows(image) {
  if (cache.has(image)) return cache.get(image);
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = Math.round(128 * (image.naturalHeight || image.height) / (image.naturalWidth || image.width));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const result = { pixels: ctx.getImageData(0, 0, canvas.width, canvas.height).data, width: canvas.width, height: canvas.height };
  cache.set(image, result);
  return result;
}

function darkTone(sample, box, y) {
  const values = [];
  const cy = Math.round(y * (sample.height - 1));
  for (let row = Math.max(0, cy - 1); row <= Math.min(sample.height - 1, cy + 1); row += 1) {
    for (let col = Math.floor(box.x * sample.width); col < Math.min(sample.width, Math.ceil((box.x + box.w) * sample.width)); col += 1) {
      const i = (row * sample.width + col) * 4;
      values.push(sample.pixels[i] * 0.2126 + sample.pixels[i + 1] * 0.7152 + sample.pixels[i + 2] * 0.0722);
    }
  }
  values.sort((a, b) => a - b);
  return values[Math.floor(values.length * 0.35)] || 0;
}

export function measuredScrims(card, image, panels) {
  if (!image || card.lettering_version !== 1) return card.scrims || [];
  const sample = sampledRows(image);
  return (card.scrims || []).map((scrim) => {
    const b = scrim.bounds;
    const panel = panels.find((p) => b.y + b.h * 0.5 >= p.y && b.y + b.h * 0.5 <= p.y + p.h);
    if (!panel || b.y < panel.y + panel.h * 0.6) return scrim;
    const end = Math.min(panel.y + panel.h, b.y + b.h);
    const start = Math.max(panel.y, b.y - b.h);
    const tones = Array.from({ length: 17 }, (_, i) => darkTone(sample, panel, start + (end - start) * i / 16));
    const baseline = Math.max(...tones.slice(0, 5));
    const tail = (tones[14] + tones[15] + tones[16]) / 3;
    // Только реальное потемнение к кромке: плоскую плашку не превращаем в градиент.
    if (baseline < 10 || tail > baseline * 0.55 || baseline - tail < 8) return scrim;
    let previous = 0;
    const stops = tones.map((_, i) => {
      if (i < 2) return { at: i / 16, opacity: 0 };
      const tone = (tones[i - 1] + tones[i] + tones[Math.min(16, i + 1)]) / 3;
      previous = Math.max(previous, Math.min(1, Math.max(0, 1 - tone / baseline)));
      return { at: i / 16, opacity: previous };
    });
    return { ...scrim, bounds: { x: panel.x, y: start, w: panel.w, h: end - start }, stops, fade: "top" };
  });
}