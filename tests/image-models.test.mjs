import * as editorialStore from '../src/lib/editorial-store.server.js';
import * as editorialPolicy from '../src/lib/editorial-policy.js';
/* global URL, AbortSignal, crypto, TextEncoder */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import * as models from '../src/lib/image-models.js';
import * as revisions from '../src/lib/revisions.js';
import * as ready from '../src/lib/readiness.js';
import {ownStyleCard} from '../src/lib/own-style.js';
import {meteredClient} from '../src/lib/usage.server.js';
import {database} from './db-fixture.mjs';
const core=await fs.readFile(new URL('../src/lib/core.server.js',import.meta.url),'utf8');
const queue=await fs.readFile(new URL('../src/lib/render-queue.server.js',import.meta.url),'utf8');
const load=(s,names,deps={})=>vm.runInNewContext(s.replace(/import[\s\S]*?from\s+['"][^'"]+['"];?/g,'').replaceAll('export async function','async function').replaceAll('export function','function').replaceAll('export const','const')+'\n({'+names.join(',')+'})',{
  ...editorialStore,...editorialPolicy,...models,...revisions,...ready,ownStyleCard,meteredClient,crypto,TextEncoder,AbortSignal,...deps
});
const service=()=>({aiGateway:{connection:()=>({baseURL:'https://gateway.test/v1',token:'test-only',headers:{}})}});
const coreApi=fetch=>load(core,['imageFromPrompt'],{fetch});
const base=(model)=>database({Carousel:[{id:'c',title:'Test',mode:'mirror',slides_count:1,...(model?{image_model:model}:{})}],
  Settings:[{id:'settings',image_model:'nano_banana_2_1'}],
  Slide:[{id:'s',carousel_id:'c',position:1,scene:'one scene',text:'Caption',status:'planned',layout:1}]});
const queueApi=drawSlideFully=>load(queue,['enqueueRender','processRenderTask','setCarouselImageModel'],{drawSlideFully,invalidateApproval:async()=>{}});

test('GPT receives a supported aspect and explicit medium quality; Gemini gets no GPT-only fields',()=>{
  assert.deepEqual(models.imageRequestOptions('gpt_image_2','4:5'),{model:'gpt_image_2',aspect_ratio:'3:4',quality:'medium'});
  assert.deepEqual(models.imageRequestOptions('nano_banana_2_1','4:5'),{model:'nano_banana_2_1',aspect_ratio:'4:5'});
  assert.throws(()=>models.imageRequestOptions('other-provider','1:1'),/Неизвестная/);
});
test('pinned GPT bypasses legacy integration for hero sheets and logs returned model',async()=>{
  let sent,paid=0,logged;
  const {imageFromPrompt}=coreApi(async(_url,req)=>{sent=JSON.parse(req.body);return {ok:true,json:async()=>({model:'gpt_image_2',data:[{url:'image'}]})};});
  const b={...service(),imageModel:'gpt_image_2',reserveUsage:async()=>paid++,onImageGenerated:meta=>logged=meta};
  assert.equal(await imageFromPrompt(b,'hero',['style-ref']),'image');
  assert.equal(sent.model,'gpt_image_2');assert.equal(sent.quality,'medium');assert.equal(sent.aspect_ratio,'1:1');
  assert.deepEqual(sent.reference_image_urls,['style-ref']);assert.equal(paid,1);assert.equal(logged.model,'gpt_image_2');
});
test('automatic mode does not invent a resolved model when the platform omits it',async()=>{
  let logged;
  const {imageFromPrompt}=coreApi(async()=>({ok:true,json:async()=>({data:[{url:'image'}]})}));
  await imageFromPrompt({...service(),onImageGenerated:meta=>logged=meta},'scene',[],'3:2');
  assert.equal(logged.requested_model,'automatic');assert.equal(logged.model,'');
});
test('settings default applies to standalone images but a job snapshot wins over later settings',async()=>{
  const requests=[];
  const {imageFromPrompt}=coreApi(async(_url,req)=>{requests.push(JSON.parse(req.body));return {ok:true,json:async()=>({data:[{url:'image'}]})};});
  const b={...base(),...service()};
  await imageFromPrompt(b,'sheet',[]);
  const scoped=meteredClient({...b,asServiceRole:service()},'c',{imageModel:'gpt_image_2'});
  b.tables.Settings[0].image_model='automatic';
  await imageFromPrompt(scoped,'first',['style'],'3:2');
  await imageFromPrompt(scoped,'correction',['first','style'],'3:2');
  assert.deepEqual(requests.map(r=>r.model),['nano_banana_2_1','gpt_image_2','gpt_image_2']);
  assert.equal(scoped.imageGenerations.length,2);assert.equal(b.tables.Carousel[0].image_requests,2);
});
test('unknown model is rejected before a paid reservation or network call',async()=>{
  let paid=0,calls=0;
  const {imageFromPrompt}=coreApi(async()=>calls++);
  await assert.rejects(()=>imageFromPrompt({...service(),imageModel:'bogus',reserveUsage:async()=>paid++},'scene',[],'3:2'),/Неизвестная/);
  assert.equal(paid,0);assert.equal(calls,0);
});
test('credit, unavailable model and network failures stop without a paid fallback',async()=>{
  for(const status of [402,403,404,429,502,'timeout']) {
    let calls=0;
    const {imageFromPrompt}=coreApi(async()=>{calls++;if(status==='timeout')throw Error('network');return {ok:false,status};});
    await assert.rejects(()=>imageFromPrompt({...service(),imageModel:'gpt_image_2'},'scene',[],'3:2'),error=>error.stopRender===true);
    assert.equal(calls,1);
  }
});
test('enqueued job freezes its model and stores per-panel generation metadata',async()=>{
  const b=base('nano_banana_2_1');let used;
  const q=queueApi(async client=>{used=client.imageModel;client.onImageGenerated({model:used,url:'new'});return {image_url:'new',status:'drawn',critic_status:'ok',panel_checks:[{panel:1,status:'ok'}]};});
  const job=await q.enqueueRender(b,{id:'owner'},{carouselId:'c'});
  assert.equal(job.image_model,'nano_banana_2_1');assert.equal(b.tables.Carousel[0].image_model,'nano_banana_2_1');
  b.tables.Settings[0].image_model='gpt_image_2';
  await q.processRenderTask(b,job.id);
  assert.equal(used,'nano_banana_2_1');assert.equal(b.tables.Slide[0].image_generations[0].model,used);
});
test('gateway failure pauses a multi-panel job at the same cursor',async()=>{
  const b=base('gpt_image_2');b.tables.Slide[0].layout=2;
  let calls=0;const q=queueApi(async()=>{calls++;throw Object.assign(new Error('Credits exhausted'),{stopRender:true});});
  const job=await q.enqueueRender(b,{id:'owner'},{carouselId:'c'});
  await q.processRenderTask(b,job.id);await q.processRenderTask(b,job.id);
  assert.equal(calls,1);assert.equal(b.tables.TaskQueue[0].status,'paused');assert.equal(b.tables.TaskQueue[0].cursor,0);assert.equal(b.tables.Carousel[0].status,'paused');
});
test('model changes preserve existing approved media and are rejected during a job',async()=>{
  const b=base('automatic'),q=queueApi(async()=>{});
  Object.assign(b.tables.Carousel[0],{approved_key:'approved',status:'ready'});b.tables.Slide[0].image_url='saved';
  await q.setCarouselImageModel(b,{carouselId:'c',imageModel:'gpt_image_2'});
  assert.equal(b.tables.Slide[0].image_url,'saved');assert.equal(b.tables.Carousel[0].approved_key,'approved');assert.equal(b.tables.Carousel[0].status,'ready');
  await q.enqueueRender(b,{id:'owner'},{carouselId:'c'});
  await assert.rejects(()=>q.setCarouselImageModel(b,{carouselId:'c',imageModel:'automatic'}),/остановите/);
});
test('in-flight model change cannot save a result generated with the previous model',async()=>{
  const b=base('gpt_image_2');
  const q=queueApi(async()=>{b.tables.Carousel[0].image_model='automatic';return {image_url:'obsolete'};});
  const job=await q.enqueueRender(b,{id:'owner'},{carouselId:'c'});await q.processRenderTask(b,job.id);
  assert.equal(b.tables.Slide[0].image_url,undefined);assert.match(b.tables.TaskQueue[0].error,/изменилось/);
});
test('legacy carousels retain automatic generation regardless of the new global default',async()=>{
  const b=base(),q=queueApi(async()=>{});
  const job=await q.enqueueRender(b,{id:'owner'},{carouselId:'c'});
  assert.equal(job.image_model,'automatic');assert.equal(b.tables.Carousel[0].image_model,'automatic');
});
