import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {TEXT_STYLE,textCard,textStyle,textSlides,textReviewPrompt} from '../src/lib/text-cards.js';
import {carouselReadiness,panelCount} from '../src/lib/readiness.js';
import {captionArea,fitCaption} from '../src/lib/caption-layout.js';
const read=p=>fs.readFile(new globalThis.URL(`../src/lib/${p}`,import.meta.url),'utf8');
const section=(s,a,b)=>s.slice(s.indexOf(a),s.indexOf(b,s.indexOf(a)));
function load(source,names,deps={}) {
  const clean=source.replace(/import[\s\S]*?from\s+['"][^'"]+['"];?/g,'').replaceAll('export async function','async function').replaceAll('export function','function').replaceAll('export const','const');
  return vm.runInContext(`${clean};({${names.join(',')}})`,vm.createContext({...deps,Date}));
}
const source={schema_version:2,cards_count:2,source_caption:'Исходная подпись',cards:[1,2].map(n=>({...textCard('Текст '+n,TEXT_STYLE),reference_url:'https://media.base44.com/card'+n}))};
test('text format explicitly clears a hero inherited from settings or style',()=>{
 const style=textStyle({hero:{name:'Лис'},hero_id:'fox',hero_sheet_url:'fox.png'});
 assert.equal(style.hero,null);assert.equal(style.hero_id,'');assert.equal(style.hero_sheet_url,'');
});
test('source text layout preserves all text blocks, font, colour and bounds without artwork',()=>{
 const profile=globalThis.structuredClone(source);profile.cards[0].panels=[{scene:'old hero'}];profile.cards[0].lettering_version=1;
 const slides=textSlides(profile);
 assert.deepEqual(slides[0].reference_card.panels,[]);assert.deepEqual(slides[0].reference_card.text_blocks,profile.cards[0].text_blocks);
 assert.equal(slides[0].reference_card.lettering_version,0);assert.equal(slides[0].scene,'');
});
test('own text plan uses saved typography and never inherits the source character',()=>{
 const style={...TEXT_STYLE,caption:{font:'Oswald',color:'#112233'},typography:{hook:{font:'Forum'}}};
 const plan=textSlides(source,style,{cards:[{index:1,text:'**Новая мысль**'},{index:2,text:'==Второй шаг=='}]});
 assert.equal(plan[0].reference_card.own_caption.font,'Forum');assert.equal(plan[1].reference_card.own_caption.font,'Oswald');assert.equal(plan[1].reference_card.own_caption.color,'#112233');
 assert.equal(plan[0].reference_card.own_caption.text_only,true);assert.equal(plan[0].reference_card.own_caption.scrim_opacity,0);
});
test('missing text, changed count and reordered slides are rejected instead of substituted',()=>{
 assert.throws(()=>textSlides(source,TEXT_STYLE,{cards:[]}));
 assert.throws(()=>textSlides(source,TEXT_STYLE,{cards:[{index:1,text:''},{index:2,text:'b'}]}));
 assert.throws(()=>textSlides(source,TEXT_STYLE,{cards:[{index:2,text:'a'},{index:1,text:'b'}]}));
});
test('text has zero artwork panels and is renderable before image generation',()=>{
 const slides=[{position:1,text:'Одна мысль',reference_card:textCard('Одна мысль')}];
 assert.equal(panelCount(slides[0]),0);assert.equal(carouselReadiness(slides,1).ready,true);
 assert.equal(carouselReadiness([{...slides[0],text:''}],1).ready,false);
 assert.equal(carouselReadiness([{...slides[0],reference_card:null}],1).ready,false);
});
test('creating text carousel never looks up or persists a style hero',async()=>{
 const studio=await read('studio.server.js');let saved;
 const {createCarouselFromPlan}=load(section(studio,'export async function createCarouselFromPlan','// Серия на неделю:'),['createCarouselFromPlan'],{normalizeImageModel:()=> 'automatic',slideRecord:()=>({}),});
 const db={entities:{Settings:{list:async()=>({items:[]})},Hero:{get:async()=>{throw Error('must not look up hero');}},Carousel:{create:async x=>(saved={id:'text',...x})},Slide:{bulkCreate:async()=>{}}}};
 await createCarouselFromPlan(db,{plan:{slides:[{reference_card:textCard('Привет')}],content_format:'text'},style:{hero_id:'fox',hero:{name:'Лис'}},mode:'adapt'});
 assert.equal(saved.content_format,'text');assert.equal(saved.hero_id,'');assert.equal(saved.hero_name,'');
});
test('text queue completes without creating jobs or spending image requests',async()=>{
 let updated=false;
 const source=await read('render-queue.server.js');
 const {enqueueRender}=load(source,['enqueueRender'],{assertStudioRunning:async()=>{}});
 const db={entities:{Carousel:{get:async()=>({content_format:'text'}),update:async()=>{updated=true;}},TaskQueue:{filter:()=>{throw Error('image queue called');},create:()=>{throw Error('image job created');}}}};
 const result=await enqueueRender(db,{id:'owner'},{carouselId:'text'});assert.equal(result.total,0);assert.equal(updated,true);
});
test('direct image-generation endpoint rejects text cards before any model is called',async()=>{
 const studio=await read('studio.server.js');
 const {drawCore}=load(section(studio,'export async function drawCore','export async function critiqueCore'),['drawCore']);
 await assert.rejects(()=>drawCore({}, {slide:{reference_card:textCard('Текст')}}),/без генерации/);
});
test('mirror text plan does not call a story model; own story uses text only',async()=>{
 const module=await read('text-cards.server.js');let calls=0;
 const {planTextCarousel}=load(module,['planTextCarousel'],{textCard,textSlides,textStyle,readReference:async()=>source,askJson:async options=>{calls++;assert.equal(options.fileUrls,undefined);return {title:'Новая',caption:'Подпись',cards:[{index:1,text:'Своя мысль'},{index:2,text:'Свой вывод'}]};}});
 const hooks={localize:async p=>p,finish:p=>p};
 const mirrored=await planTextCarousel({}, {mode:'mirror',reference:source},hooks);assert.equal(calls,0);assert.equal(mirrored.slides[0].text,'Текст 1');
 const own=await planTextCarousel({}, {mode:'original',reference:source,style:TEXT_STYLE},hooks);assert.equal(calls,1);assert.equal(own.slides[0].reference_card.visual_mode,'text');
});
test('text typography has full safe canvas and rejects unreadable overflow',()=>{
 const p={...TEXT_STYLE.caption,text_only:true,placement:'overlay',position:.5,max_width:.82,line_spacing:1.25,squeeze:1,small_scale:.5};
 const area=captionArea(1080,1350,'overlay',p);assert.ok(area.height>1000);assert.ok(area.top>0 && area.bottom<1350);
 const ctx={font:'',measureText(text){const size=Number(/(\d+)px/.exec(this.font)?.[1]||64);return {width:text.length*size*.6,actualBoundingBoxAscent:size*.8,actualBoundingBoxDescent:size*.2};}};
 const fit=fitCaption(ctx,'Одна мысль на карточке. '.repeat(25),p,'Arial',{width:area.width,height:area.height,startSize:64,maxLines:24,minSize:24});assert.ok(fit.total<=area.height);assert.ok(fit.lines.length>3);
 assert.throws(()=>fitCaption(ctx,'ОченьДлинноеНеразрывноеСлово'.repeat(500),p,'Arial',{width:area.width,height:area.height,startSize:64,maxLines:24,minSize:24}),/Сократите/);
});
test('pixel critic explicitly accepts absence of heroes and requires zero scenes',()=>{
 const prompt=textReviewPrompt({reference_card:textCard('Смысл')});assert.match(prompt,/panels=0/);assert.match(prompt,/отсутствие героя не является ошибкой/);
});

test('restyling removes previous final PNGs and checks before showing new cards',async()=>{
 const studio=await read('studio.server.js');let updates;
 const {replaceCarouselSlides}=load(section(studio,'async function replaceCarouselSlides','// Пересобрать карусель'),['replaceCarouselSlides'],{slideRecord:slide=>slide});
 const db={entities:{Slide:{filter:async()=>({items:[{id:'old',final_image_url:'old.png'}]}),bulkUpdate:async rows=>{updates=rows;},bulkCreate:async()=>{},delete:async()=>{}}}};
 await replaceCarouselSlides(db,'carousel',{slides:[{text:'Новый текст',reference_card:textCard('Новый текст')}]});
 assert.equal(updates[0].final_image_url,'');assert.equal(updates[0].final_render_key,'');assert.equal(updates[0].final_check_status,'pending');assert.equal(updates[0].final_renderer,'server-text-v1');
});

test('text from a reel or series brief plans seven cards without image reading',async()=>{
 const module=await read('text-cards.server.js');let asked=0;
 const {planTextCarousel}=load(module,['planTextCarousel'],{textCard,textSlides,textStyle,readReference:async()=>{throw Error('no images to read');},askJson:async()=>{asked++;return {title:'Из рассказа',caption:'Подпись',cards:Array.from({length:7},(_,i)=>({index:i+1,text:'Мысль '+(i+1)}))};}});
 const result=await planTextCarousel({}, {mode:'original',style:TEXT_STYLE,sourceText:'Достаточно длинный исходный рассказ без картинок'}, {localize:async p=>p,finish:p=>p});
 assert.equal(asked,1);assert.equal(result.slides.length,7);assert.ok(result.slides.every(s=>s.reference_card.visual_mode==='text' && s.reference_card.panels.length===0));
 await assert.rejects(()=>planTextCarousel({}, {mode:'mirror',sourceText:'Исходный рассказ'}, {}),/нужны изображения/);
});
