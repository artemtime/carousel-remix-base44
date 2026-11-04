import { base44 } from "@/api/base44Client";
import { renderSlide, profileForRole, normalizeProfile } from "@/lib/slide-renderer";
import { slideOptions } from "@/lib/slide-options";
import { isExactMode } from "@/lib/modes";
export async function renderFinalImages({carousel,slides,style,keys},proxy,progress) {
  const images=[];
  for(const [i,slide] of slides.entries()) {
    progress?.(`Карточка ${i+1} из ${slides.length}`);
    if(slide.final_render_key===keys[i] && slide.final_check_status==="ok" && slide.final_image_url) {images.push({slideId:slide.id,key:keys[i],url:slide.final_image_url});continue;}
    const canvas=document.createElement("canvas");
    const profile=isExactMode(carousel.mode)?normalizeProfile(carousel.reference_profile?.caption || style?.caption):profileForRole(style,slide.role);
    await renderSlide(canvas,slideOptions(slide,{profile,aspect:style?.aspect,proxy,strict:true}));
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/png"));
    if(!blob)throw new Error("Не удалось собрать готовую карточку");
    const {file_url}=await base44.integrations.Core.UploadPublicFile({file:new File([blob],`final-${slide.position}.png`,{type:"image/png"})});
    images.push({slideId:slide.id,key:keys[i],url:file_url});
  }
  return images;
}
