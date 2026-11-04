/* global URL, crypto, TextEncoder, console */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import * as policy from '../src/lib/editorial-policy.js';
import * as store from '../src/lib/editorial-store.server.js';
import * as revisions from '../src/lib/revisions.js';
import * as readiness from '../src/lib/readiness.js';
import {captionSvg,ownCardSvg} from '../src/lib/server-card-layout.js';
import {imageDimensions} from '../src/lib/image-dimensions.js';
import {ownStyleCard} from '../src/lib/own-style.js';
import {decodeArtwork,coverPixels,shadePixels,paintOwnCard} from '../src/lib/server-card-paint.js';
import {database} from './db-fixture.mjs';
const load=async(file,names,deps={})=>vm.runInNewContext((await fs.readFile(new URL('../src/lib/'+file,import.meta.url),'utf8')).replace(/import[\s\S]*?from\s+['"][^'"]+['"];?/g,'').replaceAll('export async function','async function').replaceAll('export function','function').replaceAll('export const','const')+'\n({'+names+'})',{...policy,...store,...revisions,...readiness,crypto,Date,URL,TextEncoder,console,...deps});
const settings=(patch={})=>({id:'settings',editorial_revision:1,editorial_control_version:1,editorial:{...policy.DEFAULT_EDITORIAL,configured:true,stages:{...policy.PRESETS.manual},limits:{...policy.DEFAULT_EDITORIAL.limits},...patch}});
const art=(patch={})=>({id:'s',carousel_id:'c',position:1,status:'drawn',critic_status:'ok',image_url:'top',image_url_2:'bottom',panel_checks:[{panel:1,status:'ok'},{panel:2,status:'ok'}],reference_card:{schema_version:2,visual_mode:'own',aspect:'4:5',own_caption:{font:'Forum',color:'#fff',accent:'#abc',size:64,position:.8},panels:[{scene:'top',bounds:{x:0,y:0,w:1,h:.5}},{scene:'bottom',bounds:{x:0,y:.5,w:1,h:.5}}],text_blocks:[{text:'Top',panel_index:0},{text:'Bottom',panel_index:1}]},...patch});
const base=(patch={})=>database({Settings:[settings()],Carousel:[{id:'c',mode:'adapt',status:'review',slides_count:1}],Slide:[art()],...patch});

test('all automatic stages and real posting are off before setup',()=>{
 for(const stage of policy.STAGES)assert.equal(policy.stageAutomatic(null,stage.id),false);
 assert.equal(policy.PRESETS.editor.approval,false);assert.equal(policy.PRESETS.autopilot.publish,false);
 assert.equal(policy.stageAutomatic(settings({paused:true,stages:policy.PRESETS.autopilot}),'production'),false);
});
test('brief includes editorial guidance only after setup and forbids invented product facts',()=>{
 assert.equal(policy.briefPrompt(null),'');const p=policy.briefPrompt(settings({audience:'Teachers',topics:'Learning',bad_examples:'Clickbait'}));
 assert.match(p,/Teachers/);assert.match(p,/Clickbait/);assert.match(p,/Не выдумывай/);
});
test('concurrent usage reservations cannot exceed the global hard cap',async()=>{
 const b=base({Settings:[settings({limits:{image_day:3,image_week:4}})]});
 const r=await Promise.allSettled(Array.from({length:12},()=>store.reserveStudioUsage(b,'image')));
 assert.equal(r.filter(x=>x.status==='fulfilled').length,3);assert.equal(b.tables.Settings[0].usage_image_day,3);assert.equal(b.tables.Settings[0].usage_image_week,3);
});
test('daily rollover preserves weekly usage and weekly rollover clears every counter',async()=>{
 const b=base();Object.assign(b.tables.Settings[0],{usage_day:'2026-11-02',usage_week:'2026-11-02',usage_image_day:5,usage_image_week:5,usage_text_day:4,usage_text_week:4});
 await store.reserveStudioUsage(b,'image',new Date('2026-11-03T12:00Z'));
 assert.equal(b.tables.Settings[0].usage_image_day,1);assert.equal(b.tables.Settings[0].usage_image_week,6);assert.equal(b.tables.Settings[0].usage_text_day,0);assert.equal(b.tables.Settings[0].usage_text_week,4);
 await store.reserveStudioUsage(b,'text',new Date('2026-11-09T12:00Z'));
 assert.equal(b.tables.Settings[0].usage_image_week,0);assert.equal(b.tables.Settings[0].usage_text_week,1);
});
test('pause and zero allowance block spending before the service call',async()=>{
 const b=base({Settings:[settings({paused:true})]});await assert.rejects(()=>store.reserveStudioUsage(b,'image'),/паузе/);
 b.tables.Settings[0].editorial.paused=false;b.tables.Settings[0].editorial.limits.image_week=0;
 await assert.rejects(()=>store.reserveStudioUsage(b,'image'),/лимит/);assert.equal(b.tables.Settings[0].usage_image_day,undefined);
});
test('a pause racing a reservation invalidates the old settings snapshot',async()=>{
 const b=base(),update=b.entities.Settings.updateMany;let once=true;
 b.entities.Settings.updateMany=async(q,p)=>{if(once){once=false;b.tables.Settings[0].editorial.paused=true;b.tables.Settings[0].editorial_control_version++;}return update(q,p);};
 await assert.rejects(()=>store.reserveStudioUsage(b,'image'),/паузе/);assert.equal(b.tables.Settings[0].usage_image_day,undefined);
});
test('periods and slots use the configured local calendar including DST and half-hour zones',()=>{
 assert.equal(policy.periodKeys('America/Montevideo',new Date('2026-11-03T01:00Z')).day,'2026-11-02');
 const e={timezone:'Asia/Kolkata',publish_days:[1,2,3,4,5,6,7],publish_hour:12};
 assert.equal(policy.nextPublicationSlot(e,[],new Date('2026-11-03T00:00Z')),'2026-11-03T06:30:00.000Z');
 const dst={...e,timezone:'America/New_York',publish_hour:1};
 const slot=policy.nextPublicationSlot(dst,['2026-11-01T05:00Z'],new Date('2026-11-01T04:00Z'));
 assert.equal(policy.periodKeys(dst.timezone,new Date(slot)).day,'2026-11-02');
});
test('Buffer proof requires sent time, external link and automatic publishing',async()=>{
 const {deliveryPatch}=await load('delivery.server.js','deliveryPatch');const c={buffer_post_id:'p',buffer_channel_id:'ch'};
 const sent={id:'p',channelId:'ch',status:'sent',sentAt:'2026-11-03T12:00Z',externalLink:'https://www.instagram.com/p/proof/',schedulingType:'automatic'};
 assert.equal(deliveryPatch(sent,c).delivery_status,'published');
 for(const patch of [{sentAt:null},{externalLink:null},{schedulingType:'notification'}])assert.equal(deliveryPatch({...sent,...patch},c).delivery_status,'needs_review');
 assert.equal(deliveryPatch({...sent,status:'scheduled'},c).status,'scheduled');
 assert.equal(deliveryPatch({...sent,status:'error'},c).delivery_status,'error');
 assert.throws(()=>deliveryPatch({...sent,channelId:'other'},c),/не соответствует/);
});
test('unknown submission reconciliation never creates another external post',async()=>{
 const b=base();Object.assign(b.tables.Carousel[0],{publish_state:'unknown'});let reads=0;
 const {reconcileDelivery}=await load('delivery.server.js','reconcileDelivery');
 const r=await reconcileDelivery(b,'c',async()=>{reads++;});assert.equal(r.state,'unknown');assert.equal(reads,0);
});
test('preflight cancellation and a definitive Buffer rejection release the send lock, timeout does not',async()=>{
 for(const kind of ['preflight','rejected','timeout']){
  const b=base();Object.assign(b.tables.Carousel[0],{approved_key:'key',approved_caption:'caption'});let sent=0;
  const {publishApproved}=await load('publish.server.js','publishApproved',{approvedPack:async()=>({carousel:await b.entities.Carousel.get('c'),caption:'caption',images:['png']})});
  const deps={listChannels:async()=>[{id:'ch'}],authorize:async()=>{if(kind==='preflight')throw new Error('paused');},createPost:async()=>{sent++;throw Object.assign(new Error(kind),{submissionRejected:kind==='rejected'});}};
  await assert.rejects(()=>publishApproved(b,{carouselId:'c',channelId:'ch',text:'caption',imageUrls:['png']},deps));
  assert.equal(sent,kind==='preflight'?0:1);assert.equal(b.tables.Carousel[0].publish_state,kind==='timeout'?'unknown':'idle');
 }
});
test('linking a found Buffer post requires exact caption, channel and ordered images',async()=>{
 const b=base();Object.assign(b.tables.Carousel[0],{publish_state:'unknown',buffer_channel_id:'ch',approved_caption:'caption'});b.tables.Slide[0].final_image_url='https://media.base44.com/final.png';
 const {linkUnknownDelivery}=await load('delivery.server.js','linkUnknownDelivery');
 const post={id:'p',channelId:'ch',text:'caption',assets:[{source:'https://media.base44.com/final.png'}],status:'scheduled'};
 await assert.rejects(()=>linkUnknownDelivery(b,{carouselId:'c',postId:'p'},async()=>({...post,text:'changed'})),/не совпадают/);
 assert.equal(b.tables.Carousel[0].buffer_post_id,undefined);
 await linkUnknownDelivery(b,{carouselId:'c',postId:'p'},async()=>post);assert.equal(b.tables.Carousel[0].buffer_post_id,'p');
});
const repairApi=deps=>load('repair.server.js','requestRepair',{invalidateApproval:async(b,id)=>b.entities.Carousel.update(id,{approved_key:''}),...deps});
test('repair of the lower scene preserves the upper scene and sends one explicit target',async()=>{
 const b=base();b.tables.Slide[0].panel_checks[1]={panel:2,status:'failed',fix:'Fix cropped hand'};let target;
 const {requestRepair}=await repairApi({enqueueRender:async(_b,_u,args)=>{target=args.panelTargets;return {id:'task'};}});
 const r=await requestRepair(b,{id:'owner'},{carouselId:'c'});
 assert.equal(r.targets,1);assert.equal(target[0].panel,1);assert.equal(b.tables.Slide[0].image_url,'top');assert.equal(b.tables.Slide[0].panel_checks[0].status,'ok');assert.equal(b.tables.Carousel[0].repair_attempts,1);
});
test('layout repair spends no image requests and preserves font, colors and text',async()=>{
 const b=base();Object.assign(b.tables.Slide[0],{final_check_status:'failed',final_check_result:{issues:[{panel:2,kind:'layout',fix:'Caption covers face'}]}});let paid=0;
 const before=JSON.stringify(b.tables.Slide[0].reference_card.text_blocks);
 const {requestRepair}=await repairApi({enqueueRender:async()=>paid++});
 const r=await requestRepair(b,{id:'owner'},{carouselId:'c'});
 assert.equal(b.tables.Slide[0].reference_card.own_caption_overrides[0],undefined);assert.equal(b.tables.Slide[0].reference_card.own_caption_overrides[1].size,56);assert.equal(r.layoutOnly,true);assert.equal(paid,0);assert.equal(b.tables.Slide[0].image_url_2,'bottom');
 assert.equal(b.tables.Slide[0].reference_card.own_caption.font,'Forum');assert.equal(b.tables.Slide[0].reference_card.own_caption.accent,'#abc');assert.equal(JSON.stringify(b.tables.Slide[0].reference_card.text_blocks),before);
});
test('two simultaneous repair clicks produce one repair, and two attempts is the total cap',async()=>{
 const b=base();b.tables.Slide[0].panel_checks[1].status='failed';let paid=0;
 const {requestRepair}=await repairApi({enqueueRender:async()=>{paid++;return {id:'task'};}});
 const r=await Promise.allSettled([requestRepair(b,{id:'owner'},{carouselId:'c'}),requestRepair(b,{id:'owner'},{carouselId:'c'})]);
 assert.equal(r.filter(x=>x.status==='fulfilled').length,1);assert.equal(paid,1);
 b.tables.Carousel[0].repair_attempts=2;await assert.rejects(()=>requestRepair(b,{id:'owner'},{carouselId:'c'}),/Две попытки/);assert.equal(paid,1);
});
test('ambiguous quality issues stop repair without ordering new art',async()=>{
 const b=base();Object.assign(b.tables.Slide[0],{final_check_status:'failed',final_image_url:'final',final_check_note:'Something is wrong'});let paid=0;
 const {requestRepair}=await repairApi({meteredClient:b=>b,askJson:async()=>({certain:false,issues:[]}),enqueueRender:async()=>paid++});
 await assert.rejects(()=>requestRepair(b,{id:'owner'},{carouselId:'c'}),/Не удалось уверенно/);assert.equal(paid,0);assert.equal(b.tables.Carousel[0].repair_attempts,undefined);
});
test('idea collection obeys weekly cap, active author allowlist, exclusions and deduplication',async()=>{
 const b=base({Settings:[settings({posts_per_week:2,excluded_topics:'gambling'})],WatchAuthor:[{id:'a',handle:'allowed',status:'active'}],SourcePost:[
 {id:'x',handle:'other',seen:false,post_type:'carousel',slide_images:['one']},
 {id:'y',handle:'allowed',seen:false,post_type:'carousel',slide_images:['one'],caption_text:'GAMBLING strategy'},
 ...[1,2,3].map(n=>({id:'source'+n,handle:'allowed',seen:false,post_type:'carousel',slide_images:['one'],caption_text:'Idea '+n}))]});
 const {collectEditorialIdeas}=await load('editorial.server.js','collectEditorialIdeas');
 await Promise.all([collectEditorialIdeas(b),collectEditorialIdeas(b)]);await collectEditorialIdeas(b);
 assert.equal(b.tables.EditorialItem.length,2);assert.equal(new Set(b.tables.EditorialItem.map(x=>x.source_id)).size,2);assert.ok(b.tables.EditorialItem.every(x=>x.status==='idea'));
});
test('policy approval is blocked after a hero, model, style or revision change',async()=>{
 const b=base({MyStyle:[{id:'style',art_style:'ink',hero_id:'hero'}],Hero:[{id:'hero',name:'Ronin'}]});
 const api=await load('editorial-config.server.js','editorialVisuals,policyCanApprove');const s=b.tables.Settings[0];Object.assign(s.editorial,{style_id:'style',stages:{...policy.PRESETS.autopilot}});
 const v=await api.editorialVisuals(b,s.editorial);s.editorial.template_signature=v.signature;
 const c={style_id:'style',hero_id:'hero',image_model:'automatic',mode:'adapt',policy_revision:1,policy_signature:v.signature};
 assert.equal(await api.policyCanApprove(b,s,c),true);
 for(const p of [{hero_id:'fox'},{image_model:'gpt-image-2'},{policy_revision:2},{policy_signature:'old'},{mode:'mirror'}])assert.equal(await api.policyCanApprove(b,s,{...c,...p}),false);
 b.tables.MyStyle[0].art_style='watercolor';assert.equal(await api.policyCanApprove(b,s,c),false);
});
test('saving editorial settings preserves pause and does not invalidate work on an unchanged save',async()=>{
 const s=settings({style_id:'style',paused:true}),b=base({Settings:[s],MyStyle:[{id:'style',art_style:'ink'}]});
 const {saveEditorialConfig}=await load('editorial-config.server.js','saveEditorialConfig');
 const data={...s.editorial,paused:false,allow_auto_approval:false};
 await saveEditorialConfig(b,data);assert.equal(b.tables.Settings[0].editorial.paused,true);assert.equal(b.tables.Settings[0].editorial_revision,1);
 await saveEditorialConfig(b,{...data,audience:'Teachers'});assert.equal(b.tables.Settings[0].editorial_revision,2);
});
test('autoapproval cannot be enabled without an explicit acknowledgment and matching approved sample',async()=>{
 const s=settings({style_id:'style'}),b=base({Settings:[s],MyStyle:[{id:'style',art_style:'ink'}]});
 const {saveEditorialConfig}=await load('editorial-config.server.js','saveEditorialConfig');
 const data={...s.editorial,stages:{...policy.PRESETS.autopilot},allow_auto_approval:false};
 await assert.rejects(()=>saveEditorialConfig(b,data),/Подтвердите разрешение/);
 await assert.rejects(()=>saveEditorialConfig(b,{...data,allow_auto_approval:true}),/Сначала утвердите/);
 assert.equal(b.tables.Settings[0].editorial.stages.approval,false);
});
test('unconfigured and paused ticks do not start paid production or external publication',async()=>{
 for(const e of [{configured:false},{configured:true,paused:true}]){
  const b=base({Settings:[settings(e)]});let work=0;
  const {editorialTick}=await load('editorial.server.js','editorialTick',{reconcileDueDeliveries:async()=>[],planCore:async()=>work++,createBufferPost:async()=>work++});
  await editorialTick(b);assert.equal(work,0);
 }
});
test('incomplete recovered plans require a human and do not trigger another paid plan',async()=>{
 const s=settings({style_id:'style',stages:{...policy.PRESETS.autopilot,approval:false}}),item={id:'i',status:'planning',policy_revision:1,config_snapshot:s.editorial};let paid=0;
 const b=base({Settings:[s],MyStyle:[{id:'style',art_style:'ink'}],EditorialItem:[item],Carousel:[{id:'c',editorial_item_id:'i',slides_count:2,policy_revision:1}],Slide:[]});
 const {editorialTick}=await load('editorial.server.js','editorialTick',{reconcileDueDeliveries:async()=>[],editorialVisuals:async()=>({signature:'sig'}),planCore:async()=>paid++});
 await editorialTick(b);assert.equal(paid,0);assert.equal(b.tables.EditorialItem[0].status,'error');assert.match(b.tables.EditorialItem[0].error,/неполный/);
});
test('an idle review item cannot starve another actionable production item',async()=>{
 const s=settings({stages:{...policy.PRESETS.manual,approval:true,production:true}});
 const b=base({Settings:[s],EditorialItem:[{id:'first',created_date:'1',status:'review',carousel_id:'c',config_snapshot:s.editorial,policy_revision:1},{id:'second',created_date:'2',status:'approved',source_id:'source',config_snapshot:s.editorial,policy_revision:1}],SourcePost:[{id:'source',slide_images:['one']} ]});let plans=0;
 const {editorialTick}=await load('editorial.server.js','editorialTick',{reconcileDueDeliveries:async()=>[],finalContext:async()=>({carousel:b.tables.Carousel[0]}),policyCanApprove:async()=>false,editorialVisuals:async()=>({style:{},signature:'s'}),planCore:async()=>{plans++;throw new Error('test stop');}});
 await editorialTick(b);assert.equal(plans,1);
});
test('human approval in Author advances the editorial item while preserving a deliberate deferral',async()=>{
 for(const status of ['review','deferred']){
  const b=base({EditorialItem:[{id:'i',status}]});b.tables.Carousel[0].editorial_item_id='i';
  const api=await load('final-artifacts.server.js','finalContext,approveFinalCore');const c=await api.finalContext(b,'c');
  Object.assign(b.tables.Slide[0],{final_image_url:'png',final_render_key:c.revision.keys[0],final_check_status:'ok'});
  await api.approveFinalCore(b,{carouselId:'c'},{id:'owner'});assert.equal(b.tables.EditorialItem[0].status,status==='review'?'ready':'deferred');
 }
});
test('a deferred approved post resumes from its saved stage when its time arrives',async()=>{
 const s=settings(),b=base({Settings:[s],EditorialItem:[{id:'i',status:'deferred',carousel_id:'c',deferred_until:'2020-01-01T00:00Z',deferred_status:'ready',policy_revision:1,config_snapshot:s.editorial}]});
 const {editorialTick}=await load('editorial.server.js','editorialTick',{reconcileDueDeliveries:async()=>[]});await editorialTick(b);
 assert.equal(b.tables.EditorialItem[0].status,'ready');assert.equal(b.tables.EditorialItem[0].deferred_until,'');
});
const font={charToGlyphIndex:()=>1,getAdvanceWidth:(t,s)=>t.length*s*.5,getPath:(t,x,y,s)=>({getBoundingBox:()=>({x1:x,y1:y-s*.8,x2:x+t.length*s*.5,y2:y+s*.2}),toPathData:()=>`M${x} ${y}h${t.length*s*.5}v${-s}z`})};
const profile={placement:'overlay',font:'Forum',weight:400,bold_weight:400,size:90,max_width:.84,position:.8,squeeze:1,line_spacing:1.15,small_scale:.5,color:'#fff',accent:'#f00',shadow:true};
test('server captions fit both dimensions and render measured glyph paths instead of fallback text',()=>{
 const r=captionSvg('Длинная подпись самурая в нижнем кадре',profile,()=>font,1080,675,1);
 assert.ok(r.layout.widest<=r.area.width);assert.ok(r.layout.total<=r.area.height);assert.match(r.svg,/<path/);assert.doesNotMatch(r.svg,/<text/);
 assert.throws(()=>captionSvg('x'.repeat(500),profile,()=>font,1080,675,1),/слишком длинная/);
});
test('server card preserves two fullbleed scenes and rejects unsupported manual crop',()=>{
 const c=art().reference_card,img={href:'data:image/png;base64,AA==',width:1536,height:1024};
 const svg=ownCardSvg(c,[img,img],profile,()=>font);assert.equal((svg.match(/<image /g)||[]).length,2);assert.match(svg,/height="1350"/);
 c.panels[1].trim_footer=true;assert.throws(()=>ownCardSvg(c,[img,img],profile,()=>font),/ручной обрезкой/);
});
test('refreshing a card before queued art repair preserves the local caption repair',()=>{
 const c=art().reference_card;c.own_caption_overrides={1:{size:56,position:.86,smart_place:false}};
 const next=ownStyleCard(c,{art_style:'ink',caption:c.own_caption,aspect:c.aspect});
 assert.equal(next.own_caption_overrides[0],undefined);assert.equal(next.own_caption_overrides[1].size,56);
 assert.equal(readiness.sceneKey({reference_card:c}),readiness.sceneKey({reference_card:{...c,own_caption_overrides:undefined}}));
});
test('invalid image payload cannot supply dimensions to the renderer',()=>{
 assert.throws(()=>imageDimensions(new Uint8Array([1,2,3,4])),/изображ|формат|рисун/i);
});
test('background shading keeps scene pixels visible rather than creating an opaque caption plate',()=>{
 const b={width:2,height:4,data:new Uint8Array(32).fill(200)};shadePixels(b,1,.7);
 assert.equal(b.data[0],200);assert.equal(b.data[8],200);assert.ok(b.data[24]>0 && b.data[24]<200);assert.equal(b.data[27],200);
});
test('PNG assembly retains independent fullbleed top and bottom scenes',()=>{
 const card=art().reference_card;card.text_blocks=[];
 const blue={width:2,height:2,data:new Uint8Array([0,0,255,255,0,0,255,255,0,0,255,255,0,0,255,255])};
 const red={...blue,data:new Uint8Array([255,0,0,255,255,0,0,255,255,0,0,255,255,0,0,255])};
 const png=paintOwnCard(card,[blue,red],profile,()=>font),image=decodeArtwork({type:'image/png',bytes:png});
 assert.equal(image.width,1080);assert.equal(image.height,1350);assert.equal(image.data[2],255);assert.equal(image.data[(1080*1349+1079)*4],255);
});
test('cover samples only the selected vertical crop and rejects unsupported WebP explicitly',()=>{
 const source={width:1,height:3,data:new Uint8Array([255,0,0,255,0,255,0,255,0,0,255,255])};
 const a={width:1,height:1,data:new Uint8Array(4)},b={...a,data:new Uint8Array(4)};coverPixels(a,source,1,0);coverPixels(b,source,1,1);
 assert.equal(a.data[0],255);assert.equal(b.data[2],255);assert.throws(()=>decodeArtwork({type:'image/webp',bytes:new Uint8Array()}),/PNG или JPEG/);
});
