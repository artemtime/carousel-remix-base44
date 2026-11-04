import * as editorialStore from '../src/lib/editorial-store.server.js';
import * as editorialPolicy from '../src/lib/editorial-policy.js';
import * as imageModels from '../src/lib/image-models.js';
/* global URL */
/* global AbortSignal */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const source=await fs.readFile(new URL('../src/lib/core.server.js',import.meta.url),'utf8');
function api(fetch) {
 const clean=source.replace(/import[\s\S]*?from\s+['"][^'"]+['"];?/g,'').replaceAll('export async function','async function').replaceAll('export function','function').replaceAll('export const','const');
 return vm.runInNewContext(clean+'\n({panelAspect,imageFromPrompt})',{...editorialStore,...editorialPolicy,...imageModels,fetch,AbortSignal});
}
test('wide stacked and tall side-by-side panels request their own supported aspect',()=>{
 const {panelAspect}=api();
 assert.equal(panelAspect({aspect:'1080:1350',panels:[{bounds:{w:1,h:.5}}]}),'3:2');
 assert.equal(panelAspect({aspect:'4:5',panels:[{bounds:{w:.5,h:1}}]}),'9:16');
 assert.equal(panelAspect({aspect:'4:5',panels:[{bounds:{w:1,h:1}}]}),'4:5');
 assert.throws(()=>panelAspect({aspect:'bad:5'}),/пропорции/);
});
test('gateway preserves refs, automatic model and URL storage while passing the panel ratio',async()=>{
 let sent,coreCalls=0;
 const a=api(async(url,request)=>{sent={url,body:JSON.parse(request.body)};return {ok:true,json:async()=>({data:[{url:'stored-image'}]})};});
 const service={aiGateway:{connection:()=>({baseURL:'https://gateway.test/v1',token:'test-only',headers:{}})},integrations:{Core:{GenerateImage:async()=>{coreCalls++;return {url:'legacy'};}}}};
 assert.equal(await a.imageFromPrompt({asServiceRole:service},'draw',['top-reference'],'3:2'),'stored-image');
 assert.equal(sent.body.aspect_ratio,'3:2');assert.equal(sent.body.model,'automatic');assert.equal(sent.body.response_format,'url');assert.deepEqual(sent.body.reference_image_urls,['top-reference']);assert.equal(coreCalls,0);
 assert.equal(await a.imageFromPrompt(service,'hero sheet',[]),'legacy');assert.equal(coreCalls,1);
});
test('failed gateway request is reported and never retries through a second paid provider',async()=>{
 let calls=0;
 const a=api(async()=>{calls++;return {ok:false,status:503};});
 const service={aiGateway:{connection:()=>({baseURL:'https://gateway.test/v1',token:'test-only'})}};
 await assert.rejects(()=>a.imageFromPrompt(service,'draw',[],'3:2'),/503/);assert.equal(calls,1);
});
