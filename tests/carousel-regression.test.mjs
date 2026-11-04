import * as editorialStore from '../src/lib/editorial-store.server.js';
import * as editorialPolicy from '../src/lib/editorial-policy.js';
import * as imageModels from '../src/lib/image-models.js';
/* global console, URL */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import * as ready from '../src/lib/readiness.js';
import * as revisions from '../src/lib/revisions.js';
import {ownStyleCard} from '../src/lib/own-style.js';
import {meteredClient} from '../src/lib/usage.server.js';
import {database} from './db-fixture.mjs';
import { slideOptions } from '../src/lib/slide-options.js';
const read = file => fs.readFile(new URL(`../${file}`, import.meta.url), 'utf8');
const studio = await read('src/lib/studio.server.js');
const section = (source, start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start))).replaceAll('export async function', 'async function');
function load(source, names, deps = {}) {
  const context = vm.createContext({...editorialStore,...editorialPolicy, ...editorialStore,...editorialPolicy, ...imageModels, ...revisions, ownStyleCard, meteredClient, ...deps, console, Date, crypto: webcrypto });
  const clean = source.replace(/import[\s\S]*?from\s+['"][^'"]+['"];?/g, '').replaceAll('export async function', 'async function').replaceAll('export function', 'function').replaceAll('export const', 'const').replace(/export\s*\{[^}]*\};?/g,'');
  return vm.runInContext(`${clean}\n;({${names.join(',')}})`, context);
}
const {panelAspect}=load(await read('src/lib/core.server.js'),['panelAspect']);
const card = () => ({ schema_version: 2, panels: [{scene:'One'}, {scene:'Two'}], text_blocks: [{text:'Follow @source', font:'Oswald', font_size:.04, bounds:{x:.1,y:.1,w:.8,h:.1}}] });
const slide = () => ({id:'s1',carousel_id:'c1',position:1,scene:'One, Two',layout:2,image_url:'first',image_url_2:'second',status:'drawn',critic_status:'ok',panel_checks:[{panel:1,status:'ok'},{panel:2,status:'ok'}],reference_card:card()});
function fakeDb(rows=[slide()],carousel={id:'c1',title:'Test',slides_count:rows.length,mode:'mirror'}) {
 return database({Slide:rows,Carousel:[carousel]});
}

test('ready requires both panels, accepted critic, nonempty and complete series',()=>{
  const s=slide();assert.equal(ready.carouselReadiness([s],1).ready,true);
  for(const patch of [{image_url_2:''},{critic_status:'failed'},{critic_status:'pending'},{image_stale:true},{panel_checks:[{panel:1,status:'ok'}]}]) assert.equal(ready.slideReady({...s,...patch}),false);
  assert.equal(ready.carouselReadiness([],0).ready,false);
  assert.equal(ready.carouselReadiness([s],2).ready,false);
});
test('scene edits invalidate artwork without deleting URLs; text edits preserve artwork',()=>{
  const s=slide();assert.deepEqual(ready.stalePatch(s,{...s,text:'translated'}),{});
  const patch=ready.stalePatch(s,{...s,scene:'Different'});
  assert.equal(patch.image_stale,true);assert.equal({...s,...patch}.image_url,'first');
  assert.equal(ready.slideReady({...s,...patch}),false);
});
test('importer preserves owner and format-specific ranking baseline',async()=>{
  const source=await read('src/lib/apify.server.js');
  const apify=load(source,['normalizePost','rankHits','median','cleanHandle'],{secrets:{get:()=>null}});
  assert.equal(apify.normalizePost({ownerUsername:'seikostate'}).handle,'seikostate');
  assert.equal(apify.normalizePost({owner:{username:'foxonmoney'}}).handle,'foxonmoney');
  assert.equal(apify.cleanHandle('https://www.instagram.com/buildwithorin/'),'buildwithorin');
  const posts=[100,100,300].map(likes=>({type:'carousel',likes})).concat([10,10,10].map(likes=>({type:'image',likes})));
  const hit=apify.rankHits(posts,'carousel')[0];assert.equal(hit.baseline,100);assert.equal(hit.ratio,3);
});
test('cached search restores author and uses hit baseline rather than obsolete mixed value',async()=>{
  const {scoutCore}=load(section(studio,'export async function scoutCore','export async function readReelCore'),['scoutCore'],{
    cleanHandle:x=>x,readScoutCache:async()=>({baseline:20,total:40,hits:[{baseline:100,url:'post'}]})
  });
  const result=await scoutCore({}, {handle:'forshogunn'});assert.equal(result.baseline,100);assert.equal(result.hits[0].handle,'forshogunn');
});
test('confirmed CTA is exact in final card, removes source handle and survives original-language mode',async()=>{
  const {applyConfirmedCta}=load(await read('src/lib/cta.js'),['applyConfirmedCta'],{isTranslated:x=>x!=='orig'});
  const plan={caption:'Follow @source',slides:[{text:'hook'},{reference_card:card()}]};
  const result=applyConfirmedCta(plan,{cta:'MY EXACT CTA',instagram_handle:'mine'},'ru');
  assert.equal(result.slides[1].text,'MY EXACT CTA\n@mine');assert.equal(result.slides[1].reference_card.text_blocks[0].text,'MY EXACT CTA\n@mine');
  assert.equal(result.caption.includes('@source'),false);assert.ok(result.caption.includes('MY EXACT CTA'));
  assert.equal(applyConfirmedCta(plan,{cta:'replacement'},'orig'),plan);
});
test('exact plan awaits localization before layout validation',async()=>{
  const {planCore}=load(section(studio,'export async function planCore','export async function reviseCore'),['planCore'],{
    withCta:x=>x,isExactMode:()=>true,referencePlan:()=>({slides:[]}),
    localizePlan:async()=>({slides:[{text:'localized'}]}),applyConfirmedCta:x=>x,
    checkPlanCards:plan=>{assert.equal(typeof plan.then,'undefined');return {...plan,validated:true};}
  });
  const result=await planCore({}, {reference:{schema_version:2}});assert.equal(result.validated,true);
});
test('failed or partial panel check cannot mark a slide drawn',async()=>{
  const {drawSlideFully}=load(section(studio,'export async function drawSlideFully','// Один автор недельной разведки'),['drawSlideFully'],{
    drawCheckedPanel:async()=>({url:'new',status:'failed',note:'letters'})
  });
  const result=await drawSlideFully({}, {slide:{...slide(),panel_checks:[]},panelIndex:0});
  assert.equal(result.status,'failed');assert.equal(result.critic_status,'failed');
});
test('critic outage preserves generated image but returns pending, never OK',async()=>{
  const {drawSlideFully}=load(section(studio,'export async function drawSlideFully','// Один автор недельной разведки'),['drawSlideFully'],{
    drawCore:async()=> 'generated',critiqueCore:async()=>{throw new Error('offline');}
  });
  const result=await drawSlideFully({}, {slide:{}});assert.equal(result.image_url,'generated');assert.equal(result.critic_status,'pending');assert.equal(result.status,'failed');
});
test('legacy redraw is checked again before acceptance',async()=>{
  let checks=0;
  const {drawSlideFully}=load(section(studio,'export async function drawSlideFully','// Один автор недельной разведки'),['drawSlideFully'],{
    drawCore:async()=> 'generated',critiqueCore:async()=>{checks++;return {ok:false,problem:'still bad'};}
  });
  const result=await drawSlideFully({}, {slide:{}});assert.equal(checks,2);assert.equal(result.critic_status,'failed');
});
test('quality service outage does not trigger another paid redraw',async()=>{
  const {drawCheckedPanel}=load(section(studio,'async function drawCheckedPanel','export async function drawSlideFully'),['drawCheckedPanel'],{
    drawCore:async()=> 'generated',inspectPanel:async()=>({ok:false,pending:true,problems:['offline']})
  });
  const result=await drawCheckedPanel({}, {slide:slide(),index:0});assert.equal(result.status,'pending');assert.equal(result.url,'generated');
});
test('Telegram pack rejects missing second panel and empty carousels',async()=>{
  const {carouselPackCore}=load(section(studio,'export async function carouselPackCore','// Отчёт разведчика'),['carouselPackCore'],ready);
  let db=fakeDb([{...slide(),image_url_2:''}]);assert.equal((await carouselPackCore(db,{carouselId:'c1'})).ready,false);
  db=fakeDb([]);assert.equal((await carouselPackCore(db,{carouselId:'c1'})).ready,false);
});
test('language switch preserves image URLs, checks, scenes and hero',async()=>{
  const db=fakeDb();db.tables.Carousel[0].hero_id='hero';
  const {relanguageCarouselCore}=load(section(studio,'export async function relanguageCarouselCore','// Готовый пакет для Telegram'),['relanguageCarouselCore'],{
    ...ready,withCta:x=>x,localizePlan:async(_base,plan)=>({...plan,slides:plan.slides.map(s=>({...s,text:'translated',reference_card:{...s.reference_card,text_blocks:s.reference_card.text_blocks.map(b=>({...b,text:'translated'}))}}))}),
    applyConfirmedCta:x=>x,checkPlanCards:x=>x
  });
  await relanguageCarouselCore(db,{carouselId:'c1',language:'es'});
  const s=db.tables.Slide[0];assert.equal(s.text,'translated');assert.equal(s.image_url,'first');assert.equal(s.image_url_2,'second');assert.equal(s.critic_status,'ok');assert.equal(s.scene,'One, Two');assert.equal(db.tables.Carousel[0].hero_id,'hero');
});
test('shared render contract carries exact panel geometry and strict export option',()=>{
  const s=slide();const options=slideOptions(s,{strict:true});assert.equal(options.referenceCard,s.reference_card);assert.equal(options.strict,true);assert.equal(options.imageUrl2,'second');
});
const queueSource=await read('src/lib/render-queue.server.js');
test('resume queues only unaccepted panels and deduplicates active jobs',async()=>{
  const db=fakeDb([{...slide(),critic_status:'failed',panel_checks:[{panel:1,status:'ok'},{panel:2,status:'failed'}]}]);
  const {enqueueRender}=load(queueSource,['enqueueRender'],ready);
  const job=await enqueueRender(db,{id:'owner'},{carouselId:'c1'});
  assert.equal(job.total,1);assert.equal(job.targets[0].panel,1);
  const again=await enqueueRender(db,{id:'owner'},{carouselId:'c1'});assert.equal(again.id,job.id);assert.equal(db.tables.TaskQueue.length,1);
});
test('durable worker saves one panel per step and never returns ready after rejected quality',async()=>{
  const db=fakeDb([{...slide(),image_url_2:'',critic_status:'pending',panel_checks:[{panel:1,status:'ok'}]}]);
  let calls=0;
  const api=load(queueSource,['enqueueRender','processRenderTask'],{...ready,drawSlideFully:async()=>{calls++;return {image_url_2:'new2',status:'failed',critic_status:'failed',panel_checks:[{panel:1,status:'ok'},{panel:2,status:'failed'}]};}});
  const job=await api.enqueueRender(db,{id:'owner'},{carouselId:'c1'});
  const result=await api.processRenderTask(db,job.id);assert.equal(result.done,true);assert.equal(result.ready,false);assert.equal(calls,1);
  assert.equal(db.tables.Carousel[0].status,'review');assert.equal(db.tables.Slide[0].image_url_2,'new2');assert.equal(db.tables.TaskQueue[0].cursor,1);
  await api.processRenderTask(db,job.id);assert.equal(calls,1);
});
test('pause before step spends no credits and changes carousel status',async()=>{
  const db=fakeDb([{...slide(),image_url_2:''}]);
  let calls=0;const api=load(queueSource,['enqueueRender','pauseRender','processRenderTask'],{...ready,drawSlideFully:async()=>{calls++;}});
  const job=await api.enqueueRender(db,{id:'owner'},{carouselId:'c1'});await api.pauseRender(db,{taskId:job.id});await api.processRenderTask(db,job.id);
  assert.equal(calls,0);assert.equal(db.tables.TaskQueue[0].status,'paused');assert.equal(db.tables.Carousel[0].status,'paused');
});
test('edited scene rejects obsolete worker result without overwriting current artwork',async()=>{
  const db=fakeDb([{...slide(),image_url_2:''}]);
  const api=load(queueSource,['enqueueRender','processRenderTask'],{...ready,drawSlideFully:async()=>{db.tables.Slide[0].scene='changed while drawing';return {image_url:'obsolete'};}});
  const job=await api.enqueueRender(db,{id:'owner'},{carouselId:'c1'});await api.processRenderTask(db,job.id);
  assert.equal(db.tables.Slide[0].image_url,'first');assert.equal(db.tables.TaskQueue[0].status,'review');
});
test('server mark-ready rejects stale artwork even when requested outside UI',async()=>{
  const db=fakeDb([{...slide(),image_stale:true}]);const {markCarouselReady}=load(queueSource,['markCarouselReady'],ready);
  await assert.rejects(()=>markCarouselReady(db,{carouselId:'c1'}),/проверенные/);
});


test('generation wrapper supports user client and workflow service client',async()=>{
  const {imageFromPrompt,hasTextInImage}=load(await read('src/lib/core.server.js'),['imageFromPrompt','hasTextInImage'],{TEXT_CHECK_PROMPT:'check'});
  const service={integrations:{Core:{GenerateImage:async()=>({url:'generated'}),InvokeLLM:async()=>({has_text:false})}}};
  assert.equal(await imageFromPrompt({asServiceRole:service},'prompt',[]),'generated');
  assert.equal(await imageFromPrompt(service,'prompt',[]),'generated');
  assert.equal(await hasTextInImage(service,'image'),false);
  service.integrations.Core.InvokeLLM=async()=>({});
  await assert.rejects(()=>hasTextInImage(service,'image'),/не вернула/);
});
test('CTA replacement removes the entire source-follow line without leaving a blank handle',async()=>{
  const {applyConfirmedCta}=load(await read('src/lib/cta.js'),['applyConfirmedCta'],{isTranslated:()=>true});
  const result=applyConfirmedCta({caption:'Useful material.\n\nПодпишитесь на @source для обновлений.',slides:[{text:'source'}]},{cta:'EXACT CTA'},'ru');
  assert.equal(result.caption,'Useful material.\n\nEXACT CTA');
});


test('reference verification rejects invented text before saving a plan',async()=>{
  const source=await read('src/lib/reference.server.js');
  const {readReference}=load(source,['readReference'],{referenceImages:x=>x,referenceImageSize:async()=>({width:1080,height:1350,url:'stable-upload'}),
    READ_REFERENCE_CARD:'Read image',REFERENCE_CARD_SCHEMA:{},validateReferenceCard:x=>x,
    askJson:async(_base,args)=> args.schema.properties?.ok ? {ok:false,problem:'invented text'} : {panels:[{bounds:{x:0,y:0,w:1000,h:1000}}],text_blocks:[]}});
  await assert.rejects(()=>readReference({}, {images:['source']}),/invented text/);
});
test('reference analysis uses uploaded image URL rather than expiring source CDN URL',async()=>{
  const source=await read('src/lib/reference.server.js');let urls=[];
  const {readReference}=load(source,['readReference'],{referenceImages:x=>x,referenceImageSize:async()=>({width:1080,height:1350,url:'stable-upload'}),
    READ_REFERENCE_CARD:'Read image',REFERENCE_CARD_SCHEMA:{},validateReferenceCard:x=>x,
    askJson:async(_base,args)=>{urls.push(args.fileUrls[0]);return args.schema.properties?.ok ? {ok:true,problem:''} : {panels:[{bounds:{x:0,y:0,w:1000,h:1000}}],text_blocks:[]};}});
  const result=await readReference({}, {images:['expiring-source']});assert.deepEqual(urls,['stable-upload','stable-upload']);assert.equal(result.cards[0].verified,true);
});


test('Buffer receives the saved reviewed PNG and never re-renders it with another typography',async()=>{
 let renders=0;
 const {slideToPublicUrl}=load(await read('src/lib/buffer-upload.js'),['slideToPublicUrl'],{renderSlide:async()=>renders++});
 const s={...slide(),final_image_url:'reviewed-png',final_render_key:'key',final_check_status:'ok'};
 assert.equal(await slideToPublicUrl(s,{style:{font:'different'}}),'reviewed-png');assert.equal(renders,0);
 await assert.rejects(()=>slideToPublicUrl({...s,final_check_status:'pending'}),/проверьте/);
});



test('resuming first panel preserves the already accepted second-panel check by number',async()=>{
  const {drawSlideFully}=load(section(studio,'export async function drawSlideFully','// Один автор недельной разведки'),['drawSlideFully'],{
    drawCheckedPanel:async()=>({url:'new-first',status:'ok',note:''})
  });
  const input={...slide(),image_url:'',status:'planned',critic_status:'pending',panel_checks:[{panel:2,status:'ok'}]};
  const result=await drawSlideFully({}, {slide:input,panelIndex:0});
  assert.equal(result.status,'drawn');assert.equal(result.critic_status,'ok');assert.equal(result.panel_checks.length,2);
  assert.equal(result.panel_checks[1].panel,2);
});


test('confirmed CTA occurs once at the very end, after hashtags',async()=>{
  const {applyConfirmedCta}=load(await read('src/lib/cta.js'),['applyConfirmedCta'],{isTranslated:()=>true});
  const result=applyConfirmedCta({caption:'Material.\nПодпишись  для большего.\nMY CTA\n#tag',slides:[{}]},{cta:'MY CTA'},'ru');
  assert.ok(result.caption.endsWith('MY CTA'));assert.equal(result.caption.split('MY CTA').length,2);assert.equal(result.caption.includes('Подпишись'),false);
});


test('panel retry uses saved feedback and edits the rejected draft before checking again',async()=>{
  let firstFix='';let refs;let inspected=0;
  const {drawCheckedPanel}=load(section(studio,'async function drawCheckedPanel','export async function drawSlideFully'),['drawCheckedPanel'],{
    drawCore:async(_base,args)=>{firstFix=args.fix;return 'draft';},
    inspectPanel:async()=>++inspected===1 ? {ok:false,problems:['wrong mask'],fix:'Use the white glasses'} : {ok:true,problems:[]},
    panelAspect,imageFromPrompt:async(_base,prompt,references)=>{assert.ok(prompt.includes('Use the white glasses'));refs=references;return 'fixed';}
  });
  const result=await drawCheckedPanel({}, {slide:{...slide(),reference_url:'source',panel_checks:[{panel:1,status:'failed',fix:'Keep white glasses'}]},index:0});
  assert.ok(firstFix.includes('Keep white glasses'));assert.equal(refs[0],'draft');assert.equal(refs[1],'source');assert.equal(result.status,'ok');assert.equal(inspected,2);
});


test('older two-scene plans accept their single composite illustration',()=>{
  const composite={layout:2,image_url:'complete-illustration',status:'drawn',critic_status:'ok'};
  assert.equal(ready.panelCount(composite),1);assert.equal(ready.slideReady(composite),true);
  assert.equal(ready.slideReady({...composite,reference_card:{schema_version:2,panels:[{},{}]}}),false);
});

