import { approvedPack } from "@/lib/final-artifacts.server";
import { assertStudioRunning } from "@/lib/editorial-store.server";
export async function publishApproved(base44,data,{listChannels,createPost,authorize}) {
  await assertStudioRunning(base44);
  if(!data.text || data.text.length>2200 || !data.imageUrls?.length || data.imageUrls.length>10)throw new Error("Для Instagram нужны подпись до 2200 символов и от 1 до 10 карточек");
  if(data.dueAt && !(Date.parse(data.dueAt)>Date.now()))throw new Error("Выберите будущее время публикации");
  const pack=await approvedPack(base44,data.carouselId),{carousel,caption,images}=pack;
  if(data.text!==caption || JSON.stringify(data.imageUrls)!==JSON.stringify(images))throw new Error("Подпись или карточки отличаются от утверждённой версии. Обновите Публикатор.");
  const channels=await listChannels();
  if(!channels.some(channel=>channel.id===data.channelId))throw new Error("Канал не принадлежит подключённому аккаунту Buffer");
  const key=`${carousel.approved_key}:${data.channelId}`;
  if(carousel.published_key===key)throw new Error("Эта версия уже отправлена в выбранный канал");
  if(carousel.publish_state==="submitting" || carousel.publish_state==="unknown")throw new Error("Предыдущую отправку нужно проверить в Buffer перед повтором");
  const token=crypto.randomUUID();
  const channel=channels.find(c=>c.id===data.channelId);
  const claim=await base44.entities.Carousel.updateMany({id:carousel.id,approved_key:carousel.approved_key,publish_token:carousel.publish_token===undefined?{$exists:false}:carousel.publish_token},{$set:{publish_token:token,publish_state:"submitting",buffer_payload:{caption,images,version_key:key},buffer_channel_id:data.channelId,buffer_organization_id:channel.organizationId || "",buffer_submitted_at:new Date().toISOString(),scheduled_at:data.dueAt || ""}});
  if(claim.updated!==1)throw new Error("Отправка уже запущена или версия изменилась");
  let submitted=false;
  try {
    const current=await approvedPack(base44,carousel.id);
    if(current.carousel.approved_key!==carousel.approved_key)throw new Error("Утверждённая версия изменилась");
    await assertStudioRunning(base44);
    await authorize?.();
    submitted=true;
    const post=await createPost({...data,text:caption,imageUrls:images});
    await base44.entities.Carousel.updateMany({id:carousel.id,publish_token:token},{$set:{status:data.dueAt?"scheduled":"queued",publish_state:"sent",delivery_status:data.dueAt?"scheduled":"queued",delivery_note:"",published_key:key,buffer_post_id:post.id}});
    return post;
  }catch(error){
    await base44.entities.Carousel.updateMany({id:carousel.id,publish_token:token},{$set:{publish_state:!submitted || error.submissionRejected?"idle":"unknown",delivery_status:!submitted || error.submissionRejected?"error":"needs_review",delivery_note:String(error.message || error).slice(0,500)}});
    throw error;
  }
}
