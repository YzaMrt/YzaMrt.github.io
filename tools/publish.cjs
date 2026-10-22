'use strict';
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

function gitExecutable() {
  const candidates = [
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Git', 'cmd', 'git.exe'),
    path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Git', 'cmd', 'git.exe')
  ];
  return candidates.find(file => fs.existsSync(file)) || 'git';
}

function createPublisher({ root = path.resolve(__dirname, '..') } = {}) {
  const git = gitExecutable();
  let publishing = false;
  function runGit(args) {
    return new Promise((resolve, reject) => {
      execFile(git, args, { cwd: root, windowsHide: true, timeout: 120000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }, (error, stdout, stderr) => {
        if (error) {
          reject(Object.assign(new Error(String(stderr || stdout || error.message).trim().slice(-1200)), { status: 500 }));
        } else resolve(String(stdout || ''));
      });
    });
  }
  return async function publish({ message = 'Update blog ' + new Date().toISOString() } = {}) {
    if (publishing) throw Object.assign(new Error('正在发布，请稍等一下。'), { status: 409 });
    publishing = true;
    try {
      const branch = (await runGit(['symbolic-ref', '--short', 'HEAD'])).trim();
      if (branch !== 'main') throw Object.assign(new Error('请先切换到 main 分支，再发布博客。'), { status: 409 });
      await runGit(['add', '--all']);
      const tree = (await runGit(['write-tree'])).trim();
      let headTree = '';
      try { headTree = (await runGit(['rev-parse', '--verify', 'HEAD^{tree}'])).trim(); } catch { /* First publication has no commit. */ }
      const committed = tree !== headTree;
      if (committed) await runGit(['commit', '-m', message]);

      // Retry the push even when a previous attempt already created the commit.
      // Regular pushes preserve history and reject conflicting remote changes.
      let output;
      try { output = await runGit(['push', '--porcelain', 'origin', 'main']); }
      catch (error) {
        error.message = '本地版本已保留，推送未完成。检查网络或远端提示后，再点“发布到线上”重试。\n' + error.message;
        error.status = 502;
        throw error;
      }
      const pushed = output.split(/\r?\n/).some(line => /^[ *]\t/.test(line));
      return { published: true, committed, pushed, rewritten: false, output: output.trim().slice(-300) };
    } finally { publishing = false; }
  };
}

module.exports = { createPublisher, gitExecutable };
if (require.main === module) {
  const { parseArgs } = require('node:util');
  const { values } = parseArgs({ options: { root: { type: 'string' }, message: { type: 'string' } } });
  createPublisher({ root: values.root })({ message: values.message }).then(result => {
    console.log(result.pushed ? 'Pushed to GitHub. The site will update after the build finishes.' : 'GitHub is already up to date.');
    console.log('Live site: https://yzamrt.github.io/');
  }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
