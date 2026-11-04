import test from 'node:test';
import assert from 'node:assert/strict';
import {fitReferenceText} from '../src/lib/reference-text-layout.js';
const context=()=>({font:'',measureText(text){return {width:text.length*parseFloat(this.font)*.5};}});
const options={maxSize:50,width:300,height:125,lineHeight:1.15,font:size=>`${size}px Test`};
test('long source caption wraps into readable lines rather than shrinking the entire sentence',()=>{
 const text='$45 haircut: 10 a day. Same money.',ctx=context();
 const result=fitReferenceText(ctx,{...options,text});
 assert.ok(result.lines.length>1);assert.ok(result.size>30);
 assert.equal(result.lines.join(' '),text);
 assert.ok(result.lines.every(line=>ctx.measureText(line).width<=options.width));
 assert.ok(result.size*(1+(result.lines.length-1)*options.lineHeight)<=options.height);
});
test('explicit source line breaks and paragraph breaks remain in reading order',()=>{
 const result=fitReferenceText(context(),{...options,text:'DAY ONE\n\nONE DAY',width:800,height:300});
 assert.deepEqual(result.lines,['DAY ONE','','ONE DAY']);assert.equal(result.size,50);
});
test('one long token shrinks to fit without dropping or clipping its characters',()=>{
 const ctx=context(),text='SUPERCALIFRAGILISTIC',r=fitReferenceText(ctx,{...options,text,width:80,height:30});
 assert.deepEqual(r.lines,[text]);assert.ok(ctx.measureText(text).width<=80);assert.ok(r.size<=30);
});

test('a small width overflow fits the original line without leaving one orphan word',()=>{
 const ctx=context(),r=fitReferenceText(ctx,{...options,text:'Single caption here',width:450});
 assert.deepEqual(r.lines,['Single caption here']);assert.ok(r.size>45);
 assert.ok(ctx.measureText(r.lines[0]).width<=450);
});
