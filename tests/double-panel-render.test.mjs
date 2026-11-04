/* global URL */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const read = p => fs.readFile(new URL('../'+p, import.meta.url), 'utf8');
const strip = s => s.replace(/import[\s\S]*?from\s+['"][^'"]+['"];?/g,'').replace('export default async function','async function');
async function render(alignments) {
  const source=await read('src/lib/slide-renderer.js');
  const crop=source.slice(source.indexOf('function coverImage'),source.indexOf('// Насколько'));
  const calls=[], clips=[];
  const ctx={fillRect(){},save(){},restore(){},beginPath(){},clip(){},rect(...args){clips.push(args);},drawImage(...args){calls.push(args.slice(1));}};
  const {renderReferenceCard}=vm.runInNewContext(strip(await read('src/lib/reference-canvas.js'))+'\n({renderReferenceCard})', {
    repairCard:c=>c, measuredScrims:()=>[], sourceLettering:()=>null,
  });
  const coverImage=vm.runInNewContext(crop+'\ncoverImage');
  const image={width:1024,height:1024};
  const card={aspect:'4:5',background:'#000000',text_blocks:[],panels:alignments.map((image_align_y,i)=>({bounds:{x:0,y:i*.5,w:1,h:.5},...(image_align_y===undefined?{}:{image_align_y})}))};
  const canvas={getContext:()=>ctx};
  await renderReferenceCard(canvas,{referenceCard:card,imageUrl:'top',imageUrl2:'bottom'},{loadImage:async()=>image,coverImage});
  return {calls,clips,canvas};
}
test('each half can preserve its own edge without moving the other panel or changing output size',async()=>{
  const {calls,clips,canvas}=await render([0,1]);
  assert.equal(canvas.width,1080);assert.equal(canvas.height,1350);
  assert.deepEqual(clips,[[0,0,1080,675],[0,675,1080,675]]);
  const headY=100*1080/1024,footY=950*1080/1024;
  assert.ok(calls[0][1]+headY>=0,'top-aligned head stays inside the upper half');
  assert.ok(calls[1][1]+footY<=1350,'bottom-aligned feet stay inside the lower half');
  assert.equal(calls[0][1],0);assert.equal(calls[1][1],270);
});
test('existing cards keep centered framing unless the user selects another position',async()=>{
  const centered=await render([undefined,undefined]);
  const shifted=await render([0,undefined]);
  assert.equal(centered.calls[0][1],-202.5);
  assert.deepEqual(shifted.calls[1],centered.calls[1]);
});
