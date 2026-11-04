// Метаданные оригинала нужны для расположения текста и маскирования референса.
export function withSourceLettering(card, original = card) {
  if (!card?.text_blocks || !original?.text_blocks) return card;
  return {
    ...card, lettering_version: 1,
    reference_url: original.reference_url || card.reference_url,
    text_blocks: card.text_blocks.map((block, i) => ({
      ...block,
      source_text: block.source_text ?? original.text_blocks[i]?.text,
      source_bounds: block.source_bounds ?? original.text_blocks[i]?.bounds,
    })),
  };
}

// Надписи рисуются шрифтом: выделение пикселей исходника теряло части букв j/y и точек.
export function sourceLettering() {
  return null;
}
