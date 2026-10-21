'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { createWriterServer } = require('../tools/writer/server.cjs');

test('local writing: persistence, conflicts, drafts, images and origin isolation', async t => {
  const root = path.join(__dirname, '../.local/test-runs', String(Date.now()));
  fs.mkdirSync(root, { recursive: true }); fs.writeFileSync(path.join(root, '_config.yml'), 'title: Test\nauthor: Test\ndescription: Notes\n');
  const server = createWriterServer({ root }); await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise(r => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const session = await (await fetch(base+'/api/session')).json();
  const post = (url, body, extra={}) => fetch(base+'/api/'+url, { method:'POST', headers:{'Content-Type':'application/json','X-Writer-Token':session.token,...extra},body:JSON.stringify(body) });
  let saved;
  await t.test('create and persist a draft with Unicode title and Markdown', async () => {
    const res=await post('save',{title:'测试 WP',content:'## 线索\n\n```python\nprint(123)\n```',status:'drafts',categories:'CTF, Misc',tags:'Python',description:'draft'});
    assert.equal(res.status,200);saved=await res.json();assert.equal(saved.status,'drafts');assert.ok(fs.readFileSync(path.join(root,'source/_drafts',saved.slug+'.md'),'utf8').includes('print(123)'));
  });
  await t.test('reject stale edits without overwriting existing content', async () => {
    const res=await post('save',{...saved,revision:'old-version',content:'overwrite'});assert.equal(res.status,409);assert.ok(fs.readFileSync(path.join(root,'source/_drafts',saved.slug+'.md'),'utf8').includes('print(123)'));
  });
  await t.test('move draft to posts while preserving original backup',async()=>{
    const res=await post('save',{...saved,status:'posts',content:saved.content+'\n\n完成'});assert.equal(res.status,200);const previous=saved;saved=await res.json();assert.ok(fs.existsSync(path.join(root,'source/_posts',saved.slug+'.md')));assert.ok(!fs.existsSync(path.join(root,'source/_drafts',previous.slug+'.md')));assert.equal(fs.readdirSync(path.join(root,'.local/history')).length,1);
  });
  await t.test('validate image format and serve persisted image',async()=>{
    const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jk1kAAAAASUVORK5CYII=';
    const result=await post('images',{mime:'image/png',base64:png,name:'测试截图.png'});assert.equal(result.status,200);const image=await result.json();const response=await fetch(base+image.url);assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/png');assert.deepEqual(Buffer.from(await response.arrayBuffer()),Buffer.from(png,'base64'));
    assert.equal((await post('images',{mime:'image/png',base64:Buffer.from('not an image').toString('base64')})).status,400);
  });
  await t.test('reject cross-origin writes, forged hosts and traversal IDs',async()=>{
    assert.equal((await post('save',{...saved},{Origin:'https://example.com'})).status,403);
    const forgedStatus=await new Promise((resolve,reject)=>http.get(base+'/api/session',{headers:{Host:'attacker.example'}},res=>{res.resume();resolve(res.statusCode);}).on('error',reject));
    assert.equal(forgedStatus,403);
    assert.equal((await fetch(base+'/api/post?id='+encodeURIComponent('posts:../../package'))).status,400);
    assert.equal((await fetch(base+'/api/save',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,403);
  });
  await t.test('render Markdown and preserve settings revisions',async()=>{
    const rendered=await (await post('render',{content:'## 测试\n\n**重点**'})).json();assert.ok(rendered.html.includes('<strong>重点</strong>'));
    const settings=await(await fetch(base+'/api/settings')).json();assert.equal((await post('settings',{...settings,title:'Updated'})).status,200);assert.equal((await post('settings',{...settings,title:'Stale'})).status,409);
  });
});
