'use strict';
const fs = require('node:fs');
const path = require('node:path');
function prepareAssets() {
  const root = path.resolve(__dirname, '..');
  const from = path.join(root, 'node_modules/@fortawesome/fontawesome-free');
  const target = path.join(root, 'source/assets/fontawesome');
  if (!fs.existsSync(from)) throw new Error('缺少依赖，请在项目目录运行 npm.cmd install。');
  for (const folder of ['css', 'webfonts']) {
    fs.mkdirSync(path.join(target, folder), { recursive: true });
    const files = folder === 'css' ? ['all.min.css'] : fs.readdirSync(path.join(from, folder));
    for (const file of files) {
      const src = path.join(from, folder, file), dst = path.join(target, folder, file);
      if (!fs.existsSync(dst) || fs.statSync(dst).size !== fs.statSync(src).size) fs.copyFileSync(src, dst);
    }
  }
  fs.copyFileSync(path.join(from, 'LICENSE.txt'), path.join(target, 'LICENSE.txt'));
}
module.exports = { prepareAssets };
if (require.main === module) { prepareAssets(); console.log('本地字体图标已准备。'); }
