import {sceneKey,stalePatch} from "../src/lib/readiness.js";
import {finalKeys} from "../src/lib/revisions.js";
import test from 'node:test';
import assert from 'node:assert/strict';
import {fitCaption,captionArea,captionTop} from '../src/lib/caption-layout.js';
import {detectArtworkBounds} from '../src/lib/artwork-bounds.js';
const profile={weight:400,bold_weight:700,squeeze:1,small_scale:.5,line_spacing:1.15,uppercase:true,keep_breaks:false,max_width:.84,position:.9};
const context=()=>({font:'',measureText(text){const size=Number(this.font.match(/ (\d+)px/)[1]);return {width:[...text].reduce((n,c)=>n+(/[ЖЩШWM]/.test(c)?.9:/\s/.test(c)?.28:.55),0)*size,actualBoundingBoxAscent:size*.83,actualBoundingBoxDescent:/[ДЦЩруф]/.test(text)?size*.24:0};}});
const captions=['Не говори: «99$ в месяц»','Говори: «Всего 3$ в день»','Не говори: «Цена ремонта»','Говори: «Инвестиция в качество»','Не говори: «Это базовый вариант»','Говори: «Это необходимая основа»','Не говори: «У нас почти ничего нет»','Говори: «Осталось ограниченное количество»','Не говори: «Купи прямо сейчас»','Говори: «В наличии осталось 3 штуки»','Напишите «ХОЧУ» в комментариях — пришлю подарок'];
test('all eleven captions from the six reported cards fit each independent half with real glyph extents',()=>{
 for(const text of captions){const ctx=context(),area=captionArea(1080,720,'overlay',profile);const r=fitCaption(ctx,text,profile,'Forum',{...area,startSize:64});const top=captionTop(area,r.total,720*.9);
  assert.ok(top>=area.top);assert.ok(top+r.total<=area.bottom+.01);assert.ok(area.bottom<720);assert.ok(r.widest<=area.width);assert.ok(r.lines.length<=3);assert.ok(r.size>=24);
  assert.equal(r.lines.flatMap(l=>l.tokens.map(t=>t.text)).join('').replace(/\s/g,''),text.toUpperCase().replace(/\s/g,''));
 }
});
test('extreme long input fails explicitly rather than clipping, truncating or shrinking below readable size',()=>{
 const area=captionArea(1080,720,'overlay',profile);
 assert.throws(()=>fitCaption(context(),'Очень длинная подпись '.repeat(100),profile,'Forum',{...area,startSize:64}),/Сократите/);
 assert.throws(()=>fitCaption(context(),'Щ'.repeat(100),profile,'Forum',{...area,startSize:64}),/Сократите/);
});
test('bold and small markup, uppercase descenders and explicit breaks remain inside the safe area',()=>{
 const p={...profile,keep_breaks:true},area=captionArea(1080,720,'overlay',p),r=fitCaption(context(),'**ДЖЕМ** ==ЦЕНА==\n^^ПОДРОБНОСТИ^^',p,'Forum',{...area,startSize:64});
 assert.equal(r.lines.length,2);assert.ok(r.lines[0].tokens.some(t=>t.weight===700));assert.ok(r.lines[1].tokens.every(t=>t.size<r.size));assert.ok(captionTop(area,r.total,900)+r.total<=area.bottom);
});
test('caption area respects an explicit middle placement and remains safe for every supported shape',()=>{
 for(const h of [540,675,720,1080,1350,1440])for(const placement of ['overlay','band','strip']){
  const p={...profile,position:.4},area=captionArea(1080,h,placement,p),r=fitCaption(context(),'Читаемая подпись',p,'Forum',{...area,startSize:64});
  const top=captionTop(area,r.total,h*.4);assert.ok(top>=0);assert.ok(top+r.total<h);assert.ok(r.widest<=area.width);
  if(placement==='overlay')assert.ok((area.top+area.bottom)/2<h*.5);
 }
});
const pixels=(frame)=>{const width=200,height=140,data=new Uint8ClampedArray(width*height*4);for(let y=0;y<height;y++)for(let x=0;x<width;x++){const edge=frame && (x<4 || x>=196 || y<4 || y>=126),i=(y*width+x)*4;data.set(edge?[230,219,197,255]:[40+x%80,45+y%100,60,255],i);}return {data,width,height};};
test('light external paper frames and their footer are removed without guessing a crop on normal artwork',()=>{
 const b=detectArtworkBounds(pixels(true));assert.ok(b.x>.015 && b.x<.03);assert.ok(b.y>.02 && b.y<.04);assert.ok(b.h<.9 && b.h>.8);
 assert.deepEqual(detectArtworkBounds(pixels(false)),{x:0,y:0,w:1,h:1});
});
test('a pale full canvas is not mistaken for a detectable picture frame',()=>{
 const image=pixels(true);for(let i=0;i<image.data.length;i+=4)image.data.set([240,230,210,255],i);
 assert.deepEqual(detectArtworkBounds(image),{x:0,y:0,w:1,h:1});
});

test('a separate gray footer below a full-width keyline is trimmed without cropping the illustrated scene',()=>{
 const image=pixels(false),{data,width,height}=image;
 for(let y=112;y<height;y++)for(let x=0;x<width;x++)data.set([155,151,139,255],(y*width+x)*4);
 for(let x=0;x<width;x++)data.set([8,8,8,255],(111*width+x)*4);
 assert.deepEqual(detectArtworkBounds(image),{x:0,y:0,w:1,h:1});
 const b=detectArtworkBounds(image,{trimFooter:true});assert.equal(b.x,0);assert.equal(b.y,0);assert.equal(b.w,1);assert.ok(b.h>.77 && b.h<.8);
});
test('a uniform pale floor without a full-width keyline is never guessed to be a footer',()=>{
 const image=pixels(false),{data,width,height}=image;
 for(let y=112;y<height;y++)for(let x=0;x<width;x++)data.set([155,151,139,255],(y*width+x)*4);
 assert.deepEqual(detectArtworkBounds(image),{x:0,y:0,w:1,h:1});
});


test('the footer switch changes final output identity while preserving accepted artwork and its scene key',async()=>{
 const slide={id:'s',position:1,scene:'samurai',text:'text',reference_card:{panels:[{scene:'samurai',bounds:{x:0,y:0,w:1,h:1}}]}};
 const next={...slide,reference_card:{...slide.reference_card,panels:[{...slide.reference_card.panels[0],trim_footer:true}]}};
 assert.equal(sceneKey(slide),sceneKey(next));assert.deepEqual(stalePatch(slide,next),{});
 const c={mode:'adapt',caption:'caption'};assert.notEqual((await finalKeys(c,[slide])).keys[0],(await finalKeys(c,[next])).keys[0]);
});
