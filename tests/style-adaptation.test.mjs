import * as editorialStore from '../src/lib/editorial-store.server.js';
import * as editorialPolicy from '../src/lib/editorial-policy.js';
import * as imageModels from '../src/lib/image-models.js';
/* global console, structuredClone, URL, AbortSignal, Response */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import * as own from '../src/lib/own-style.js';
const read=p=>fs.readFile(new URL(`../${p}`,import.meta.url),'utf8');
const studio=await read('src/lib/studio.server.js');
const section=(s,a,b)=>s.slice(s.indexOf(a),s.indexOf(b,s.indexOf(a)));
function load(source,names,deps={}) {
  const clean=source.replace(/import[\s\S]*?from\s+['"][^'"]+['"];?/g,'').replaceAll('export async function','async function').replaceAll('export function','function').replaceAll('export const','const').replaceAll('export default async function','async function');
  return vm.runInContext(`${clean};({${names.join(',')}})`,vm.createContext({...editorialStore,...editorialPolicy,...editorialStore,...editorialPolicy,...imageModels,...deps,Date,console,URL,AbortSignal,crypto:webcrypto}));
}
const {panelAspect}=load(await read('src/lib/core.server.js'),['panelAspect']);
const card={schema_version:2,aspect:'1080:1350',art_style:'SOURCE_FOX_ANIMATION',palette:['#FFAA00'],reference_url:'https://media.base44.com/fox',panel_crops:['FOX_CROP'],lettering_version:1,
  panels:[{scene:'source fox',bounds:{x:0,y:0,w:1,h:1}}],text_blocks:[{text:'source English',font:'Montserrat',color:'#FFFF00',bounds:{x:.1,y:.8,w:.8,h:.1}}]};
const hero={name:'Samurai Ronin',description:'Japanese man, topknot',default_outfit:'blue-grey kimono',never_change:['red katana hilt']};
const style={id:'samurai-style',name:'Samurai',aspect:'3:4',art_style:'MY_INK_GRAPHIC_NOVEL',palette:['#112233'],caption:{font:'KellySlab',color:'#FFFFFF',accent:'#CC3344',uppercase:true,weight:700},typography:{hook:{font:'Oswald'}},source_slide_urls:['https://media.base44.com/samurai'],hero,hero_id:'ronin'};
const profile={schema_version:2,cards_count:1,cards:[card]};

test('side-by-side source captions keep their scene when adapting to own layout',()=>{
  const horizontal={...card,panels:[{scene:'left',bounds:{x:0,y:0,w:.5,h:1}},{scene:'right',bounds:{x:.5,y:0,w:.5,h:1}}],text_blocks:[
    {...card.text_blocks[0],bounds:{x:.05,y:.8,w:.4,h:.1}},
    {...card.text_blocks[0],bounds:{x:.55,y:.8,w:.4,h:.1}}
  ]};
  assert.deepEqual(own.ownStyleCard(horizontal,style).text_blocks.map(b=>b.panel_index),[0,1]);
});

test('own-style plan replaces all source visuals without mutating its original',()=>{
  const plan={reference_profile:profile,slides:[{role:'body',reference_card:card}]};
  const result=own.applyOwnStyle(plan,style),c=result.slides[0].reference_card;
  assert.equal(c.art_style,style.art_style);assert.equal(c.text_blocks[0].font,'KellySlab');assert.equal(c.text_blocks[0].color,'#FFFFFF');
  assert.deepEqual(c.palette,['#112233']);assert.equal(c.aspect,'3:4');assert.equal(c.lettering_version,0);
  assert.equal(c.reference_url,undefined);assert.equal(c.panel_crops,undefined);assert.equal(card.art_style,'SOURCE_FOX_ANIMATION');
  assert.equal(result.reference_profile,profile);
});
test('actual adaptation pipeline forwards full style, colour and role typography',async()=>{
  const {adaptedReferencePlan}=load(await read('src/lib/reference-adapt.js'),['adaptedReferencePlan']);
  const api=load(section(studio,'async function prepareOwnStyle','export async function reviseCore'),['planCore'],{
    ...own,withCta:x=>x,isExactMode:()=>false,ADAPT_REFERENCE_PROMPT:({style:s})=>{assert.equal(s.caption.font,'KellySlab');return 'adapt';},
    ADAPTED_CARDS_SCHEMA:{},askJson:async()=>({cards:[{index:1,panels:['Ronin in a dojo'],texts:['Мой текст']}]}),
    adaptedReferencePlan,applyConfirmedCta:x=>x,checkPlanCards:x=>x
  });
  const result=await api.planCore({}, {style,reference:profile,mode:'adapt',hero,language:'ru'});
  assert.equal(result.slides[0].reference_card.own_caption.font,'Oswald');
  assert.equal(result.slides[0].reference_card.art_style,'MY_INK_GRAPHIC_NOVEL');
});
test('artist receives own style and full hero passport, never fox images or crop',async()=>{
  let sent;
  const {drawCore}=load(section(studio,'export async function drawCore','export async function critiqueCore'),['drawCore'],{...own,panelAspect,imageFromPrompt:async(_b,prompt,refs)=>{sent={prompt,refs};return 'image';}});
  await drawCore({}, {slide:{reference_url:'FOX_URL',reference_card:own.ownStyleCard(card,style)},style,hero,cardCrop:'FOX_CROP'});
  assert.ok(sent.prompt.includes('MY_INK_GRAPHIC_NOVEL'));assert.ok(sent.prompt.includes('blue-grey kimono'));
  assert.ok(!sent.prompt.includes('SOURCE_FOX_ANIMATION'));assert.deepEqual(sent.refs,['https://media.base44.com/samurai']);
});
test('own-style critic compares against own samples and accepts independent composition',async()=>{
  let sent;
  const {critiquePanel}=load(section(studio,'async function critiquePanel','// Кадр проверяется'),['critiquePanel'],{...own,CRITIC_PANEL_SCHEMA:{},askJson:async(_b,args)=>{sent=args;return {ok:true};}});
  await critiquePanel({}, {card:own.ownStyleCard(card,style),panelIndex:0,hero,referenceUrl:'FOX_URL',imageUrl:'RESULT'});
  assert.deepEqual(Array.from(sent.fileUrls),['https://media.base44.com/samurai','RESULT']);
  assert.ok(sent.prompt.includes('MY_INK_GRAPHIC_NOVEL'));assert.ok(sent.prompt.includes('Не требуй композицию чужого поста'));
});
test('retry keeps own style and excludes the source fox image',async()=>{
  let sent,checks=0;
  const {drawCheckedPanel}=load(section(studio,'async function drawCheckedPanel','export async function drawSlideFully'),['drawCheckedPanel'],{...own,drawCore:async()=> 'draft',inspectPanel:async()=>++checks===1?{ok:false,problems:['wrong style'],fix:'use ink'}:{ok:true},panelAspect,imageFromPrompt:async(_b,prompt,refs)=>{sent={prompt,refs};return 'fixed';}});
  const result=await drawCheckedPanel({}, {slide:{reference_url:'FOX_URL',reference_card:own.ownStyleCard(card,style)},style,hero,index:0});
  assert.equal(result.status,'ok');assert.deepEqual(Array.from(sent.refs),['draft','https://media.base44.com/samurai']);assert.ok(sent.prompt.includes('MY_INK_GRAPHIC_NOVEL'));
});
test('missing adaptation output fails instead of leaking source text or character',async()=>{
  const {adaptedReferencePlan}=load(await read('src/lib/reference-adapt.js'),['adaptedReferencePlan']);
  assert.throws(()=>adaptedReferencePlan(profile,{cards:[{index:1,panels:['Ronin'],texts:[]}]}),/пропустил подпись/);
  assert.throws(()=>adaptedReferencePlan(profile,{cards:[{index:1,panels:[],texts:['Текст']}]}),/пропустил сцену/);
});
test('creating a carousel persists the selected hero; mirror clears it',async()=>{
  let saved;
  const db={entities:{Settings:{list:async()=>({items:[]})},Hero:{get:async()=>hero},Carousel:{create:async row=>{saved=row;return {id:'new',...row};}},Slide:{bulkCreate:async()=>{}}}};
  const {createCarouselFromPlan}=load(section(studio,'export async function createCarouselFromPlan','// Серия на неделю:'),['createCarouselFromPlan'],{slideRecord:()=>({})});
  await createCarouselFromPlan(db,{plan:{slides:[]},style,mode:'adapt'});assert.equal(saved.hero_id,'ronin');assert.equal(saved.hero_name,'Samurai Ronin');
  await createCarouselFromPlan(db,{plan:{slides:[]},style,mode:'mirror'});assert.equal(saved.hero_id,'');
});
test('restyling preserves original, selected hero and permits a return to mirror',async()=>{
  const carousel={id:'c',style_id:style.id,hero_id:'ronin',reference_profile:profile,reference_images:['source']};
  const db={entities:{Carousel:{get:async()=>structuredClone(carousel),update:async(_id,p)=>Object.assign(carousel,p)},MyStyle:{get:async()=>style},Hero:{get:async()=>hero},Settings:{list:async()=>({items:[]})}}};
  const {restyleCarouselCore}=load(section(studio,'export async function restyleCarouselCore','// Перевод меняет'),['restyleCarouselCore'],{isExactMode:m=>['mirror','remix'].includes(m),isTranslated:l=>l!=='orig',planCore:async()=>({slides:[{}]}),replaceCarouselSlides:async()=>1});
  await restyleCarouselCore(db,{carouselId:'c',mode:'adapt'});assert.equal(carousel.reference_profile.schema_version,2);assert.equal(carousel.hero_id,'ronin');
  await restyleCarouselCore(db,{carouselId:'c',mode:'mirror'});assert.equal(carousel.mode,'mirror');assert.equal(carousel.hero_id,'');
});
test('final own-style canvas uses saved typography and captions for each panel',async()=>{
  const two={...card,panels:[{scene:'a',bounds:{x:0,y:0,w:1,h:.5}},{scene:'b',bounds:{x:0,y:.5,w:1,h:.5}}],text_blocks:[{...card.text_blocks[0],text:'Верх',bounds:{x:0,y:.3,w:1,h:.1}},{...card.text_blocks[0],text:'Низ',bounds:{x:0,y:.8,w:1,h:.1}}]};
  const c=own.ownStyleCard(two,style);let painted=0;const calls=[];
  const {renderOwnStyleCard}=load(await read('src/lib/own-style-canvas.js'),['renderOwnStyleCard'],{document:{createElement:()=>({})}});
  const canvas={getContext:()=>({fillRect:()=>{},drawImage:()=>painted++})};
  await renderOwnStyleCard(canvas,{referenceCard:c,imageUrl:'TOP',imageUrl2:'BOTTOM',strict:true},async(_c,options)=>calls.push(options));
  assert.equal(canvas.width,1080);assert.equal(canvas.height,1440);assert.equal(painted,2);
  assert.deepEqual(calls.map(c=>c.text),['Верх','Низ']);assert.equal(calls[0].profile.font,'KellySlab');assert.equal(calls[0].profile.uppercase,true);
  assert.deepEqual(Array.from(calls[0].dimensions),[1080,720]);assert.equal(calls[1].imageUrl,'BOTTOM');assert.equal(calls[1].strict,true);
});

test('successful original analysis survives a later planning failure',async()=>{
  const carousel={id:'c',style_id:style.id,source_post_id:'post',reference_profile:{}};
  const db={entities:{Carousel:{get:async()=>structuredClone(carousel),update:async(_id,p)=>Object.assign(carousel,p)},MyStyle:{get:async()=>style},Hero:{get:async()=>hero},SourcePost:{get:async()=>({slide_images:['source']})},Settings:{list:async()=>({items:[]})}}};
  const {restyleCarouselCore}=load(section(studio,'export async function restyleCarouselCore','// Перевод меняет'),['restyleCarouselCore'],{isExactMode:()=>false,isTranslated:()=>true,readReference:async()=>profile,planCore:async()=>{throw Error('planner unavailable');}});
  await assert.rejects(()=>restyleCarouselCore(db,{carouselId:'c',mode:'adapt'}),/planner unavailable/);
  assert.equal(carousel.reference_profile.schema_version,2);assert.equal(carousel.reference_images[0],card.reference_url);
});

test('Base44 uploaded files accept the official app URL and trusted CDN redirect without reupload',async()=>{
  const bytes=new ArrayBuffer(28),view=new DataView(bytes);view.setUint32(0,0x89504e47);view.setUint32(16,1080);view.setUint32(20,1350);
  const fetched=[];
  const {referenceImageSize}=load((await read('src/lib/trusted-images.server.js'))+'\n'+await read('src/lib/reference-image.server.js'),['referenceImageSize'],{fetch:async url=>{
    fetched.push(url);return url.startsWith('https://base44.app/') ? new Response(null,{status:302,headers:{location:'https://media.base44.com/stored.png'}}) : new Response(bytes,{headers:{'content-type':'image/png'}});
  }});
  const result=await referenceImageSize('https://base44.app/api/file',{});
  assert.equal(result.width,1080);assert.equal(result.url,'https://base44.app/api/file');assert.equal(fetched.length,2);
});
test('image redirects and lookalike domains cannot bypass the trusted-host boundary',async()=>{
  let fetched=0;
  const {referenceImageSize}=load((await read('src/lib/trusted-images.server.js'))+'\n'+await read('src/lib/reference-image.server.js'),['referenceImageSize'],{fetch:async()=>{fetched++;return {status:302,headers:{get:()=> 'https://evilbase44.app/image'}};}});
  await assert.rejects(()=>referenceImageSize('https://base44.app/api/file',{}),/адрес картинки не разрешён/);
  assert.equal(fetched,1);
  await assert.rejects(()=>referenceImageSize('https://evilbase44.app/image',{}),/адрес картинки не разрешён/);
  assert.equal(fetched,1);
});


test('adaptation merges fragmented or duplicated OCR into one translated caption per scene',async()=>{
  const {adaptedReferencePlan}=load(await read('src/lib/reference-adapt.js'),['adaptedReferencePlan']);
  const fragmented={...card,panels:[{scene:'a',bounds:{x:0,y:0,w:1,h:.5}},{scene:'b',bounds:{x:0,y:.5,w:1,h:.5}}],text_blocks:[...card.text_blocks,...card.text_blocks,...card.text_blocks]};
  const result=adaptedReferencePlan({schema_version:2,cards:[fragmented]},{cards:[{index:1,panels:['Самурай: проблема','Самурай: решение'],texts:['Вопрос?','Ответ.']}]});
  assert.equal(result.slides[0].reference_card.text_blocks.length,2);
  assert.equal(result.slides[0].text,'Вопрос?\n\nОтвет.');
  assert.deepEqual(Array.from(result.slides[0].reference_card.text_blocks,b=>b.panel_index),[0,1]);
  assert.ok(!result.slides[0].text.includes('English'));
});


test('duplicated full captions trigger one bounded planning repair, not a silent duplicate',async()=>{
  const pair={...card,panels:[{scene:'a',bounds:{x:0,y:0,w:1,h:.5}},{scene:'b',bounds:{x:0,y:.5,w:1,h:.5}}],text_blocks:[{text:'Question?'},{text:'Answer.'}]};
  const {adaptedReferencePlan}=load(await read('src/lib/reference-adapt.js'),['adaptedReferencePlan']);let calls=0;
  const api=load(section(studio,'async function prepareOwnStyle','export async function reviseCore'),['planCore'],{...own,withCta:x=>x,isExactMode:()=>false,ADAPT_REFERENCE_PROMPT:()=> 'adapt',ADAPTED_CARDS_SCHEMA:{},
    askJson:async()=>({cards:[{index:1,panels:['Ронин: проблема','Ронин: решение'],texts:++calls===1?['Вопрос?\nОтвет.','Вопрос?\nОтвет.']:['Вопрос?','Ответ.']}]}),adaptedReferencePlan,applyConfirmedCta:x=>x,checkPlanCards:x=>x});
  const result=await api.planCore({}, {style,reference:{schema_version:2,cards:[pair]},mode:'adapt',hero,language:'ru'});
  assert.equal(calls,2);assert.equal(result.slides[0].text,'Вопрос?\n\nОтвет.');
});

test('removing an approved CTA leaves no orphan sentence punctuation',async()=>{
  const {applyConfirmedCta}=load(await read('src/lib/cta.js'),['applyConfirmedCta'],{isTranslated:()=>true});
  const result=applyConfirmedCta({caption:'Текст.\n\nМой призыв.\n\n#тег',slides:[{text:'a'}]},{cta:'Мой призыв'},'ru');
  assert.equal(result.caption,'Текст.\n\n#тег\n\nМой призыв');
});


test('top-aligned placement preserves the head that a centred square-to-wide crop cuts off',async()=>{
  const source=await read('src/lib/slide-renderer.js');const calls=[];
  const {coverImage}=load(section(source,'function coverImage','// Насколько'),['coverImage']);
  const context={drawImage:(...args)=>calls.push(args)},image={width:1024,height:1024};
  coverImage(context,image,0,0,1080,675);coverImage(context,image,0,0,1080,675,0);
  const headPixel=100,scale=1080/1024;
  assert.ok(calls[0][2]+headPixel*scale<0);
  assert.ok(calls[1][2]+headPixel*scale>=0);
});

test('changing crop alignment preserves accepted artwork while scene changes invalidate it',async()=>{
  const {stalePatch}=load(await read('src/lib/readiness.js'),['stalePatch']);
  const before={scene:'Ронин',reference_card:own.ownStyleCard(card,style)};
  const after=structuredClone(before);after.reference_card.panels[0].image_align_y=0;
  assert.equal(Object.keys(stalePatch(before,after)).length,0);
  after.reference_card.panels[0].scene='Другая сцена';assert.equal(stalePatch(before,after).image_stale,true);
});
