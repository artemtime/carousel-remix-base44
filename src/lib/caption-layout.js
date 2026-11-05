// Measure and fit actual painted glyphs before rendering. No clipping or ellipsis.
export function fontString(weight, size, family) {
  return `${weight} ${Math.max(1, Math.round(size))}px "${family}", "Montserrat", sans-serif`;
}
export function parseRuns(text) {
  const runs=[];let buf="",bold=false,accent=false,small=false;
  const s=String(text ?? "");
  for(let i=0;i<s.length;) {
    const mark=s.slice(i,i+2);
    if(["**","==","^^"].includes(mark)) {
      if(buf)runs.push({text:buf,bold,accent,small});buf="";
      if(mark==="**")bold=!bold;else if(mark==="==")accent=!accent;else small=!small;
      i+=2;
    }else {buf+=s[i];i++;}
  }
  if(buf)runs.push({text:buf,bold,accent,small});return runs;
}
function tokens(text) {
  return parseRuns(text).flatMap(run=>run.text.split(/(\s+)/).filter(Boolean).map(text=>({...run,text})));
}
export function layoutCaption(ctx,text,p,family,size,width) {
  const clean=String(text ?? "").replace(/[\u{1F000}-\u{1FAFF}\u2600-\u27BF]/gu,"").replace(/\uFE0F|\u200D/gu,"");
  const body=p.keep_breaks?clean:clean.split(/\n\s*\n/).map(s=>s.replace(/\s*\n\s*/g," ").trim()).join("\n");
  const lines=[];let widest=0;
  const finish=line=>{
    while(line.length && /^\s+$/.test(line.at(-1).text))line.pop();
    const lineWidth=line.reduce((sum,t)=>sum+t.w,0);
    const ascent=Math.max(size*.72,...line.map(t=>t.ascent)),descent=Math.max(size*.22,...line.map(t=>t.descent));
    lines.push({tokens:line,width:lineWidth,ascent,descent});widest=Math.max(widest,lineWidth);
  };
  for(const paragraph of body.split("\n")) {
    let line=[],used=0;
    for(const token of tokens(p.uppercase?paragraph.toUpperCase():paragraph)) {
      const tokenSize=Math.max(1,Math.round(token.small?size*p.small_scale:size)),weight=token.bold?p.bold_weight:p.weight;
      ctx.font=fontString(weight,tokenSize,family);const m=ctx.measureText(token.text);
      const measured={...token,size:tokenSize,weight,w:m.width*p.squeeze,ascent:m.actualBoundingBoxAscent || tokenSize*.8,descent:m.actualBoundingBoxDescent || tokenSize*.22};
      const space=/^\s+$/.test(token.text);
      if(!space && line.length && used+measured.w>width){finish(line);line=[];used=0;}
      if(!line.length && space)continue;
      line.push(measured);used+=measured.w;
    }
    finish(line);
  }
  const ascent=Math.max(size*.72,...lines.map(l=>l.ascent)),descent=Math.max(size*.22,...lines.map(l=>l.descent));
  const lineHeight=Math.max(size,ascent+descent)*Math.max(1,p.line_spacing || 1.15);
  return {lines,widest,ascent,descent,lineHeight,total:ascent+descent+Math.max(0,lines.length-1)*lineHeight};
}
export function fitCaption(ctx,text,p,family,{width,height,startSize,maxLines=3,minSize=24}) {
  if(!(width>0 && height>0))throw new Error("Для подписи не осталось места");
  for(let size=Math.max(minSize,Math.round(startSize));size>=minSize;size--) {
    const result=layoutCaption(ctx,text,p,family,size,width-4);
    if(result.widest<=width-4+.01 && result.total<=height-4+.01 && result.lines.length<=maxLines)return {...result,size};
  }
  throw new Error("Подпись слишком длинная для читаемого шрифта. Сократите текст или добавьте карточку.");
}
export function captionArea(W,H,placement="overlay",profile={}) {
  const marginX=W*.045,marginY=Math.max(12,H*.045);
  const fraction=profile.text_only ? .82 : placement==="strip"?Number(profile.strip_height || .16):placement==="band"?Number(profile.band_height || .24):.3;
  const zone=Math.min(H-2*marginY,H*fraction);
  const inset=placement==="overlay"?0:Math.min(marginY,zone*.12);
  const desired=H*(profile.position ?? .8);
  const center=placement==="overlay"?Math.max(marginY+zone/2,Math.min(desired,H-marginY-zone/2)):H-zone/2;
  const top=center-zone/2+inset,bottom=center+zone/2-inset;
  return {x:Math.max(marginX,(W-W*(profile.max_width || .84))/2),top,bottom,width:Math.min(W-2*marginX,W*(profile.max_width || .84)),height:Math.max(1,bottom-top)};
}
export function captionTop(area,total,desiredCenter) {
  return Math.max(area.top,Math.min(desiredCenter-total/2,area.bottom-total));
}
