// Keep authored line breaks and wrap OCR paragraphs inside their measured box.
export function fitReferenceText(ctx, { text, maxSize, width, height, lineHeight = 1.15, font }) {
  let size = Math.max(.1, maxSize);
  const wrap = () => {
    ctx.font = font(size);
    const paragraphs = String(text || "").split("\n").flatMap(paragraph => {
      // A small overflow needs a small font adjustment, not a one-word last line.
      if (ctx.measureText(paragraph).width <= width / .8) return [paragraph];
      return paragraph.split(/(?<=[.!?])\s+(?=[A-ZА-ЯЁ])/);
    });
    return paragraphs.flatMap(paragraph => {
      if (ctx.measureText(paragraph).width <= width / .8) return [paragraph];
      const words = paragraph.split(/\s+/).filter(Boolean);
      if (!words.length) return [""];
      const lines = []; let line = words[0];
      for (const word of words.slice(1)) {
        const candidate = `${line} ${word}`;
        if (ctx.measureText(candidate).width <= width) line = candidate;
        else { lines.push(line); line = word; }
      }
      return [...lines, line];
    });
  };
  let lines;
  for (let i = 0; i < 16; i += 1) {
    lines = wrap();
    const widest = Math.max(1, ...lines.map(line => ctx.measureText(line).width));
    const needed = size * (1 + Math.max(0, lines.length - 1) * lineHeight);
    const scale = Math.min(1, width / widest, height / Math.max(.1, needed));
    if (scale >= .999) break;
    size *= Math.max(.01, scale * .995);
  }
  lines = wrap();
  return { size, lines };
}
