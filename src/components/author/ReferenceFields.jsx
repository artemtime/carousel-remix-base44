export default function ReferenceFields({ slide, onChange }) {
  const card = slide.reference_card;
  const updateText = (index, text) => {
    const text_blocks = card.text_blocks.map((block, i) => i === index ? { ...block, text } : block);
    onChange({ text: text_blocks.map((block) => block.text).join("\n\n"), reference_card: { ...card, text_blocks } });
  };
  const updateCrop = (index, value) => {
    const panels = card.panels.map((panel, i) => i === index ? { ...panel, image_align_y: Number(value) } : panel);
    onChange({ reference_card: { ...card, panels } });
  };
  const updateFooter = (index,trim_footer) => onChange({reference_card:{...card,panels:card.panels.map((p,i)=>i===index?{...p,trim_footer}:p)}});
  const updateScene = (index, scene) => {
    const panels = card.panels.map((panel, i) => i === index ? { ...panel, scene } : panel);
    onChange({ scene: panels.map((panel, i) => `Кадр ${i + 1}: ${panel.scene}`).join("\n"), reference_card: { ...card, panels } });
  };
  return (
    <div className="space-y-3">
      {card.text_blocks.map((block, i) => (
        <label key={i} className="block space-y-1 text-[11px] text-muted-foreground">
          <span>Подпись {i + 1} · {card.visual_mode === "own" ? "в моём оформлении" : "по оригиналу"}</span>
          <textarea value={block.text} onChange={(event) => updateText(i, event.target.value)} rows={Math.max(2, block.text.split("\n").length)} className="w-full resize-none rounded-lg border border-border bg-input/40 px-3 py-2 text-[12px] text-foreground outline-none focus:border-primary/50" />
        </label>
      ))}
      {!card.text_blocks.length && <p className="text-[11px] text-muted-foreground">В оригинале нет текста.</p>}
      {card.panels.map((panel, i) => (
        <div key={i} className="space-y-1 text-[11px] text-muted-foreground">
          <label className="block space-y-1">
            <span>Что нарисовано · кадр {i + 1}</span>
            <textarea value={panel.scene} onChange={(event) => updateScene(i, event.target.value)} rows={3} className="w-full resize-none rounded-lg border border-border bg-input/40 px-3 py-2 text-[12px] text-foreground outline-none focus:border-primary/50" />
          </label>
          <label className="flex items-center gap-2">
            <span>Положение рисунка</span>
            <select aria-label={`Положение рисунка ${i + 1}`} value={panel.image_align_y ?? .5} onChange={event => updateCrop(i,event.target.value)} className="h-8 rounded-md border border-border bg-input px-2 text-[11px] text-foreground">
              <option value={0}>Показать верх</option>
              <option value={.5}>По центру</option>
              <option value={1}>Показать низ</option>
            </select>
          </label>
          {card.visual_mode === "own" && <label className="flex items-center gap-2">
            <input type="checkbox" aria-label={`Убрать пустую полосу под рисунком ${i+1}`} checked={Boolean(panel.trim_footer)} onChange={event=>updateFooter(i,event.target.checked)} />
            <span>Убрать пустую полосу под рисунком</span>
          </label>}
        </div>
      ))}
      <p className="text-[11px] leading-snug text-muted-foreground">
        {card.panels.length === 2 ? "Два независимых кадра" : "Один кадр"} · {card.visual_mode === "own"
          ? `Рисовка, палитра и подписи берутся из выбранного стиля. Шрифт: ${card.own_caption?.font || "из стиля"}. Композиция самостоятельная.`
          : "Кадры рисуются заново в стиле оригинала. Границы, шрифт и затемнение под подписями берутся из оригинала."}
      </p>
    </div>
  );
}
