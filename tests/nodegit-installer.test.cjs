const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const source = path.join(__dirname, '..', 'packaging', 'nodegit', 'Install-Codi.ps1');

function verify(manifest) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codi-nodegit-test-'));
  try {
    fs.copyFileSync(source, path.join(dir, 'Install-Codi.ps1'));
    fs.writeFileSync(path.join(dir, 'release.json'), JSON.stringify(manifest));
    return spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(dir, 'Install-Codi.ps1'), '-VerifyOnly'], { encoding: 'utf8', timeout: 20000 });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('Node/Git installer verifies prerequisites without touching an existing checkout', () => {
  const result = verify({ version: '0.3.3', commit: '8a1bc1d153c3644157ee2fde1ba518a450bdcd12' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /ready/i);
});

test('Node/Git installer rejects malformed release metadata', () => {
  const result = verify({ version: 'latest', commit: 'main' });
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /release metadata/i);
});
