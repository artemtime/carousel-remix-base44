// Оставляем выровненные компоненты букв и их диакритику, отбрасывая фон и шум.
export default function isolateInk(data, width, height, lines = 1) {
  const visited = new Uint8Array(width * height), queue = new Uint32Array(width * height), parts = [];
  for (let seed = 0; seed < visited.length; seed += 1) {
    if (visited[seed] || !data[seed * 4 + 3]) continue;
    let head = 0, tail = 1, left = width, right = 0, top = height, bottom = 0;
    queue[0] = seed; visited[seed] = 1;
    const pixels = [];
    while (head < tail) {
      const p = queue[head++], x = p % width, y = Math.floor(p / width);
      pixels.push(p); left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
      for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
        const nx = x + dx, ny = y + dy, n = ny * width + nx;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height || visited[n] || !data[n * 4 + 3]) continue;
        visited[n] = 1; queue[tail++] = n;
      }
    }
    parts.push({ pixels, left, right, top, bottom, w: right - left + 1, h: bottom - top + 1 });
  }
  const candidates = parts.filter((p) => p.h >= height / lines * 0.24 && p.w / p.h < 1.7 && p.left > 0 && p.right < width - 1 && p.top > 0 && p.bottom < height - 1);
  if (!candidates.length) return false;
  const median = (values) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const letterHeight = median(candidates.map((p) => p.h));
  const groups = [];
  for (const part of candidates) {
    const group = groups.find((g) => Math.abs(g[0].bottom - part.bottom) <= letterHeight * 0.23);
    if (group) group.push(part); else groups.push([part]);
  }
  const selected = groups.sort((a, b) => b.length - a.length).slice(0, lines);
  const baselines = selected.map((group) => median(group.map((p) => p.bottom)));
  const letters = selected.flat().filter((p) => p.h >= letterHeight * 0.5);
  const keep = new Uint8Array(width * height);
  for (const part of parts) {
    const letter = letters.includes(part);
    const mark = part.w < letterHeight * 0.7 && part.h < letterHeight * 0.5 && baselines.some((baseline) => part.top >= baseline - letterHeight * 1.35 && part.bottom <= baseline + letterHeight * 0.15) && letters.some((p) => part.left <= p.right + letterHeight * 0.12 && part.right >= p.left - letterHeight * 0.12);
    if (letter || mark) part.pixels.forEach((p) => { keep[p] = 1; });
  }
  for (let p = 0; p < keep.length; p += 1) if (!keep[p]) data[p * 4 + 3] = 0;
  return letters.length > 0;
}