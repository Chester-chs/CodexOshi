const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('CodexOshi is the public name while the installed plugin identity stays stable', () => {
  const manifest = JSON.parse(read('.codex-plugin/plugin.json'));
  assert.equal(manifest.name, 'codex-quota-widget');
  assert.equal(manifest.interface.displayName, 'CodexOshi');
  assert.match(read('README.md'), /^# CodexOshi\r?\n/);
  assert.match(read('README.zh-CN.md'), /^# CodexOshi\r?\n/);
  assert.match(read('desktop/ui/index.html'), /CodexOshi 设置/);
});

test('update checks and downloads point to the renamed repository', () => {
  const news = require('../runtime/public-news.cjs');
  assert.equal(news.REPO, 'https://github.com/Chester-chs/CodexOshi');
  assert.equal(news.VERSION_API, 'https://api.github.com/repos/Chester-chs/CodexOshi/releases/latest');
  assert.match(read('runtime/update-download.cjs'), /Chester-chs\/CodexOshi/);
});
