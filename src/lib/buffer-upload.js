// All delivery channels reuse the reviewed PNG, never re-render it with another profile.
export async function slideToPublicUrl(slide) {
  if(slide.final_check_status!=="ok" || !slide.final_image_url || !slide.final_render_key)throw new Error("Сначала проверьте и утвердите готовые карточки в Авторе");
  return slide.final_image_url;
}
