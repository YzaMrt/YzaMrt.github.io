'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const yaml = require('js-yaml');
const markedPromise = import('marked');

const dateText = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date());
const revision = text => crypto.createHash('sha256').update(text).digest('hex');
function fail(message, status = 400) { const err = new Error(message); err.status = status; throw err; }
function inside(root, candidate) { const rel = path.relative(root, candidate); return rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel); }
function slugOK(slug) { return /^[\p{L}\p{N}][\p{L}\p{N}_-]{0,90}$/u.test(slug) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(slug); }
function parsePost(text) {
  const match = text.replace(/^\uFEFF/, '').match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return { meta: {}, content: text };
  const data = yaml.load(match[1], { schema: yaml.CORE_SCHEMA });
  if (data !== null && (typeof data !== 'object' || Array.isArray(data))) fail('文章顶部的配置信息格式不正确。');
  return { meta: data || {}, content: text.replace(/^\uFEFF/, '').slice(match[0].length).replace(/^\r?\n/, '') };
}
function listValues(value) { return (Array.isArray(value) ? value.flat(2) : String(value || '').split(/[,，]/)).map(String).map(x => x.trim()).filter(Boolean).slice(0, 20); }
async function bodyJSON(req, max = 2 * 1024 * 1024) {
  if (!String(req.headers['content-type'] || '').startsWith('application/json')) fail('需要 JSON 请求。', 415);
  let size = 0; const chunks = [];
  for await (const chunk of req) { size += chunk.length; if (size > max) fail('上传内容过大。', 413); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { fail('请求内容不是有效的 JSON。'); }
}

function createWriterServer({ root = path.resolve(__dirname, '../..'), onShutdown, onSettingsChange } = {}) {
  root = path.resolve(root);
  const source = path.join(root, 'source');
  const folders = { posts: path.join(source, '_posts'), drafts: path.join(source, '_drafts') };
  const imageFolder = path.join(source, 'images');
  [...Object.values(folders), imageFolder].forEach(dir => fs.mkdirSync(dir, { recursive: true }));
  const token = crypto.randomBytes(32).toString('hex');
  const history = path.join(root, '.local', 'history');
  function locate(id) {
    if (typeof id !== 'string') fail('文章编号无效。');
    const match = id.match(/^(posts|drafts):(.+)$/);
    if (!match || !slugOK(match[2])) fail('文章编号无效。');
    const file = path.join(folders[match[1]], match[2] + '.md');
    if (!inside(root, file)) fail('文章路径无效。');
    if (fs.existsSync(file) && !inside(root, fs.realpathSync(file))) fail('不支持项目外部的链接文件。');
    return { file, status: match[1], slug: match[2] };
  }
  function readPost(id) {
    const loc = locate(id); if (!fs.existsSync(loc.file)) fail('文章不存在。', 404);
    const text = fs.readFileSync(loc.file, 'utf8'); const { meta, content } = parsePost(text);
    return { id, slug: loc.slug, status: loc.status, title: String(meta.title || loc.slug), description: String(meta.description || ''), categories: listValues(meta.categories), tags: listValues(meta.tags), date: meta.date || '', content, revision: revision(text), modified: fs.statSync(loc.file).mtimeMs };
  }
  function backup(file, slug) {
    fs.mkdirSync(history, { recursive: true });
    fs.copyFileSync(file, path.join(history, `${Date.now()}-${crypto.randomBytes(3).toString('hex')}-${slug}.md`));
  }
  function savePost(data) {
    const title = String(data.title || '').trim();
    if (!title || title.length > 160) fail('请填写标题，最多 160 个字符。');
    const content = String(data.content || ''); if (Buffer.byteLength(content) > 1024 * 1024) fail('文章超过 1 MB，请缩短正文或用图片附件。', 413);
    if (!['posts', 'drafts'].includes(data.status)) fail('文章状态无效。');
    let loc, oldText, oldMeta = {};
    if (data.id) {
      loc = locate(data.id); if (!fs.existsSync(loc.file)) fail('原文章已被移动，请刷新列表。', 409);
      oldText = fs.readFileSync(loc.file, 'utf8');
      if (data.revision !== revision(oldText)) fail('这篇文章已在其他窗口或编辑器中修改。请先复制当前正文，再重新打开文章。', 409);
      oldMeta = parsePost(oldText).meta;
    } else {
      let slug = title.toLowerCase().replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 65);
      if (!slugOK(slug)) slug = 'wp-' + Date.now();
      const base = slug; let n = 2;
      while (Object.values(folders).some(dir => fs.existsSync(path.join(dir, slug + '.md')))) slug = `${base}-${n++}`;
      loc = { slug };
    }
    const target = locate(`${data.status}:${loc.slug}`);
    if (loc.file !== target.file && fs.existsSync(target.file)) fail('目标目录已有同名文章，请先处理重名文件。', 409);
    const meta = { ...oldMeta, title, date: oldMeta.date || dateText(), updated: dateText(), categories: listValues(data.categories), tags: listValues(data.tags), description: String(data.description || '').slice(0, 500) };
    meta['typora-root-url'] = '..'; meta['typora-copy-images-to'] = '../images';
    const text = '---\n' + yaml.dump(meta, { lineWidth: -1, noRefs: true, quotingType: '"' }) + '---\n\n' + content.trimEnd() + '\n';
    if (loc.file) backup(loc.file, loc.slug);
    const temp = target.file + '.tmp';
    fs.writeFileSync(temp, text, 'utf8'); fs.renameSync(temp, target.file);
    if (loc.file && loc.file !== target.file) fs.unlinkSync(loc.file);
    return readPost(`${data.status}:${loc.slug}`);
  }
  function saveImage(data) {
    const types = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
    const ext = types[data.mime]; if (!ext) fail('支持 PNG、JPG、WebP 和 GIF 图片。');
    const b64 = String(data.base64 || ''); if (!/^[A-Za-z0-9+/]*={0,2}$/.test(b64)) fail('图片数据无效。');
    const bytes = Buffer.from(b64, 'base64'); if (!bytes.length || bytes.length > 15 * 1024 * 1024) fail('图片大小需在 15 MB 以内。', 413);
    const valid = ext === 'png' ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : ext === 'jpg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : ext === 'gif' ? /^GIF8[79]a$/.test(bytes.subarray(0,6).toString()) : bytes.subarray(0,4).toString() === 'RIFF' && bytes.subarray(8,12).toString() === 'WEBP';
    if (!valid) fail('文件内容与图片类型不一致。');
    // Keep uploads in an existing directory: Hexo's addDir and add events can race on Windows.
    const name = `${dateText().slice(0, 10)}-${Date.now()}-${crypto.randomBytes(5).toString('hex')}.${ext}`;
    fs.writeFileSync(path.join(imageFolder, name), bytes, { flag: 'wx' });
    return { url: `/images/${name}`, name: String(data.name || '解题截图').replace(/[\[\]\r\n]/g, '').slice(0,100) };
  }
  const server = http.createServer(async (req, res) => {
    const json = (data, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Cache-Control', 'no-store'); res.setHeader('Referrer-Policy', 'no-referrer');
    const port = server.address()?.port; const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
    try {
      if (!hosts.includes(req.headers.host)) fail('仅支持本机访问。', 403);
      if (req.headers.origin && !hosts.some(h => req.headers.origin === 'http://' + h)) fail('不允许其他网站访问写作台。', 403);
      const url = new URL(req.url, 'http://' + req.headers.host);
      if (req.method === 'GET' && url.pathname === '/api/health') return json({ app: 'yangz-wp-writer', ready: true });
      if (req.method === 'GET' && url.pathname === '/api/session') return json({ token });
      if (req.method === 'POST') {
        if (req.headers['x-writer-token'] !== token) fail('写作台连接已更新，请刷新页面。', 403);
        const data = await bodyJSON(req, url.pathname === '/api/images' ? 22 * 1024 * 1024 : undefined);
        if (url.pathname === '/api/save') return json(savePost(data));
        if (url.pathname === '/api/images') return json(saveImage(data));
        if (url.pathname === '/api/render') { const { marked } = await markedPromise; return json({ html: await marked.parse(String(data.content || '').slice(0,1024*1024)) }); }
        if (url.pathname === '/api/settings') {
          const configFile = path.join(root, '_config.yml'); const configText = fs.readFileSync(configFile, 'utf8');
          if (data.revision !== revision(configText)) fail('站点设置已在别处修改，请重新打开设置。', 409);
          const values = { title: String(data.title || '').trim().slice(0,100), author: String(data.author || '').trim().slice(0,100), description: String(data.description || '').trim().slice(0,500) };
          if (!values.title || !values.author) fail('请填写博客名称和作者。');
          let next = configText;
          for (const [key, value] of Object.entries(values)) next = next.replace(new RegExp('^' + key + ':.*$', 'm'), () => key + ': ' + JSON.stringify(value));
          backup(configFile, 'site-config'); fs.writeFileSync(configFile + '.tmp', next); fs.renameSync(configFile + '.tmp', configFile); onSettingsChange?.(); return json({ saved: true });
        }
        if (url.pathname === '/api/stop' && onShutdown) { json({ stopped: true }); setTimeout(onShutdown, 100); return; }
        fail('接口不存在。', 404);
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') fail('不支持这个请求方法。', 405);
      if (url.pathname === '/api/posts') {
        const posts = Object.entries(folders).flatMap(([status, dir]) => fs.readdirSync(dir).filter(name => name.endsWith('.md') && slugOK(name.slice(0,-3))).map(name => { try { const post = readPost(`${status}:${name.slice(0,-3)}`); delete post.content; return post; } catch { return null; } })).filter(Boolean).sort((a,b) => b.modified-a.modified);
        return json({ posts });
      }
      if (url.pathname === '/api/post') return json(readPost(url.searchParams.get('id')));
      if (url.pathname === '/api/settings') { const raw = fs.readFileSync(path.join(root, '_config.yml'), 'utf8'); const cfg = yaml.load(raw); return json({ title: cfg.title, author: cfg.author, description: cfg.description, revision: revision(raw) }); }
      let file;
      if (url.pathname === '/') file = path.join(__dirname, 'index.html');
      else if (['/app.js', '/style.css'].includes(url.pathname)) file = path.join(__dirname, url.pathname.slice(1));
      else if (/^\/(images|assets)\//.test(url.pathname)) { file = path.resolve(source, '.' + decodeURIComponent(url.pathname)); if (!inside(source, file) || !/\.(png|jpe?g|webp|gif|svg|woff2?|css)$/i.test(file)) fail('文件路径无效。', 403); }
      else fail('页面不存在。', 404);
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) fail('文件不存在。', 404);
      if (!inside(source, file) && !inside(__dirname, file)) fail('文件路径无效。', 403);
      if (inside(source, file) && !inside(source, fs.realpathSync(file))) fail('不支持项目外部的链接文件。', 403);
      const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.gif':'image/gif', '.svg':'image/svg+xml', '.woff2':'font/woff2', '.woff':'font/woff' }[path.extname(file).toLowerCase()] || 'application/octet-stream';
      if (url.pathname === '/') res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: http://127.0.0.1:4000; frame-src 'self' about:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
      res.writeHead(200, { 'Content-Type': mime, 'Content-Length': fs.statSync(file).size }); if (req.method === 'HEAD') res.end(); else fs.createReadStream(file).pipe(res);
    } catch (err) { if (!res.headersSent) json({ error: err.status ? err.message : '操作失败，请检查本地服务日志。' }, err.status || 500); else res.end(); if (!err.status) console.error(err); }
  });
  server.requestTimeout = 30000;
  return server;
}
module.exports = { createWriterServer };
if (require.main === module) createWriterServer().listen(4001, '127.0.0.1', () => console.log('Writer: http://127.0.0.1:4001/'));
