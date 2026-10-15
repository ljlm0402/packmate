import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { runUnusedCheck } from '../src/unused-checker.js';
import { analyzeUsage } from '../src/usage-analysis.js';
import { discoverProjects } from '../src/workspaces.js';
import { loadConfig } from '../src/config-loader.js';

function fixture(manifest) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'packmate-scanner-'));
  const write = (file, data) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), typeof data === 'string' ? data : JSON.stringify(data));
  };
  write('package.json', manifest);
  return {
    root,
    write,
    config: () => loadConfig({ root }),
    close: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

test('replacement scanner recognizes ESM, CommonJS, TS types, JSX and conditional/dynamic imports', async () => {
  const names = [
    'esm',
    'reexport',
    'cjs',
    'resolved',
    'dynamic',
    'conditional',
    '@scope/types',
    'equals',
    'typed',
    'jsx',
    'mocked',
    'amd',
  ];
  const manifest = {
    dependencies: Object.fromEntries(
      [...names, 'unused', 'comment-only'].map((name) => [name, '^1']),
    ),
  };
  const f = fixture(manifest);
  try {
    f.write(
      'index.mjs',
      "import 'esm/subpath'; export * from 'reexport'; import(`dynamic`); // import('comment-only')",
    );
    f.write(
      'legacy.cjs',
      "require('cjs'); require.resolve('resolved'); if (ok) { require('conditional'); } define(['amd'], function () {}); jest.mock('mocked');",
    );
    f.write(
      'types.mts',
      "import type { Thing } from '@scope/types/subpath'; import eq = require('equals'); type T = import('typed').T;",
    );
    f.write('component.tsx', "import X from 'jsx'; export const Component = () => <X />;");
    const result = await runUnusedCheck({ root: f.root, config: f.config(), withUsedList: true });
    assert.deepEqual(result.parseErrors, []);
    for (const name of names)
      assert.ok(result.used.includes(name), `Missing module reference: ${name}`);
    assert.ok(result.unused.includes('unused'));
    assert.ok(result.unused.includes('comment-only'));
    assert.ok(result.dynamicUsed.includes('dynamic'));
    assert.ok(result.conditionalUsed.includes('conditional'));
    assert.equal(
      (await analyzeUsage(f.root, manifest, f.config())).entries.find(
        (entry) => entry.name === 'unused',
      ).confidence,
      'high',
    );
  } finally {
    f.close();
  }
});

test('metadata/config references retain CLI tools, JSONC extends, YAML plugins and JS loader hints without execution', async () => {
  const manifest = {
    dependencies: {
      'script-tool': '^1',
      '@tsconfig/node18': '^1',
      autoprefixer: '^1',
      'style-loader': '^1',
      'css-loader': '^1',
      '@scope/eslint-plugin': '^1',
      unused: '^1',
    },
    scripts: { build: 'custom-compiler --check' },
    eslintConfig: { extends: ['plugin:@scope/recommended'] },
  };
  const f = fixture(manifest);
  try {
    f.write('index.js', 'export const value = 1;');
    f.write('node_modules/script-tool/package.json', {
      name: 'script-tool',
      bin: { 'custom-compiler': 'bin.js' },
    });
    f.write(
      'tsconfig.json',
      '{ // compiler configuration\n "extends": "@tsconfig/node18/tsconfig.json", }',
    );
    f.write('.postcssrc.yaml', 'plugins:\n  autoprefixer: {}\n');
    f.write(
      'webpack.config.js',
      "throw new Error('configuration must not execute'); export default { loader: 'style-loader!css-loader' };",
    );
    const result = await analyzeUsage(f.root, manifest, f.config());
    assert.equal(result.status, 'completed');
    for (const name of Object.keys(manifest.dependencies).filter((name) => name !== 'unused')) {
      const entry = result.entries.find((entry) => entry.name === name);
      assert.equal(entry.status, 'used', name);
      assert.ok(entry.files.length, name);
    }
    assert.equal(result.entries.find((entry) => entry.name === 'unused').status, 'candidate');
  } finally {
    f.close();
  }
});

test('computed imports, malformed code, unsupported components and oversized files suppress removals', async () => {
  for (const [name, content] of [
    ['index.js', 'import(moduleName);'],
    ['invalid.ts', 'export const : = ;'],
    ['component.vue', '<script>import used from "app";</script>'],
    ['large.js', ' '.repeat(2 * 1024 * 1024 + 1)],
  ]) {
    const manifest = { dependencies: { app: '^1' } };
    const f = fixture(manifest);
    try {
      f.write(name, content);
      const result = await analyzeUsage(f.root, manifest, f.config());
      assert.equal(result.status, 'partial', name);
      assert.equal(result.entries[0].status, 'uncertain', name);
      assert.ok(result.errors.length, name);
    } finally {
      f.close();
    }
  }
});

test('scanner preserves ignore paths, hidden config discovery and nested install exclusions', async () => {
  const manifest = {
    dependencies: { hidden: '^1', unused: '^1' },
    packmate: { detection: { ignorePaths: ['backup/**'] } },
  };
  const f = fixture(manifest);
  try {
    f.write('.eslintrc.cjs', "require('hidden');");
    f.write('backup/index.js', "import('unused');");
    f.write('packages/app/node_modules/ignored/index.js', "import('unused');");
    const result = await runUnusedCheck({ root: f.root, withUsedList: true });
    assert.deepEqual(result.parseErrors, []);
    assert.ok(result.used.includes('hidden'));
    assert.ok(result.unused.includes('unused'));
    assert.equal(result.scannedFiles, 1);
  } finally {
    f.close();
  }
});

test('workspace glob migration preserves canonical paths, brace patterns and negated exclusions', async () => {
  const f = fixture({ name: 'root', workspaces: ['{packages,tools}/*', '!packages/excluded'] });
  try {
    f.write('packages/client/package.json', { name: 'client' });
    f.write('packages/excluded/package.json', { name: 'excluded' });
    f.write('tools/cli/package.json', { name: 'cli' });
    const projects = await discoverProjects(f.root, { workspaces: true });
    assert.deepEqual(
      projects.map((project) => project.relativePath),
      ['.', 'packages/client', 'tools/cli'],
    );
  } finally {
    f.close();
  }
});
