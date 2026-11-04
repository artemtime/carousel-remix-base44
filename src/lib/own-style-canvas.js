// Reuse the regular caption renderer, including the chosen font, accents,
// uppercase, placement, squeeze, wrapping and role-specific typography.
export default async function renderOwnStyleCard(canvas, options, renderPanel) {
  const card = options.referenceCard;
  const [w,h] = card.aspect.split(":").map(Number);
  const W = 1080, H = Math.round(W * h / w);
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = card.background || "#101014"; ctx.fillRect(0,0,W,H);
  for (let index = 0; index < card.panels.length; index += 1) {
    const panel = card.panels[index];
    const x = Math.round(panel.bounds.x * W), y = Math.round(panel.bounds.y * H);
    const width = Math.round(panel.bounds.w * W), height = Math.round((panel.bounds.y + panel.bounds.h) * H) - y;
    const target = document.createElement("canvas");
    const text = card.text_blocks.filter(block => (block.panel_index ?? 0) === index).map(block => block.text).filter(Boolean).join("\n\n");
    const caption={...card.own_caption,...card.own_caption_overrides?.[index]};
    await renderPanel(target, { imageUrl: index === 0 ? options.imageUrl : options.imageUrl2, text,
      profile: { ...caption, scrim_opacity: caption.scrim_opacity ?? (caption.shadow === false ? 0 : .7) }, dimensions: [width,height], imageAlignY: panel.image_align_y ?? .5, trimFrame: true, trimFooter: Boolean(panel.trim_footer), fixedCaption: caption.smart_place === false, proxy: options.proxy, strict: options.strict });
    ctx.drawImage(target,x,y,width,height);
  }
}
