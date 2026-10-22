'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createPublisher, gitExecutable } = require('../tools/publish.cjs');
const { createWriterServer } = require('../tools/writer/server.cjs');

const git = gitExecutable();
const run = (cwd, args) => execFileSync(git, args, { cwd, windowsHide: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
function identity(cwd) {
  run(cwd, ['config', 'user.name', 'Publisher Test']);
  run(cwd, ['config', 'user.email', 'publisher@example.invalid']);
  run(cwd, ['config', 'commit.gpgsign', 'false']);
}
function fixture() {
  const parent = path.join(__dirname, '../.local/test-runs');
  fs.mkdirSync(parent, { recursive: true });
  const base = fs.mkdtempSync(path.join(parent, 'publisher-'));
  const root = path.join(base, 'work');
  const remote = path.join(base, 'remote.git');
  fs.mkdirSync(root);
  run(base, ['init', '--bare', '--initial-branch=main', remote]);
  run(root, ['init', '--initial-branch=main']);
  identity(root);
  run(root, ['remote', 'add', 'origin', remote]);
  fs.writeFileSync(path.join(root, '.gitignore'), '.local/\n');
  fs.writeFileSync(path.join(root, 'note.md'), 'Initial article\n');
  return { base, root, remote };
}

test('publication preserves history, retries failed pushes and rejects remote conflicts', async t => {
  const { base, root, remote } = fixture();
  const publish = createPublisher({ root });
  let initial;
  await t.test('publish first version and confirm an unchanged site is synced', async () => {
    const result = await publish();
    assert.equal(result.committed, true);
    assert.equal(result.pushed, true);
    initial = run(root, ['rev-parse', 'HEAD']);
    assert.equal(run(remote, ['rev-parse', 'main']), initial);
    const unchanged = await publish();
    assert.equal(unchanged.committed, false);
    assert.equal(unchanged.pushed, false);
    assert.equal(run(root, ['rev-parse', 'HEAD']), initial);
  });
  await t.test('new publication retains the previous commit as its parent', async () => {
    fs.appendFileSync(path.join(root, 'note.md'), 'Updated article\n');
    await publish();
    assert.equal(run(root, ['rev-parse', 'HEAD^']), initial);
    assert.equal(run(remote, ['rev-list', '--count', 'main']), '2');
  });
  await t.test('retry pushes a pending commit without creating another commit', async () => {
    run(root, ['remote', 'set-url', 'origin', path.join(base, 'unavailable.git')]);
    fs.appendFileSync(path.join(root, 'note.md'), 'Written while offline\n');
    await assert.rejects(publish(), error => error.status === 502 && error.message.includes('重试'));
    const pending = run(root, ['rev-parse', 'HEAD']);
    assert.notEqual(run(remote, ['rev-parse', 'main']), pending);
    run(root, ['remote', 'set-url', 'origin', remote]);
    const retried = await publish();
    assert.equal(retried.committed, false);
    assert.equal(retried.pushed, true);
    assert.equal(run(root, ['rev-parse', 'HEAD']), pending);
    assert.equal(run(remote, ['rev-parse', 'main']), pending);
  });
  await t.test('refuse publication from another branch', async () => {
    run(root, ['checkout', '-b', 'work-in-progress']);
    await assert.rejects(publish(), error => error.status === 409);
    run(root, ['checkout', 'main']);
  });
  await t.test('CLI shares the same up-to-date publication behavior', () => {
    const output = execFileSync(process.execPath, [path.join(__dirname, '../tools/publish.cjs'), '--root', root], { encoding: 'utf8', windowsHide: true });
    assert.match(output, /already up to date/);
  });
  await t.test('reject a diverged remote instead of overwriting another change', async () => {
    const peer = path.join(base, 'peer');
    run(base, ['clone', remote, peer]); identity(peer);
    fs.writeFileSync(path.join(peer, 'remote-note.md'), 'Change from another computer\n');
    run(peer, ['add', '--all']); run(peer, ['commit', '-m', 'Remote edit']); run(peer, ['push', 'origin', 'main']);
    const remoteHead = run(remote, ['rev-parse', 'main']);
    fs.appendFileSync(path.join(root, 'note.md'), 'Conflicting local change\n');
    await assert.rejects(publish(), error => error.status === 502);
    assert.equal(run(remote, ['rev-parse', 'main']), remoteHead);
    assert.ok(fs.readFileSync(path.join(root, 'note.md'), 'utf8').includes('Conflicting local change'));
  });
});

test('delete an article while offline, then retry publication through the writer API', async t => {
  const { base, root, remote } = fixture();
  fs.mkdirSync(path.join(root, 'source/_posts'), { recursive: true });
  fs.writeFileSync(path.join(root, 'source/_posts/example.md'), '---\ntitle: Example\ndate: 2026-10-21\n---\n\nArticle\n');
  await createPublisher({ root })();
  const server = createWriterServer({ root });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  const { token } = await (await fetch(url + '/api/session')).json();
  const post = (route, data) => fetch(url + '/api/' + route, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Writer-Token': token }, body: JSON.stringify(data) });
  run(root, ['remote', 'set-url', 'origin', path.join(base, 'offline.git')]);
  const response = await post('delete', { id: 'posts:example' });
  assert.equal(response.status, 200);
  const deleted = await response.json();
  assert.equal(deleted.deleted, true);
  assert.equal(deleted.published, false);
  assert.match(deleted.publishError, /重试/);
  assert.ok(!fs.existsSync(path.join(root, 'source/_posts/example.md')));
  assert.ok(fs.readdirSync(path.join(root, '.local/trash')).some(file => file.endsWith('-example.md')));
  run(root, ['remote', 'set-url', 'origin', remote]);
  const retriedResponse = await post('publish', {});
  assert.equal(retriedResponse.status, 200);
  const retried = await retriedResponse.json();
  assert.equal(retried.pushed, true);
  assert.equal(retried.committed, false);
  assert.ok(!run(remote, ['ls-tree', '-r', '--name-only', 'main']).includes('source/_posts/example.md'));
  assert.ok(run(remote, ['ls-tree', '-r', '--name-only', 'main^']).includes('source/_posts/example.md'));
});
