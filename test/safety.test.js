import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { loadConfig, saveProjectConfig, shouldIgnorePackage } from '../src/config-loader.js';
import { buildActionCommand, executeActions } from '../src/action-runner.js';
import { runWithWarningCapture, setProcessTracker } from '../src/warning-capture.js';
import { runUnusedCheck } from '../src/unused-checker.js';

const manifest = {
  dependencies: { app: '^1.2.0' },
  devDependencies: { tool: '~2.0.0' },
  optionalDependencies: { optional: '^3' },
};

test('installs preserve declared versions and sections for each manager', () => {
  assert.ok(
    buildActionCommand(
      { name: 'app', action: 'update', latestVersion: '1.3.0' },
      'pnpm',
      manifest,
      { workspaceRoot: true },
    ).args.includes('--workspace-root'),
  );
  for (const pm of ['npm', 'pnpm', 'yarn']) {
    const dev = buildActionCommand({ name: 'tool', action: 'install' }, pm, manifest);
    assert.equal(dev.args[1], 'tool@~2.0.0');
    assert.ok(dev.args.includes(pm === 'npm' ? '--save-dev' : '--dev'));
    assert.ok(
      buildActionCommand(
        { name: 'optional', action: 'update', latestVersion: '4.0.0' },
        pm,
        manifest,
      ).args.includes(pm === 'npm' ? '--save-optional' : '--optional'),
    );
    assert.equal(
      buildActionCommand({ name: 'app', action: 'install' }, pm, manifest).args[1],
      'app@^1.2.0',
    );
  }
});

test('invalid commands are rejected before any mutation; failures stop the plan', async () => {
  let calls = 0;
  const run = async () => {
    calls++;
    return { code: 1 };
  };
  await assert.rejects(
    executeActions(
      [
        { name: 'app', action: 'remove' },
        { name: 'bad;touch', action: 'remove' },
      ],
      'npm',
      manifest,
      { run },
    ),
  );
  assert.equal(calls, 0);
  const results = await executeActions(
    [
      { name: 'app', action: 'remove' },
      { name: 'tool', action: 'remove' },
    ],
    'npm',
    manifest,
    { run },
  );
  assert.equal(results.length, 1);
  assert.equal(calls, 1);
  assert.throws(() =>
    buildActionCommand(
      { name: 'app', action: 'update', latestVersion: '1.0.0;touch' },
      'npm',
      manifest,
    ),
  );
  assert.throws(() => buildActionCommand({ name: 'app', action: 'remove' }, 'invalid', manifest));
});

test('glob metacharacters are literal except for wildcard', () => {
  assert.equal(shouldIgnorePackage('a.b', { ignorePatterns: ['a.b'] }), true);
  assert.equal(shouldIgnorePackage('axb', { ignorePatterns: ['a.b'] }), false);
  assert.equal(shouldIgnorePackage('@types/node', { ignorePatterns: ['@types/*'] }), true);
  assert.doesNotThrow(() => shouldIgnorePackage('abc', { ignorePatterns: ['['] }));
});

test('project config precedence, prototype safety and invalid-file preservation', () => {
  const cwd = process.cwd();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'packmate-config-'));
  try {
    process.chdir(dir);
    fs.writeFileSync(
      'package.json',
      JSON.stringify({ packmate: { ui: { groupSessions: false }, cache: { enabled: false } } }),
    );
    fs.writeFileSync(
      'packmate.config.json',
      '{"ui":{"groupSessions":true},"__proto__":{"polluted":true}}',
    );
    const config = loadConfig();
    assert.equal(config.ui.groupSessions, true);
    assert.equal(config.cache.enabled, false);
    assert.equal(config.polluted, undefined);
    fs.writeFileSync('packmate.config.json', '{broken');
    assert.throws(() => saveProjectConfig({ packageManager: 'npm' }));
    assert.equal(fs.readFileSync('packmate.config.json', 'utf8'), '{broken');
  } finally {
    process.chdir(cwd);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('unused detection respects dev exclusion, wildcard ignores and dynamic imports', async () => {
  const cwd = process.cwd();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'packmate-unused-'));
  try {
    process.chdir(dir);
    fs.writeFileSync(
      'package.json',
      JSON.stringify({
        dependencies: { used: '1', unused: '1', 'keep-plugin': '1' },
        devDependencies: { dev: '1' },
        packmate: { analysisMode: { devDeps: false }, detection: { ignoreUnused: ['keep-*'] } },
      }),
    );
    fs.writeFileSync('index.js', "import('used/subpath');");
    assert.deepEqual(await runUnusedCheck(), ['unused']);
  } finally {
    process.chdir(cwd);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('capture waits for all output and ends tracking exactly once on spawn failure', async () => {
  let starts = 0;
  let ends = 0;
  setProcessTracker({ onStart: () => starts++, onEnd: () => ends++ });
  try {
    const result = await runWithWarningCapture(process.execPath, [
      '-e',
      "process.stdout.write('deprecated final warning')",
    ]);
    assert.equal(result.code, 0);
    assert.deepEqual(result.warnings, ['deprecated final warning']);
    const failed = await runWithWarningCapture('packmate-command-that-does-not-exist', [], {
      shell: false,
    });
    assert.equal(failed.code, 1);
    assert.equal(starts, 2);
    assert.equal(ends, 2);
  } finally {
    setProcessTracker({});
  }
});

test('memory cache honors TTL as well as disk cache', async () => {
  const { SmartCacheManager } = await import('../src/enhanced-cache.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'packmate-cache-test-'));
  const cache = new SmartCacheManager({ cacheDir: dir });
  try {
    await cache.set('app', { version: '1.0.0' });
    assert.equal((await cache.get('app')).source, 'memory');
    // Force both cache layers to expire without relying on clock delays.
    cache.memoryCache.cache.get('app').createdAt = 0;
    cache.diskCache.index.app.createdAt = 0;
    assert.equal((await cache.get('app', 1000)).data, null);
  } finally {
    await cache.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('audit errors cannot be interpreted as zero vulnerabilities', async () => {
  const { parseNpmAuditResult } = await import('../src/security-checker.js');
  assert.throws(() =>
    parseNpmAuditResult({ error: { code: 'ENOLOCK', summary: 'Missing lockfile' } }),
  );
  assert.throws(() => parseNpmAuditResult({}));
  assert.deepEqual(parseNpmAuditResult({ vulnerabilities: {} }), []);
});
