import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
assert.equal(manifest.version, lock.version, 'package-lock version must match package.json');
assert.equal(manifest.version, lock.packages[''].version, 'lockfile root version must match');
assert.deepEqual(
  manifest.dependencies,
  lock.packages[''].dependencies,
  'Runtime dependencies must match the lockfile',
);
assert.deepEqual(
  manifest.devDependencies,
  lock.packages[''].devDependencies,
  'Development dependencies must match the lockfile',
);
assert.ok(process.env.npm_execpath, 'Run via npm run check:package');
const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'packmate-package-check-'));
try {
  const result = spawnSync(
    process.execPath,
    [
      process.env.npm_execpath,
      'pack',
      '--dry-run',
      '--ignore-scripts',
      '--json',
      '--offline',
      '--cache',
      cache,
    ],
    {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, npm_config_update_notifier: 'false' },
    },
  );
  assert.equal(result.status, 0, result.stderr);
  const [pack] = JSON.parse(result.stdout);
  const files = new Set(pack.files.map((file) => file.path));
  for (const required of [
    'LICENSE',
    'README.md',
    'README.ko.md',
    'CHANGELOG.md',
    'package.json',
    'packmate.config.example.json',
    manifest.main,
    ...Object.values(manifest.bin),
  ]) {
    assert.ok(files.has(required), `Required package file missing: ${required}`);
  }
  for (const file of files) {
    assert.ok(
      /^(?:src\/[^/]+\.js|bin\/packmate\.js|LICENSE|README(?:\.ko)?\.md|CHANGELOG\.md|package\.json|packmate\.config\.example\.json)$/.test(
        file,
      ),
      `Unexpected package file: ${file}`,
    );
    if (!file.endsWith('.js')) continue;
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    for (const match of source.matchAll(/(?:from\s*|import\s*\()\s*['"](\.[^'"]+)['"]/g)) {
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), match[1]));
      assert.ok(files.has(target), `Unpacked import target missing: ${file} -> ${target}`);
    }
  }
  assert.ok(
    fs
      .readFileSync(path.join(root, manifest.bin.packmate), 'utf8')
      .startsWith('#!/usr/bin/env node'),
  );
  console.log(`Package validated: ${pack.id}, ${files.size} files, ${pack.size} bytes`);
} finally {
  fs.rmSync(cache, { recursive: true, force: true });
}
