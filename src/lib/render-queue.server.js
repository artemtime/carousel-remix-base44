import { drawSlideFully } from "@/lib/studio.server";
import { panelCount, panelReady, carouselReadiness, sceneKey, assertReady, stalePatch } from "@/lib/readiness";
import { digest, visualContent } from "@/lib/revisions";
import { ownStyleCard } from "@/lib/own-style";
import { meteredClient } from "@/lib/usage.server";
import { approveFinalCore, invalidateApproval } from "@/lib/final-artifacts.server";
import { normalizeImageModel } from "@/lib/image-models";
import { assertStudioRunning } from "@/lib/editorial-store.server";

const ACTIVE = ["queued", "running"];
const LEASE_MS=15*60*1000;
const observed=(record,key)=>record[key]===undefined?{$exists:false}:record[key];
async function cas(table,record,fields,patch) {
  const query={id:record.id,...Object.fromEntries(fields.map(k=>[k,observed(record,k)]))};
  return (await table.updateMany(query,{$set:patch})).updated===1;
}
async function slidesFor(base44,carouselId) {return (await base44.entities.Slide.filter({carousel_id:carouselId},{sort:"position",limit:40})).items || [];}
export async function renderVisuals(base44,carousel) {
  let style=carousel.style_id?await base44.entities.MyStyle.get(carousel.style_id):null;
  let hero=carousel.hero_id?await base44.entities.Hero.get(carousel.hero_id):style?.hero;
  if(carousel.mode==="mirror" || carousel.content_format==="text") {hero=null;style={...style,hero:null,hero_sheet_url:""};}
  else if(hero)style={...style,hero,hero_sheet_url:hero.identity_reference_url || hero.portrait_url || hero.sheet_url || style?.hero_sheet_url || ""};
  return {style,hero,key:await digest(visualContent(style,hero,carousel.mode))};
}
export async function enqueueRender(base44,user,{carouselId,slideId,panelTargets}) {
  await assertStudioRunning(base44);
  const initial=await base44.entities.Carousel.get(carouselId);
  if(initial.content_format === "text") {
    await base44.entities.Carousel.update(carouselId,{status:"review",hero_id:"",hero_name:""});
    return {status:"done",total:0,completed:0};
  }
  const existing=(await base44.entities.TaskQueue.filter({carousel_id:carouselId},{sort:"-created_date",limit:20})).items || [];
  const active=existing.find(job=>ACTIVE.includes(job.status));
  if(active) {
    const stale=!(Date.parse(active.lease_until || "")>Date.now()) && Date.now()-Date.parse(active.updated_date || active.created_date || new Date().toISOString())>LEASE_MS;
    if(!stale)return active;
    await cas(base44.entities.TaskQueue,active,["lease_id","cursor","status"],{status:"paused",error:"Возобновлено после остановки фонового процесса",lease_id:"",lease_until:""});
  }
  if(initial.enqueue_token && Date.parse(initial.enqueue_until)>Date.now())throw new Error("Очередь уже запускается. Обновите страницу через несколько секунд.");
  const token=crypto.randomUUID();
  if(!await cas(base44.entities.Carousel,initial,["enqueue_token","active_task_id"],{enqueue_token:token,enqueue_until:new Date(Date.now()+60000).toISOString()}))throw new Error("Очередь уже запускается");
  let job;
  try {
    const carousel=await base44.entities.Carousel.get(carouselId);
    const rows=await slidesFor(base44,carouselId);
    if(!rows.length)throw new Error("В карусели нет слайдов");
    const visual=await renderVisuals(base44,carousel),targets=[];
    for(const [i,slide] of rows.entries()) {
      let next=slide;
      if(slide.reference_card?.visual_mode==="own") {
        const card=ownStyleCard(slide.reference_card,visual.style,slide.role);
        card.panels=card.panels.map((panel,index)=>({...panel,...(slide.reference_card.panels[index]?.image_align_y===undefined?{}:{image_align_y:slide.reference_card.panels[index].image_align_y})}));
        if(JSON.stringify(card)!==JSON.stringify(slide.reference_card)) {
          const patch={reference_card:card,final_check_status:"pending",...stalePatch(slide,{...slide,reference_card:card})};
          await base44.entities.Slide.update(slide.id,patch);next={...slide,...patch};
          await invalidateApproval(base44,carouselId,next.image_stale?"plan":"review");
        }
      }
      const key=await digest({scene:sceneKey(next),visual:visual.key});
      if(next.art_key && next.art_key!==key && !next.image_stale) {
        const patch={image_stale:true,render_token:"",status:"planned",critic_status:"pending",panel_checks:[],final_check_status:"pending"};
        await base44.entities.Slide.update(next.id,patch);next={...next,...patch};
        await invalidateApproval(base44,carouselId,"plan");
      }
      rows[i]=next;
    }
    const selected=panelTargets?rows.filter(row=>panelTargets.some(t=>t.slide_id===row.id)):slideId?rows.filter(row=>row.id===slideId):rows;
    if(!selected.length)throw new Error("Слайд не найден в этой карусели");
    for(const slide of selected) {
      const artKey=await digest({scene:sceneKey(slide),visual:visual.key});
      const changed=Boolean(slide.art_key && slide.art_key!==artKey);
      if(slide.image_stale || slideId || changed)await base44.entities.Slide.update(slide.id,{panel_checks:[],critic_status:"pending",status:"planned",final_check_status:"pending",render_token:""});
      for(let index=0;index<panelCount(slide);index++)if((!panelTargets || panelTargets.some(t=>t.slide_id===slide.id && t.panel===index)) && (panelTargets || slideId || changed || !panelReady(slide,index)))targets.push({slide_id:slide.id,panel:index,scene_key:sceneKey(slide),art_key:artKey});
    }
    if(!targets.length)return {status:"done",total:0,completed:0};
    const settings=(await base44.entities.Settings.list({limit:1,sort:"-created_date"})).items?.[0] || {};
    const imageModel=normalizeImageModel(carousel.image_model);
    job=await base44.entities.TaskQueue.create({kind:"draw_all",label:carousel.title || "Карусель",status:"queued",carousel_id:carouselId,owner_id:user.id,targets,total:targets.length,completed:0,cursor:0,visual_key:visual.key,image_model:imageModel});
    const current=await base44.entities.Carousel.get(carouselId);
    if(current.enqueue_token!==token || current.image_model!==carousel.image_model || !await cas(base44.entities.Carousel,current,["enqueue_token","image_model"],{image_model:imageModel,active_task_id:job.id,status:"rendering",approved_key:"",approved_at:"",image_request_limit:Math.max(1,Math.min(200,Number(settings.max_image_requests_per_carousel)||80))})) {
      await base44.entities.TaskQueue.update(job.id,{status:"paused",error:"Запуск заменён новой задачей"});throw new Error("Состояние очереди изменилось");
    }
    return job;
  } finally {
    const current=await base44.entities.Carousel.get(carouselId);
    if(current.enqueue_token===token)await cas(base44.entities.Carousel,current,["enqueue_token"],{enqueue_token:"",enqueue_until:""});
  }
}
export async function pauseRender(base44,{taskId}) {
  const job=await base44.entities.TaskQueue.get(taskId);
  await base44.entities.Carousel.get(job.carousel_id);
  if(!ACTIVE.includes(job.status))return job;
  await base44.entities.TaskQueue.update(taskId,{stop_requested:true});
  if(!(Date.parse(job.lease_until || "")>Date.now())) {
    await cas(base44.entities.TaskQueue,job,["lease_id","cursor","status"],{status:"paused",stop_requested:true});
    const carousel=await base44.entities.Carousel.get(job.carousel_id);
    if(carousel.active_task_id===taskId)await cas(base44.entities.Carousel,carousel,["active_task_id"],{status:"paused",active_task_id:""});
  }
  return base44.entities.TaskQueue.get(taskId);
}
export async function processRenderTask(base44,taskId) {
  let job=await base44.entities.TaskQueue.get(taskId);
  if(job.kind!=="draw_all" || !job.owner_id || !ACTIVE.includes(job.status))return {done:true};
  let carousel=await base44.entities.Carousel.get(job.carousel_id);
  if(carousel.active_task_id!==taskId) {
    if(carousel.enqueue_token)return {done:false,waiting:true};
    // Adopt an old queued job once, including jobs created before this release.
    if(carousel.active_task_id || !await cas(base44.entities.Carousel,carousel,["active_task_id"],{active_task_id:taskId})) {
      await base44.entities.TaskQueue.update(taskId,{status:"paused",error:"Эта задача заменена другой"});return {done:true};
    }
    carousel=await base44.entities.Carousel.get(job.carousel_id);
  }
  if(Date.parse(job.lease_until || "")>Date.now())return {done:false,waiting:true};
  const cursor=job.cursor || 0,token=crypto.randomUUID();
  if(!await cas(base44.entities.TaskQueue,job,["status","cursor","lease_id"],{status:"running",lease_id:token,lease_until:new Date(Date.now()+LEASE_MS).toISOString()}))return {done:false,waiting:true};
  const owned=async()=>{const current=await base44.entities.TaskQueue.get(taskId);return current.lease_id===token && (current.cursor || 0)===cursor && ACTIVE.includes(current.status)?current:null;};
  const finish=async(status,error="")=>{
    const current=await owned();if(!current)return {done:true,obsolete:true};
    const rows=await slidesFor(base44,job.carousel_id),rawReady=carouselReadiness(rows,carousel.slides_count).ready;
    await cas(base44.entities.TaskQueue,current,["lease_id","cursor","status"],{status:rawReady?"done":status,error,lease_id:"",lease_until:"",result:rawReady?"Иллюстрации проверены. Проверьте и утвердите готовые карточки.":"Готовые кадры сохранены. Нужна проверка."});
    const parent=await base44.entities.Carousel.get(job.carousel_id);
    if(parent.active_task_id===taskId)await cas(base44.entities.Carousel,parent,["active_task_id"],{status:status==="paused"?"paused":"review",active_task_id:"",approved_key:""});
    return {done:true,ready:false,art_ready:rawReady};
  };
  if(job.stop_requested)return finish("paused");
  try { await assertStudioRunning(base44); } catch(error) { return finish("paused",error.message); }
  const target=job.targets?.[cursor];
  if(!target)return finish("review");
  let error="", stop=false;
  try {
    const slide=await base44.entities.Slide.get(target.slide_id);
    const visual=await renderVisuals(base44,carousel);
    if(slide.carousel_id!==job.carousel_id || sceneKey(slide)!==target.scene_key || job.visual_key && job.visual_key!==visual.key)throw new Error("Сцена, герой или оформление изменились. Запустите рисование заново.");
    if(!panelReady(slide,target.panel) || slide.image_stale) {
      await base44.entities.Slide.update(slide.id,{render_token:token});
      const imageModel=normalizeImageModel(job.image_model ?? carousel.image_model);
      const client=meteredClient(base44,carousel.id,{imageModel});
      const patch=await drawSlideFully(client,{slide,style:visual.style,hero:visual.hero,profile:carousel.reference_profile,panelIndex:target.panel});
      const generated=client.imageGenerations.at(-1);
      if(generated)patch.image_generations={...(slide.image_generations || {}),[target.panel]:generated};
      const current=await base44.entities.Slide.get(slide.id),parent=await base44.entities.Carousel.get(carousel.id);
      const after=await renderVisuals(base44,parent);
      if(!await owned() || parent.active_task_id!==taskId || normalizeImageModel(parent.image_model)!==imageModel || sceneKey(current)!==target.scene_key || after.key!==visual.key)throw new Error("Состояние изменилось во время рисования; устаревший результат не сохранён");
      if(!await cas(base44.entities.Slide,current,["render_token"],{...patch,art_key:target.art_key || await digest({scene:sceneKey(current),visual:after.key}),final_check_status:"pending",render_token:"",previous_images:{...(current.previous_images||{}),[target.panel===0?"image_url":"image_url_2"]:target.panel===0?current.image_url || "":current.image_url_2 || ""}}))throw new Error("Кадр уже изменён другим процессом");
    }
  } catch(failure) {error=String(failure.message || failure).slice(0,500);stop=Boolean(failure.stopRender);}
  job=await owned();if(!job)return {done:true,obsolete:true};
  if(stop)return finish("paused",error);
  if(job.stop_requested)return finish("paused",error);
  if(!await cas(base44.entities.TaskQueue,job,["lease_id","cursor","status"],{cursor:cursor+1,completed:cursor+1,error:error || job.error || ""}))return {done:true,obsolete:true};
  // Keep the lease through finalisation, so an old process cannot change the parent.
  job=await base44.entities.TaskQueue.get(taskId);
  if(cursor+1>=job.targets.length) {
    const rows=await slidesFor(base44,job.carousel_id),rawReady=carouselReadiness(rows,carousel.slides_count).ready;
    await cas(base44.entities.TaskQueue,job,["lease_id","cursor","status"],{status:rawReady?"done":"review",lease_id:"",lease_until:"",error:error || job.error || "",result:rawReady?"Иллюстрации готовы к проверке карточек":"Нужна проверка кадров"});
    const parent=await base44.entities.Carousel.get(carousel.id);
    if(parent.active_task_id===taskId)await cas(base44.entities.Carousel,parent,["active_task_id"],{status:"review",active_task_id:"",approved_key:""});
    return {done:true,ready:false,art_ready:rawReady};
  }
  await cas(base44.entities.TaskQueue,job,["lease_id","cursor","status"],{lease_id:"",lease_until:""});
  return {done:false,completed:cursor+1,total:job.targets.length};
}
export async function saveSlideEdit(base44,{slideId,patch}) {
  const before=await base44.entities.Slide.get(slideId);await base44.entities.Carousel.get(before.carousel_id);
  const stale=stalePatch(before,{...before,...patch});
  const changed=JSON.stringify(patch)!=="{}";
  const result=await base44.entities.Slide.update(slideId,{...patch,...stale,...(changed?{final_check_status:"pending"}:{}),...(stale.image_stale?{render_token:""}:{})});
  if(changed) {
    await invalidateApproval(base44,before.carousel_id,stale.image_stale?"plan":"review");
    await base44.entities.Carousel.update(before.carousel_id,{repair_attempts:0,repair_key:""});
  }
  return result;
}
export async function setCarouselHero(base44,{carouselId,heroId}) {
  const carousel=await base44.entities.Carousel.get(carouselId);
  if(carousel.content_format==="text")throw new Error("У текстовой карусели нет героя");
  if(carousel.mode==="mirror")throw new Error("В зеркале герой берётся из оригинала");
  const hero=heroId?await base44.entities.Hero.get(heroId):null;
  if(carousel.hero_id!==heroId) {
    const rows=await slidesFor(base44,carouselId);
    await base44.entities.Slide.bulkUpdate(rows.map(slide=>({id:slide.id,image_stale:true,status:"planned",critic_status:"pending",panel_checks:[],final_check_status:"pending",render_token:"",critic_note:"Герой изменился — нужно перерисовать кадры"})));
  }
  return base44.entities.Carousel.update(carouselId,{hero_id:heroId || "",hero_name:hero?.name || "",status:"plan",approved_key:""});
}
export async function setCarouselImageModel(base44,{carouselId,imageModel}) {
  const model=normalizeImageModel(imageModel);
  const carousel=await base44.entities.Carousel.get(carouselId);
  if(carousel.active_task_id || carousel.enqueue_token || carousel.status==="rendering")throw new Error("Сначала остановите рисование, затем смените модель.");
  // A future generation setting does not invalidate existing approved artwork.
  if(!await cas(base44.entities.Carousel,carousel,["image_model","active_task_id","enqueue_token"],{image_model:model}))throw new Error("Карусель уже изменилась. Обновите страницу.");
  return base44.entities.Carousel.get(carouselId);
}
export async function markCarouselReady(base44,{carouselId},user) {
  const carousel=await base44.entities.Carousel.get(carouselId);assertReady(await slidesFor(base44,carouselId),carousel.slides_count);
  return approveFinalCore(base44,{carouselId},user);
}
export async function recoverRenderJobs(base44) {
  const jobs=(await base44.entities.TaskQueue.filter({kind:"draw_all",status:{$in:ACTIVE}},{sort:"updated_date",limit:30})).items || [];
  let recovered=0;
  for(const job of jobs.slice(0,5)) {
    if(Date.parse(job.lease_until || "")>Date.now() || !(Date.now()-Date.parse(job.updated_date || job.created_date)>LEASE_MS))continue;
    const current=await base44.entities.Carousel.get(job.carousel_id);
    if(current.active_task_id && current.active_task_id!==job.id)continue;
    await enqueueRender(base44,{id:job.owner_id},{carouselId:job.carousel_id});recovered++;
  }
  return {recovered};
}

