'use strict';
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { createWriterServer } = require('./writer/server.cjs');
const { prepareAssets } = require('./prepare-assets.cjs');
const root = path.resolve(__dirname, '..');
process.chdir(root);
let child, server, stopping = false, restarting = false, restartTimer = null;
function portFree(port) { return new Promise((resolve, reject) => { const probe = net.createServer(); probe.once('error', reject); probe.listen(port, '127.0.0.1', () => probe.close(resolve)); }); }
function startBlog() {
  child = spawn(process.execPath, [path.join(root, 'node_modules/hexo/bin/hexo'), 'server', '--ip', '127.0.0.1', '--port', '4000'], { cwd:root, stdio:'inherit', windowsHide:true });
  child.on('error', err => console.error('博客启动失败：', err.message));
  child.on('exit', code => { if (!stopping && !restarting && code) console.error('博客预览退出。请查看日志或重新启动写作台。'); });
}
function restartBlog() {
  if (stopping) return;
  clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    const old = child;
    if (old && old.exitCode === null) {
      restarting = true;
      let settled = false;
      const finish = () => { if (settled) return; settled = true; restarting = false; if (!stopping) startBlog(); };
      old.once('exit', finish);
      old.kill();
      const force = setTimeout(() => { if (!settled) { old.kill('SIGKILL'); setTimeout(finish, 1500).unref(); } }, 4000);
      force.unref();
    } else {
      restarting = false;
      startBlog();
    }
  }, 250);
}
function stop() { if (stopping) return; stopping=true; child?.kill(); server?.close(() => process.exit(0)); setTimeout(() => process.exit(0), 2500).unref(); }
process.on('SIGINT', stop); process.on('SIGTERM', stop);
(async () => {
  try {
    await portFree(4000); await portFree(4001); prepareAssets();
    server = createWriterServer({ root, onShutdown:stop, onSettingsChange:restartBlog });
    startBlog();
    server.on('error', err => { console.error(err); stop(); });
    server.listen(4001, '127.0.0.1', () => console.log('写作台：http://127.0.0.1:4001/\n博客预览：http://127.0.0.1:4000/'));
  } catch (err) { console.error('无法启动：', err.code === 'EADDRINUSE' ? '4000 或 4001 端口已被占用。请先停止之前的 Hexo 预览，再双击启动。' : err.message); process.exitCode=1; }
})();
