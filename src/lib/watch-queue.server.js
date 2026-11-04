import { weeklySlot } from "@/lib/watch-schedule";
import { editorialSettings, stageAutomatic } from "@/lib/editorial-policy";
const observed=(row,key)=>row[key]===undefined?{$exists:false}:row[key];
export async function runWatchStep(base44,options={},checkAuthor) {
  const settings=(await base44.entities.Settings.list({sort:"-created_date",limit:1})).items?.[0];
  if(typeof options==="string")return {checked:[await checkAuthor(base44,await base44.entities.WatchAuthor.get(options),{limit:settings?.scout_limit})],remaining:0,done:true};
  if(!settings)return {checked:[],remaining:0,done:true};
  if(editorialSettings(settings).paused || options.scheduled && editorialSettings(settings).configured && !stageAutomatic(settings,"scout"))return {checked:[],remaining:0,done:true,paused:true};
  let job=settings.watch_run_id?await base44.entities.TaskQueue.get(settings.watch_run_id).catch(()=>null):null;
  const slot=weeklySlot(settings);
  if(options.scheduled && !job || options.scheduled && job && ["done","failed"].includes(job.status)) {
    if(!settings.digest_last_slot) {await base44.entities.Settings.update(settings.id,{digest_last_slot:slot});return {checked:[],remaining:0,done:true};}
    if(settings.digest_last_slot===slot)return {checked:[],remaining:0,done:true};
  }
  if(options.runId && job?.id!==options.runId)throw new Error("Проход разведки уже изменился. Обновите страницу.");
  if(!job || ["done","failed"].includes(job.status)) {
    const token=crypto.randomUUID();
    if(settings.watch_start_token && Date.parse(settings.watch_start_until)>Date.now())return {checked:[],remaining:1,waiting:true,done:false};
    const claim=await base44.entities.Settings.updateMany({id:settings.id,watch_start_token:observed(settings,"watch_start_token"),watch_run_id:observed(settings,"watch_run_id")},{$set:{watch_start_token:token,watch_start_until:new Date(Date.now()+60000).toISOString()}});
    if(claim.updated!==1)return {checked:[],remaining:1,waiting:true,done:false};
    try {
      const authors=(await base44.entities.WatchAuthor.filter({status:"active"},{sort:"created_date",limit:500})).items || [];
      job=await base44.entities.TaskQueue.create({kind:"watch_all",label:options.scheduled?"Недельная разведка":"Проверка авторов",status:authors.length?"running":"done",owner_id:settings.created_by_id || "studio-owner",targets:authors.map(a=>({author_id:a.id})),cursor:0,completed:0,total:authors.length});
      await base44.entities.Settings.updateMany({id:settings.id,watch_start_token:token},{$set:{watch_run_id:job.id,watch_start_token:"",watch_start_until:"",...(options.scheduled?{digest_last_slot:slot}:{})}});
    }catch(error){await base44.entities.Settings.updateMany({id:settings.id,watch_start_token:token},{$set:{watch_start_token:"",watch_start_until:""}});throw error;}
  }
  const cursor=job.cursor || 0;
  if(cursor>=job.targets.length)return {checked:[],remaining:0,done:true,runId:job.id};
  if(Date.parse(job.lease_until || "")>Date.now())return {checked:[],remaining:job.targets.length-cursor,waiting:true,runId:job.id,done:false};
  const token=crypto.randomUUID();
  const claim=await base44.entities.TaskQueue.updateMany({id:job.id,cursor:observed(job,"cursor"),lease_id:observed(job,"lease_id")},{$set:{lease_id:token,lease_until:new Date(Date.now()+10*60000).toISOString()}});
  if(claim.updated!==1)return {checked:[],remaining:job.targets.length-cursor,waiting:true,runId:job.id,done:false};
  let result;
  try{
    const author=await base44.entities.WatchAuthor.get(job.targets[cursor].author_id);
    result=author.status==="active"?await checkAuthor(base44,author,{limit:settings.scout_limit}):{handle:author.handle,skipped:true};
  }catch(error){
    if(error.stopRender){await base44.entities.TaskQueue.updateMany({id:job.id,lease_id:token},{$set:{status:"paused",lease_id:"",lease_until:"",error:String(error.message).slice(0,300)}});return {checked:[],remaining:job.targets.length-cursor,done:true,paused:true};}
    result={ok:false,error:String(error.message || error).slice(0,200)};
  }
  const remaining=job.targets.length-cursor-1;
  const saved=await base44.entities.TaskQueue.updateMany({id:job.id,lease_id:token,cursor:observed(job,"cursor")},{$set:{cursor:cursor+1,completed:cursor+1,status:remaining?"running":"done",lease_id:"",lease_until:""}});
  return {checked:saved.updated===1?[result]:[],remaining,done:remaining===0,runId:job.id};
}
