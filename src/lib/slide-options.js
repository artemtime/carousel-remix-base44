// Все пути вывода используют те же границы, подписи и пропорции оригинала.
export function slideOptions(slide, { profile, aspect, proxy, strict = false } = {}) {
  return { imageUrl: slide.image_url, imageUrl2: slide.image_url_2, text: slide.text,
    referenceCard: slide.reference_card, profile, aspect, layout: slide.layout, proxy, strict };
}
