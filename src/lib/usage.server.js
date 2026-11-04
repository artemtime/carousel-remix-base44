// One reservation is made before each paid request, shared by all jobs of a carousel.
export async function reserveUsage(base44, carouselId, kind) {
  for (let attempt=0;attempt<5;attempt++) {
    const carousel=await base44.entities.Carousel.get(carouselId);
    const field=kind==="image"?"image_requests":"ai_requests";
    const current=carousel[field];
    const limit=kind==="image"?(carousel.image_request_limit || 80):240;
    if((current || 0)>=limit) throw new Error(kind==="image"?"Достигнут лимит рисунков этой карусели. Проверьте результат или увеличьте лимит в настройках.":"Достигнут лимит проверок этой карусели");
    const claim=await base44.entities.Carousel.updateMany({id:carouselId,[field]:current===undefined?{$exists:false}:current},{$set:{[field]:(current||0)+1}});
    if(claim.updated===1) {
      try { await reserveStudioUsage(base44,kind); }
      catch(error) { await base44.entities.Carousel.updateMany({id:carouselId,[field]:{$gte:1}},{$inc:{[field]:-1}}); throw error; }
      return;
    }
  }
  throw new Error("Не удалось учесть запрос. Повторите позже.");
}
export function meteredClient(base44, carouselId, { imageModel = "automatic" } = {}) {
  const service=base44.asServiceRole || base44;
  return { entities:base44.entities, integrations:service.integrations, aiGateway:service.aiGateway,
    imageModel, imageGenerations: [],
    onImageGenerated(info) { this.imageGenerations.push(info); },
    reserveUsage:kind=>reserveUsage(base44,carouselId,kind) };
}

import { reserveStudioUsage } from "./editorial-store.server.js";
