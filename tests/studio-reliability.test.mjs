import * as editorialStore from '../src/lib/editorial-store.server.js';
import * as editorialPolicy from '../src/lib/editorial-policy.js';
import * as imageModels from '../src/lib/image-models.js';
/* global URL, Response, ReadableStream, AbortSignal, TextEncoder, crypto, console */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import * as revisions from '../src/lib/revisions.js';
import * as ready from '../src/lib/readiness.js';
import {ownStyleCard} from '../src/lib/own-style.js';
import {meteredClient,reserveUsage} from '../src/lib/usage.server.js';
import {weeklySlot} from '../src/lib/watch-schedule.js';
import {database} from './db-fixture.mjs';
const read=p=>fs.readFile(new URL('../'+p,import.meta.url),'utf8');
const load=(s,names,deps={})=>vm.runInNewContext(s.replace(/import[\s\S]*?from\s+['"][^'"]+['"];?/g,'').replaceAll('export async function','async function').replaceAll('export function','function').replaceAll('export const','const').replaceAll('export default async function','async function')+'\n({'+names.join(',')+'})',{...editorialStore,...editorialPolicy,...imageModels,...revisions,...ready,ownStyleCard,meteredClient,weeklySlot,...deps,crypto,TextEncoder,URL,AbortSignal,Date,console});
const source={queue:await read('src/lib/render-queue.server.js'),final:await read('src/lib/final-artifacts.server.js'),publish:await read('src/lib/publish.server.js'),watch:await read('src/lib/watch-queue.server.js'),image:await read('src/lib/trusted-images.server.js')};
const slide=(patch={})=>({id:'s1',carousel_id:'c1',position:1,role:'hook',scene:'A man',text:'Caption',layout:2,image_url:'raw-top',image_url_2:'raw-bottom',status:'drawn',critic_status:'ok',panel_checks:[{panel:1,status:'ok'},{panel:2,status:'ok'}],reference_card:{schema_version:2,aspect:'4:5',panels:[{scene:'Top',bounds:{x:0,y:0,w:1,h:.5}},{scene:'Bottom',bounds:{x:0,y:.5,w:1,h:.5}}],text_blocks:[{text:'Caption',bounds:{x:.1,y:.4,w:.8,h:.06},font_size:.04}]},...patch});
const db=(rows=[slide()],c={})=>database({Slide:rows,Carousel:[{id:'c1',mode:'mirror',slides_count:rows.length,caption:'Approved English caption. Comment START.',status:'review',...c}],Settings:[{id:'settings',codeword:'NEW',gift:'Changed gift'}]});
const queueApi=deps=>load(source.queue,['enqueueRender','processRenderTask','saveSlideEdit','recoverRenderJobs'],{invalidateApproval:async(base,id,status)=>base.entities.Carousel.update(id,{approved_key:'',status}),...deps});
const accepted=()=>({ok:true,panels:2,heads_complete:true,hands_complete:true,margins_ok:true,captions_match:true,captions_readable:true,hero_matches:true,style_matches:true,no_extra_text:true,problem:'',fix:''});
const finals=(deps={})=>load(source.final,['finalContext','finalCheckAccepted','reviewFinalCore','approveFinalCore','approvedPack'],{askJson:async()=>accepted(),fetchTrustedImage:async()=>({type:'image/png',width:1080,height:1350}),...deps});
const reviewAndApprove=async(base,api=finals())=>{const c=await api.finalContext(base,'c1');await api.reviewFinalCore(base,{carouselId:'c1',images:[{slideId:'s1',key:c.revision.keys[0],url:'https://media.base44.com/final.png'}]});await api.approveFinalCore(base,{carouselId:'c1'},{id:'owner'});return api;};

test('simultaneous enqueue calls create one authoritative job before any image request',async()=>{
 const base=db([slide({image_url_2:'',status:'planned',panel_checks:[]})]);let paid=0;const q=queueApi({drawSlideFully:async()=>paid++});
 const result=await Promise.allSettled([q.enqueueRender(base,{id:'owner'},{carouselId:'c1'}),q.enqueueRender(base,{id:'owner'},{carouselId:'c1'})]);
 assert.equal(base.tables.TaskQueue.length,1);assert.ok(result.some(r=>r.status==='fulfilled'));
 assert.equal(base.tables.Carousel[0].active_task_id,base.tables.TaskQueue[0].id);assert.equal(paid,0);
});
test('concurrent worker steps cannot both spend on the same target',async()=>{
 const base=db([slide({image_url_2:'',panel_checks:[{panel:1,status:'ok'}]})]);let paid=0;
 const q=queueApi({drawSlideFully:async()=>{paid++;return {image_url_2:'new',status:'drawn',critic_status:'ok',panel_checks:[{panel:1,status:'ok'},{panel:2,status:'ok'}]};}});
 const job=await q.enqueueRender(base,{id:'owner'},{carouselId:'c1'});
 await Promise.all([q.processRenderTask(base,job.id),q.processRenderTask(base,job.id)]);
 assert.equal(paid,1);assert.equal(base.tables.TaskQueue[0].cursor,1);assert.equal(base.tables.Carousel[0].status,'review');
});
test('a replaced lease cannot save artwork or advance the replacement cursor',async()=>{
 const base=db([slide({image_url_2:'old',panel_checks:[{panel:1,status:'ok'},{panel:2,status:'failed'}]})]);
 const q=queueApi({drawSlideFully:async()=>{base.tables.TaskQueue[0].lease_id='new-owner';base.tables.TaskQueue[0].cursor=1;return {image_url_2:'obsolete',status:'drawn'};}});
 const job=await q.enqueueRender(base,{id:'owner'},{carouselId:'c1'});await q.processRenderTask(base,job.id);
 assert.equal(base.tables.Slide[0].image_url_2,'old');assert.equal(base.tables.TaskQueue[0].cursor,1);assert.equal(base.tables.TaskQueue[0].lease_id,'new-owner');
});
test('editing style content under the same id rejects the in-flight result',async()=>{
 const base=db([slide({image_url_2:'old',panel_checks:[{panel:1,status:'ok'},{panel:2,status:'failed'}]})],{mode:'remix',style_id:'style'});
 base.tables.MyStyle.push({id:'style',art_style:'ink',palette:['#112233']});
 const q=queueApi({drawSlideFully:async()=>{base.tables.MyStyle[0].art_style='watercolour';return {image_url_2:'obsolete'};}});
 const job=await q.enqueueRender(base,{id:'owner'},{carouselId:'c1'});await q.processRenderTask(base,job.id);
 assert.equal(base.tables.Slide[0].image_url_2,'old');assert.match(base.tables.TaskQueue[0].error,/изменилось/);
});
test('raw art acceptance never marks a carousel approved for publication',async()=>{
 const base=db([slide({image_url_2:'',panel_checks:[{panel:1,status:'ok'}]})]);
 const q=queueApi({drawSlideFully:async()=>({image_url_2:'new',status:'drawn',critic_status:'ok',panel_checks:[{panel:1,status:'ok'},{panel:2,status:'ok'}]})});
 const job=await q.enqueueRender(base,{id:'owner'},{carouselId:'c1'}),result=await q.processRenderTask(base,job.id);
 assert.equal(result.art_ready,true);assert.equal(result.ready,false);assert.equal(base.tables.Carousel[0].status,'review');assert.ok(!base.tables.Carousel[0].approved_key);
});
test('carousel image limit is reserved atomically across concurrent requests',async()=>{
 const base=db([],{image_requests:1,image_request_limit:2});const result=await Promise.allSettled([reserveUsage(base,'c1','image'),reserveUsage(base,'c1','image')]);
 assert.equal(base.tables.Carousel[0].image_requests,2);assert.equal(result.filter(r=>r.status==='fulfilled').length,1);assert.equal(result.filter(r=>r.status==='rejected').length,1);
});
test('final PNG rejects cropped hair even when the model top-level ok field is true',async()=>{
 const base=db(),check={...accepted(),heads_complete:false,problem:'Пучок срезан'};const api=finals({askJson:async()=>check});
 const c=await api.finalContext(base,'c1');const result=await api.reviewFinalCore(base,{carouselId:'c1',images:[{slideId:'s1',key:c.revision.keys[0],url:'https://media.base44.com/final.png'}]});
 assert.equal(result.ready,false);assert.equal(base.tables.Slide[0].final_check_status,'failed');await assert.rejects(()=>api.approveFinalCore(base,{carouselId:'c1'},{id:'owner'}),/Сначала проверьте/);
});
test('final checker compares the actual composite PNG with ordered expected captions',async()=>{
 let request;const base=db(),api=finals({askJson:async(_b,args)=>{request=args;return accepted();}});await reviewAndApprove(base,api);
 assert.equal(request.fileUrls[0],'https://media.base44.com/final.png');assert.match(request.prompt,/Caption/);assert.equal(request.model,'claude-sonnet-5');
 const pack=await api.approvedPack(base,'c1');assert.deepEqual(pack.images,['https://media.base44.com/final.png']);assert.equal(pack.caption,base.tables.Carousel[0].caption);
});
test('unavailable final quality service saves PNG as pending, never approved',async()=>{
 const base=db(),api=finals({askJson:async()=>{throw new Error('offline');}}),c=await api.finalContext(base,'c1');
 await api.reviewFinalCore(base,{carouselId:'c1',images:[{slideId:'s1',key:c.revision.keys[0],url:'https://media.base44.com/final.png'}]});
 assert.equal(base.tables.Slide[0].final_check_status,'pending');assert.equal(base.tables.Slide[0].final_image_url,'https://media.base44.com/final.png');await assert.rejects(()=>api.approvedPack(base,'c1'),/изменились/);
});
test('caption, panel placement, role typography and hero content invalidate approval',async()=>{
 for(const mutate of [b=>b.tables.Carousel[0].caption='Changed',b=>b.tables.Slide[0].reference_card.panels[0].image_align_y=0,b=>b.tables.MyStyle[0].typography={hook:{font:'Forum'}},b=>b.tables.Hero[0].description='another face']) {
  const base=db(undefined,{mode:'adapt',style_id:'style',hero_id:'hero'});base.tables.MyStyle.push({id:'style',art_style:'ink',caption:{font:'Montserrat'}});base.tables.Hero.push({id:'hero',description:'same face'});
  const api=await reviewAndApprove(base);mutate(base);await assert.rejects(()=>api.approvedPack(base,'c1'),/изменились/);
 }
});
test('unchanged final PNG is reused without another model request',async()=>{
 let calls=0;const base=db(),api=finals({askJson:async()=>{calls++;return accepted();}});await reviewAndApprove(base,api);const c=await api.finalContext(base,'c1');
 await api.reviewFinalCore(base,{carouselId:'c1',images:[{slideId:'s1',key:c.revision.keys[0],url:'https://media.base44.com/other.png'}]});assert.equal(calls,1);assert.ok(base.tables.Carousel[0].approved_key);
});
test('Buffer sends the approved caption verbatim despite changed global CTA settings',async()=>{
 const base=db(),api=await reviewAndApprove(base);let sent;
 const {publishApproved}=load(source.publish,['publishApproved'],{approvedPack:api.approvedPack});
 await publishApproved(base,{carouselId:'c1',channelId:'owned',text:base.tables.Carousel[0].caption,imageUrls:['https://media.base44.com/final.png']},{listChannels:async()=>[{id:'owned'}],createPost:async data=>{sent=data;return {id:'external'};}});
 assert.equal(sent.text,'Approved English caption. Comment START.');assert.equal(base.tables.Carousel[0].status,'queued');
});
test('Buffer refuses altered files, an unowned channel and repeated delivery',async()=>{
 const base=db(),api=await reviewAndApprove(base);let sends=0;
 const {publishApproved}=load(source.publish,['publishApproved'],{approvedPack:api.approvedPack});const data={carouselId:'c1',channelId:'owned',text:base.tables.Carousel[0].caption,imageUrls:['https://media.base44.com/final.png']};
 const services={listChannels:async()=>[{id:'owned'}],createPost:async()=>{sends++;return {id:'external'};}};
 await assert.rejects(()=>publishApproved(base,{...data,imageUrls:['other']},services),/отличаются/);
 await assert.rejects(()=>publishApproved(base,{...data,channelId:'foreign'},services),/не принадлежит/);
 await publishApproved(base,data,services);await assert.rejects(()=>publishApproved(base,data,services),/уже отправлена/);assert.equal(sends,1);
});
test('unknown Buffer result blocks automatic repeat to prevent duplicate posts',async()=>{
 const base=db(),api=await reviewAndApprove(base);let sends=0;
 const {publishApproved}=load(source.publish,['publishApproved'],{approvedPack:api.approvedPack});const data={carouselId:'c1',channelId:'owned',text:base.tables.Carousel[0].caption,imageUrls:['https://media.base44.com/final.png']};
 const services={listChannels:async()=>[{id:'owned'}],createPost:async()=>{sends++;throw new Error('timeout');}};
 await assert.rejects(()=>publishApproved(base,data,services));await assert.rejects(()=>publishApproved(base,data,services),/проверить в Buffer/);assert.equal(sends,1);
});
test('weekly due slot respects midnight and the stored timezone',()=>{
 assert.match(weeklySlot({digest_day:1,digest_hour:0,timezone:'Europe/Moscow'},new Date('2026-11-02T00:00:00Z')),/^2026-11-02@00/);
 assert.match(weeklySlot({digest_day:1,digest_hour:9,timezone:'Europe/Moscow'},new Date('2026-11-02T05:00:00Z')),/^2026-10-26@09/);
 assert.match(weeklySlot({digest_day:1,digest_hour:9,timezone:'Europe/Moscow'},new Date('2026-11-02T06:00:00Z')),/^2026-11-02@09/);
});
test('a complete manual scout pass handles more than eight authors once with a true remaining count',async()=>{
 const base=db(),seen=[];for(let i=0;i<12;i++)base.tables.WatchAuthor.push({id:'a'+i,handle:'h'+i,status:'active'});
 const {runWatchStep}=load(source.watch,['runWatchStep']);let runId;
 for(let i=0;i<12;i++){const res=await runWatchStep(base,runId?{runId}:{start:true},async(_b,a)=>{seen.push(a.id);return {handle:a.handle,ok:true};});runId=res.runId;assert.equal(res.remaining,11-i);}
 assert.equal(new Set(seen).size,12);assert.equal(base.tables.TaskQueue[0].status,'done');
});
test('first scheduler activation establishes a baseline without an unsolicited paid backfill',async()=>{
 const base=db();let calls=0;const {runWatchStep}=load(source.watch,['runWatchStep']);
 const res=await runWatchStep(base,{scheduled:true},async()=>calls++);assert.equal(calls,0);assert.equal(res.done,true);assert.ok(base.tables.Settings[0].digest_last_slot);
});
test('image proxy rejects lookalike hosts, credential URLs and redirect escapes before loading bytes',async()=>{
 let calls=0;const a=load(source.image,['fetchTrustedImage'],{fetch:async()=>{calls++;return new Response(null,{status:302,headers:{location:'https://evilbase44.com/private'}});}});
 for(const url of ['http://media.base44.com/x','https://evilbase44.com/x','https://user:pass@media.base44.com/x'])await assert.rejects(()=>a.fetchTrustedImage(url));
 assert.equal(calls,0);await assert.rejects(()=>a.fetchTrustedImage('https://media.base44.com/x'));assert.equal(calls,1);
});
test('image size limit cancels the stream instead of buffering an oversized response',async()=>{
 let cancelled=false;const a=load(source.image,['fetchTrustedImage'],{fetch:async()=>new Response(new ReadableStream({pull(controller){controller.enqueue(new Uint8Array(32));},cancel(){cancelled=true;}}),{headers:{'content-type':'image/png'}})});
 await assert.rejects(()=>a.fetchTrustedImage('https://media.base44.com/image',{maxBytes:40}),/слишком большая/);assert.equal(cancelled,true);
});
test('all personal-studio data operations are restricted to the existing admin role',async()=>{
 const names=(await fs.readdir(new URL('../base44/entities/',import.meta.url))).filter(n=>n.endsWith('.jsonc')&&n!=='User.jsonc');
 for(const name of names){const schema=JSON.parse(await read('base44/entities/'+name));for(const operation of ['read','create','update','delete'])assert.deepEqual(schema.rls[operation],{user_condition:{role:'admin'}},name+' '+operation);}
});

test('a positive composite check cannot override a rejected raw panel',async()=>{
 const base=db([slide({critic_status:'failed',panel_checks:[{panel:1,status:'ok'},{panel:2,status:'failed'}]})]),api=finals();
 const c=await api.finalContext(base,'c1');const result=await api.reviewFinalCore(base,{carouselId:'c1',images:[{slideId:'s1',key:c.revision.keys[0],url:'https://media.base44.com/final.png'}]});
 assert.equal(result.ready,false);await assert.rejects(()=>api.approveFinalCore(base,{carouselId:'c1'}),/проверенные/);
});
test('hero selection saves the chosen visible identity and passes it into own-style drawing references',async()=>{
 const base=db();base.tables.MyStyle.push({id:'st',name:'Samurai',hero_id:'h'});base.tables.Hero.push({id:'h',name:'Ronin',description:'old inferred identity'});
 const {saveHeroReferenceCore}=load(await read('src/lib/hero-reference.server.js'),['saveHeroReferenceCore'],{fetchTrustedImage:async()=>({}),askJson:async()=>({single_subject:true,description:'Молодой мужчина без бороды',outfit:'Фиолетовое кимоно',details:['Пучок']})});
 const bounds={x:.1,y:.1,w:.3,h:.3};await saveHeroReferenceCore(base,{styleId:'st',url:'selected-face',sourceUrl:'source',bounds});
 assert.equal(base.tables.Hero[0].identity_reference_url,'selected-face');assert.equal(base.tables.MyStyle[0].hero.identity_reference_url,'selected-face');assert.equal(base.tables.Hero[0].description,'Молодой мужчина без бороды');
 const {ownStyleReferences}=await import('../src/lib/own-style.js');assert.ok(ownStyleReferences({},base.tables.MyStyle[0]).includes('selected-face'));
});
test('ambiguous face selection leaves saved hero and style unchanged',async()=>{
 const base=db();base.tables.MyStyle.push({id:'st',hero_id:'h'});base.tables.Hero.push({id:'h',description:'keep'});
 const before=JSON.stringify(base.tables);
 const {saveHeroReferenceCore}=load(await read('src/lib/hero-reference.server.js'),['saveHeroReferenceCore'],{fetchTrustedImage:async()=>({}),askJson:async()=>({single_subject:false,description:'two people'})});
 await assert.rejects(()=>saveHeroReferenceCore(base,{styleId:'st',url:'crop'}),/одного героя/);assert.equal(JSON.stringify(base.tables),before);
});
test('final image validation rejects a raw-sized PNG before invoking a paid critic',async()=>{
 const base=db();let paid=0;const api=finals({fetchTrustedImage:async()=>({type:'image/png',width:1024,height:1024}),askJson:async()=>{paid++;return accepted();}}),c=await api.finalContext(base,'c1');
 await assert.rejects(()=>api.reviewFinalCore(base,{carouselId:'c1',images:[{slideId:'s1',key:c.revision.keys[0],url:'https://media.base44.com/raw.png'}]}),/1080/);assert.equal(paid,0);
});

test('raw panel critique checks every criterion even when aggregate ok is true',async()=>{
 const studio=await read('src/lib/studio.server.js');
 const fragment=studio.slice(studio.indexOf('async function inspectPanel'),studio.indexOf('// Кадр рисуется,'));
 const check={ok:true,integrity:false,style:true,composition:true,scene:true,hero:true,text:false,problem:'cropped head',fix:'wider frame'};
 const {inspectPanel}=load(fragment,['inspectPanel'],{critiquePanel:async()=>check,hasTextInImage:async()=>false});
 const result=await inspectPanel({},{});assert.equal(result.ok,false);assert.equal(result.pending,undefined);assert.match(result.problems[0],/cropped/);
});
test('missing raw panel criteria remain pending without authorizing a redraw',async()=>{
 const studio=await read('src/lib/studio.server.js');const fragment=studio.slice(studio.indexOf('async function inspectPanel'),studio.indexOf('// Кадр рисуется,'));
 const {inspectPanel}=load(fragment,['inspectPanel'],{critiquePanel:async()=>({ok:true}),hasTextInImage:async()=>false});
 const result=await inspectPanel({},{});assert.equal(result.ok,false);assert.equal(result.pending,true);
});

test('the composite critic cannot mistake competitor reference pixels for the final PNG',async()=>{
 const base=db([slide({reference_url:'original-with-swipe-icon'})]);let seen;
 const api=finals({askJson:async(_base,args)=>{seen=args.fileUrls;return accepted();}}),c=await api.finalContext(base,'c1');
 await api.reviewFinalCore(base,{carouselId:'c1',images:[{slideId:'s1',key:c.revision.keys[0],url:'https://media.base44.com/final.png'}]});
 assert.deepEqual(Array.from(seen),['https://media.base44.com/final.png']);assert.equal(base.tables.Slide[0].final_check_result.heads_complete,true);
});
