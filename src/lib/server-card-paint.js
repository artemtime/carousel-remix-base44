import {Bitmap} from "pureimage/dist/bitmap.js";
import {decode as decodePng,encode as encodePng,convertIndexedToRgb} from "fast-png";
import jpeg from "jpeg-js";
import {captionSvg,safeColor} from "./server-card-layout.js";
import {captionTop} from "./caption-layout.js";

export function decodeArtwork(file) {
  if(file.type==="image/webp")throw new Error("Для фоновой сборки нужен PNG или JPEG. Эту карточку можно собрать в браузере.");
  let image=file.type==="image/jpeg"?jpeg.decode(file.bytes,{useTArray:true,maxResolutionInMP:5,maxMemoryUsageInMB:64}):decodePng(file.bytes);
  if(image.palette)image={...image,data:convertIndexedToRgb(image),channels:image.palette[0].length,depth:8};
  const {width,height,channels=4,depth=8}=image;
  if(![8,16].includes(depth))throw new Error("Этот PNG использует редкую глубину цвета. Соберите карточку в браузере.");
  if(!(width>0 && height>0) || width*height>5_000_000)throw new Error("Рисунок слишком большой для фоновой сборки");
  if(channels===4 && depth===8)return {width,height,data:image.data};
  const data=new Uint8Array(width*height*4),sample=n=>depth===16?Math.round(n/257):depth<8?Math.round(n*255/((1<<depth)-1)):n;
  for(let i=0;i<width*height;i++){
    const k=i*channels,o=i*4;data[o]=sample(image.data[k]);data[o+1]=sample(image.data[k+(channels>=3?1:0)]);data[o+2]=sample(image.data[k+(channels>=3?2:0)]);data[o+3]=channels===2 || channels===4?sample(image.data[k+channels-1]):255;
  }
  return {width,height,data};
}
// Bilinear cover without per-pixel object allocation. Each panel has its own crop.
export function coverPixels(target,image,picHeight,alignY=.5) {
  const W=target.width,H=Math.min(target.height,Math.ceil(picHeight)),scale=Math.max(W/image.width,picHeight/image.height);
  const offsetX=(image.width*scale-W)/2,offsetY=(image.height*scale-picHeight)*Math.max(0,Math.min(1,alignY));
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const sx=Math.max(0,Math.min(image.width-1,(x+.5+offsetX)/scale-.5)),sy=Math.max(0,Math.min(image.height-1,(y+.5+offsetY)/scale-.5));
    const x0=Math.floor(sx),y0=Math.floor(sy),x1=Math.min(image.width-1,x0+1),y1=Math.min(image.height-1,y0+1),tx=sx-x0,ty=sy-y0;
    const a=(y0*image.width+x0)*4,b=(y0*image.width+x1)*4,c=(y1*image.width+x0)*4,d=(y1*image.width+x1)*4,o=(y*W+x)*4;
    for(let k=0;k<4;k++)target.data[o+k]=Math.round((image.data[a+k]*(1-tx)+image.data[b+k]*tx)*(1-ty)+(image.data[c+k]*(1-tx)+image.data[d+k]*tx)*ty);
  }
}
function glyph(ctx,path) {
  ctx.beginPath();
  for(const c of path.commands){
    if(c.type==="M")ctx.moveTo(c.x,c.y);else if(c.type==="L")ctx.lineTo(c.x,c.y);
    else if(c.type==="C")ctx.bezierCurveTo(c.x1,c.y1,c.x2,c.y2,c.x,c.y);
    else if(c.type==="Q")ctx.quadraticCurveTo(c.x1,c.y1,c.x,c.y);else if(c.type==="Z")ctx.closePath();
  }
}
export function shadePixels(bitmap,start,opacity) {
  for(let y=Math.max(0,Math.floor(start));y<bitmap.height;y++){
    const alpha=Math.max(0,Math.min(opacity,(y-start)/Math.max(1,bitmap.height-start)*opacity));
    for(let x=0;x<bitmap.width;x++){const k=(y*bitmap.width+x)*4;for(let c=0;c<3;c++)bitmap.data[k+c]=Math.round(bitmap.data[k+c]*(1-alpha));}
  }
}
export function paintCaption(ctx,text,p,fontForWeight,width,height,id,bitmap) {
  const {layout,area}=captionSvg(text,p,fontForWeight,width,height,id);
  const strip=p.placement==="strip"?height*p.strip_height:0;
  const center=p.placement==="strip"?height-strip/2:p.placement==="band"?height-height*p.band_height/2:height*p.position;
  const top=captionTop(area,layout.total,center);
  if(strip){ctx.fillStyle=safeColor(p.strip_bg);ctx.fillRect(0,height-strip,width,strip);}
  const scrim=Math.max(0,Math.min(.95,Number(p.scrim_opacity ?? (p.shadow===false?0:.7))));
  if(p.placement==="band" || scrim){
    const start=Math.max(0,top-layout.size*1.2);shadePixels(bitmap,start,p.placement==="band"?.85:scrim);
  }
  for(const [i,line] of layout.lines.entries()){
    let x=-line.width/p.squeeze/2;const baseline=top+i*layout.lineHeight+layout.ascent;
    for(const token of line.tokens){
      const path=fontForWeight(token.weight).getPath(token.text,x,0,token.size);
      if(!path.commands.length){x+=token.w/p.squeeze;continue;}
      if(p.shadow || p.glow>0){ctx.save();ctx.translate(width/2,baseline+2);ctx.scale(p.squeeze,1);glyph(ctx,path);ctx.fillStyle="rgba(0,0,0,0.85)";ctx.fill();ctx.restore();}
      ctx.save();ctx.translate(width/2,baseline);ctx.scale(p.squeeze,1);glyph(ctx,path);ctx.fillStyle=safeColor(token.accent?p.accent:p.color);ctx.fill();ctx.restore();x+=token.w/p.squeeze;
    }
  }
}
export function paintTextCard(card,profile,fontForWeight) {
  const [w,h]=card.aspect.split(":").map(Number),W=1080,H=Math.round(W*h/w);
  if(!(H>=400 && H<=3000))throw new Error("Неверные пропорции текстовой карточки");
  const target=new Bitmap(W,H),ctx=target.getContext("2d");
  ctx.fillStyle=safeColor(card.background,"#FAF8F3");ctx.fillRect(0,0,W,H);
  const text=card.text_blocks.map(b=>b.text).join("\n\n");
  paintCaption(ctx,text,profile,fontForWeight,W,H,0,target);
  return encodePng({width:W,height:H,channels:4,depth:8,data:target.data},{zlib:{level:6}});
}
export function paintOwnCard(card,images,profile,fontForWeight) {
  if(card?.visual_mode!=="own" || !card.panels?.length || card.panels.length>2)throw new Error("Фоновая сборка доступна для своего стиля");
  const [w,h]=card.aspect.split(":").map(Number),W=1080,H=Math.round(W*h/w);
  if(!(H>=400 && H<=3000))throw new Error("Неверные пропорции карточки");
  const result=new Bitmap(W,H);
  for(const [i,panel] of card.panels.entries()){
    if(panel.trim_footer)throw new Error("Для кадра с ручной обрезкой полосы используйте обычную сборку в Авторе");
    const b=panel.bounds,x=Math.round(b.x*W),y=Math.round(b.y*H),width=Math.round(b.w*W),height=Math.round((b.y+b.h)*H)-y;
    if(!(width>0 && height>0 && x>=0 && y>=0 && x+width<=W && y+height<=H))throw new Error("Неверные границы кадра");
    const target=new Bitmap(width,height),p={...profile,...card.own_caption_overrides?.[i]};
    coverPixels(target,images[i],p.placement==="strip"?height*(1-p.strip_height):height,panel.image_align_y ?? .5);
    const text=card.text_blocks.filter(t=>(t.panel_index ?? 0)===i).map(t=>t.text).filter(Boolean).join("\n\n");
    if(text)paintCaption(target.getContext("2d"),text,p,fontForWeight,width,height,i,target);
    for(let row=0;row<height;row++)result.data.set(target.data.subarray(row*width*4,(row+1)*width*4),((y+row)*W+x)*4);
  }
  return encodePng({width:W,height:H,channels:4,depth:8,data:result.data},{zlib:{level:6}});
}
