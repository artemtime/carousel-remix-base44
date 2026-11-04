// Conservative detection of an added light paper/mat frame; unframed art stays intact.
function lightMat({data,width,height}) {
  const full={x:0,y:0,w:1,h:1};
  const pixel=(x,y)=>{const i=(y*width+x)*4;return [data[i],data[i+1],data[i+2]];};
  const corners=[pixel(0,0),pixel(width-1,0),pixel(0,height-1),pixel(width-1,height-1)];
  const color=[0,1,2].map(k=>corners.reduce((sum,p)=>sum+p[k],0)/4);
  const distance=(a,b)=>Math.max(...a.map((v,i)=>Math.abs(v-b[i])));
  if(Math.min(...color)<145 || Math.max(...color)-Math.min(...color)>85 || corners.some(p=>distance(p,color)>35))return full;
  const paper=(x,y)=>distance(pixel(x,y),color)<42;
  const row=y=>{let n=0;for(let x=0;x<width;x++)if(paper(x,y))n++;return n/width;};
  const col=x=>{let n=0;for(let y=0;y<height;y++)if(paper(x,y))n++;return n/height;};
  const edge=(limit,at)=>{let n=0;while(n<limit && at(n)>.78)n++;return n>=limit?null:n;};
  const left=edge(Math.ceil(width*.06),i=>col(i)),right=edge(Math.ceil(width*.06),i=>col(width-1-i));
  const top=edge(Math.ceil(height*.08),i=>row(i)),bottom=edge(Math.ceil(height*.18),i=>row(height-1-i));
  if([left,right,top,bottom].some(v=>v===null) || left<1 || right<1 || top<1 || bottom<1)return full;
  // Half a sample removes the thin dark keyline and resampling fringe of the mat.
  const x=(left+.5)/width,y=(top+.5)/height;
  return {x,y,w:1-x-(right+.5)/width,h:1-y-(bottom+.5)/height};
}
// A flat footer is removable only with a full-width dark keyline above it.
// Plain walls, floors, gradients and ordinary dark scene edges do not qualify.
function flatFooter({data,width,height},b) {
  const x0=Math.ceil(b.x*width),x1=Math.floor((b.x+b.w)*width),y0=Math.ceil(b.y*height),y1=Math.floor((b.y+b.h)*height);
  const pixel=(x,y)=>{const i=(y*width+x)*4;return [data[i],data[i+1],data[i+2]];};
  const sampleY=Math.max(y0,Math.floor(y1-(y1-y0)*.025)-1),samples=[];
  for(let x=x0;x<x1;x++)samples.push(pixel(x,sampleY));
  const color=[0,1,2].map(k=>samples.map(p=>p[k]).sort((a,b)=>a-b)[Math.floor(samples.length/2)]);
  if(!color[0] || Math.min(...color)<90 || Math.max(...color)>248 || Math.max(...color)-Math.min(...color)>65)return b;
  const similar=y=>{let n=0;for(let x=x0;x<x1;x++)if(pixel(x,y).every((v,k)=>Math.abs(v-color[k])<20))n++;return n/Math.max(1,x1-x0);};
  if(similar(sampleY)<.9)return b;
  let top=sampleY;while(top>y0 && similar(top-1)>.88)top--;
  const ratio=(y1-top)/(y1-y0);
  if(ratio<.055 || ratio>.24)return b;
  let line=-1;
  for(let y=Math.max(y0,top-4);y<top;y++){let n=0;for(let x=x0;x<x1;x++)if(Math.max(...pixel(x,y))<75)n++;if(n/(x1-x0)>.88)line=y;}
  if(line<0)return b;
  const above=Math.max(y0,line-Math.max(4,Math.round((y1-y0)*.035))),values=[];
  for(let x=x0;x<x1;x++)values.push(pixel(x,above).reduce((a,v)=>a+v,0)/3);
  if(Math.max(...values)-Math.min(...values)<20)return b;
  return {...b,h:Math.max(.5,(line-.5)/height-b.y)};
}
export function detectArtworkBounds(image,{trimFooter=false}={}) {const b=lightMat(image);return trimFooter?flatFooter(image,b):b;}
const cache=new WeakMap();
export function artworkBounds(image,trimFooter=false) {
  const variants=cache.get(image) || {};
  if(variants[trimFooter])return variants[trimFooter];
  const full={x:0,y:0,w:1,h:1};let result=full;
  try {
    const canvas=document.createElement("canvas"),w=image.naturalWidth || image.width,h=image.naturalHeight || image.height;
    canvas.width=Math.min(320,w);canvas.height=Math.round(canvas.width*h/w);
    const ctx=canvas.getContext("2d",{willReadFrequently:true});ctx.drawImage(image,0,0,canvas.width,canvas.height);
    result=detectArtworkBounds(ctx.getImageData(0,0,canvas.width,canvas.height),{trimFooter});
  }catch { /* Missing pixels/CORS must never cause a guessed crop. */ }
  variants[trimFooter]=result;cache.set(image,variants);return result;
}
