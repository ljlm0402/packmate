import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolveDependency, classifySpecifier } from '../src/dependency-resolver.js';
import { analyzeUpdates } from '../src/update-checker.js';
import {
  parseAuditOutput,
  checkVulnerabilities,
  summarizeSecurity,
} from '../src/security-checker.js';
import { planSecurityUpdate } from '../src/security-plan.js';
import { analyzeUsage } from '../src/usage-analysis.js';
import { discoverProjects, workspaceGraph, selectPackageManager } from '../src/workspaces.js';
import { analyzeProject, reportExitCode } from '../src/report.js';
import { snapshotProject, createPlan, restoreCheckpoint } from '../src/checkpoints.js';
import { applyPlan } from '../src/apply-plan.js';
import { parseArguments } from '../src/cli-modes.js';

const cli = fileURLToPath(new URL('../bin/packmate.js', import.meta.url));
function fixture(manifest = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'packmate-dev-'));
  const write = (relative, value) => {
    const filename = path.join(root, relative);
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, typeof value === 'string' ? value : JSON.stringify(value));
  };
  write('package.json', { name: 'fixture', version: '1.0.0', ...manifest });
  return { root, write, close: () => fs.rmSync(root, { recursive: true, force: true }) };
}
const entry = { name: 'app', spec: '^1.0.0', section: 'dependencies' };
const config = {
  ignorePatterns: [],
  analysisMode: { unused: 'moderate', devDeps: true },
  detection: {
    ignorePaths: ['node_modules/**'],
    ignoreUnused: [],
    dynamicImport: true,
    conditionalRequire: true,
  },
};

test('resolver uses direct installed version, not arbitrary store entries or declared ranges', () => {
  const f = fixture({ dependencies: { app: '^1.0.0' } });
  try {
    f.write('node_modules/.pnpm/app@9.0.0/node_modules/app/package.json', {
      name: 'app',
      version: '9.0.0',
    });
    assert.equal(resolveDependency(f.root, entry).installedVersion, null);
    assert.equal(resolveDependency(f.root, entry).lockedVersion, null);
    f.write('node_modules/app/package.json', { name: 'app', version: '1.2.0' });
    assert.equal(resolveDependency(f.root, entry).installedVersion, '1.2.0');
    assert.throws(() => resolveDependency(f.root, { ...entry, name: '../outside' }));
  } finally {
    f.close();
  }
});

test('npm lockfile resolves the workspace path and legacy direct entries', () => {
  const f = fixture();
  try {
    f.write('packages/client/package.json', { name: 'client' });
    f.write('package-lock.json', {
      lockfileVersion: 3,
      packages: {
        'node_modules/app': { version: '1.1.0' },
        'packages/client/node_modules/app': { version: '1.3.0' },
      },
    });
    assert.equal(
      resolveDependency(path.join(f.root, 'packages/client'), entry, { lockRoot: f.root })
        .lockedVersion,
      '1.3.0',
    );
    f.write('package-lock.json', { dependencies: { app: { version: '1.4.0' } } });
    assert.equal(resolveDependency(f.root, entry).lockedVersion, '1.4.0');
  } finally {
    f.close();
  }
});

test('pnpm importer and Yarn classic/Berry selectors resolve exact locked versions', () => {
  const f = fixture();
  try {
    f.write(
      'pnpm-lock.yaml',
      "lockfileVersion: '9.0'\nimporters:\n  .:\n    dependencies:\n      app:\n        specifier: ^1.0.0\n        version: 1.2.0(peer@2.0.0)\n  packages/client:\n    dependencies:\n      app:\n        version: 1.3.0\n",
    );
    assert.equal(
      resolveDependency(f.root, entry, { packageManager: 'pnpm' }).lockedVersion,
      '1.2.0',
    );
    f.write('yarn.lock', '# yarn lockfile v1\n\napp@^1.0.0, app@~1.2.0:\n  version "1.2.0"\n');
    assert.equal(
      resolveDependency(f.root, entry, { packageManager: 'yarn' }).lockedVersion,
      '1.2.0',
    );
    f.write('yarn.lock', '__metadata:\n  version: 8\n\n"app@npm:^1.0.0":\n  version: 1.3.0\n');
    assert.equal(
      resolveDependency(f.root, entry, { packageManager: 'yarn' }).lockedVersion,
      '1.3.0',
    );
    assert.equal(classifySpecifier('alias', 'npm:@scope/real@^1').registryName, '@scope/real');
    assert.equal(classifySpecifier('local', 'workspace:^').kind, 'workspace');
    assert.equal(classifySpecifier('remote', 'github:org/repo').kind, 'unsupported');
  } finally {
    f.close();
  }
});

test('registry failure remains unknown, prereleases remain exact and alias lookups use target name', async () => {
  const f = fixture({ dependencies: { app: '^1', alias: 'npm:real@^2' } });
  try {
    f.write('node_modules/app/package.json', { name: 'app', version: '1.1.0-beta.1' });
    f.write('node_modules/alias/package.json', { name: 'real', version: '2.0.0' });
    const names = [];
    const updates = await analyzeUpdates('npm', {
      root: f.root,
      config,
      fetchLatest: async (name) => {
        names.push(name);
        if (name === 'app') throw new Error('Offline');
        return { version: '2.1.0' };
      },
    });
    assert.equal(updates.find((item) => item.name === 'app').status, 'unknown');
    assert.equal(updates.find((item) => item.name === 'app').currentVersion, '1.1.0-beta.1');
    assert.equal(updates.find((item) => item.name === 'alias').status, 'update');
    assert.deepEqual(names.sort(), ['app', 'real']);
  } finally {
    f.close();
  }
});

const auditFixture = {
  vulnerabilities: {
    app: {
      isDirect: true,
      severity: 'high',
      range: '<2',
      via: ['leaf'],
      fixAvailable: { name: 'app', version: '2.0.0' },
    },
    leaf: {
      isDirect: false,
      severity: 'high',
      range: '<1.1',
      via: [
        {
          source: 123,
          name: 'leaf',
          title: 'Bad leaf',
          severity: 'high',
          range: '<1.1.0',
          url: 'https://example.test/advisory',
        },
      ],
    },
  },
};
test('audit retains direct packages affected through transitive via references', () => {
  const vulnerabilities = parseAuditOutput(JSON.stringify(auditFixture), 'pnpm', {
    manifest: { dependencies: { app: '^1' } },
  });
  const app = vulnerabilities.find((item) => item.packageName === 'app');
  assert.equal(app.direct, true);
  assert.equal(app.inherited, true);
  assert.equal(app.affectedPackage, 'leaf');
  assert.equal(vulnerabilities.length, 2);
  const cycle = parseAuditOutput(
    JSON.stringify({ vulnerabilities: { a: { via: ['b'] }, b: { via: ['a'] } } }),
    'npm',
  );
  assert.equal(cycle.length, 2);
  assert.ok(cycle.every((item) => item.inherited));
});

test('Yarn classic JSONL, npm/pnpm errors, timeout and disabled scans preserve result states', async () => {
  const output = [
    {
      type: 'auditAdvisory',
      data: {
        advisory: { id: 1, module_name: 'app', severity: 'high', vulnerable_versions: '<1.2.0' },
      },
    },
    { type: 'auditSummary', data: {} },
  ]
    .map(JSON.stringify)
    .join('\n');
  assert.equal(
    parseAuditOutput(output, 'yarn', { manifest: { dependencies: { app: '1' } } })[0].direct,
    true,
  );
  assert.throws(() => parseAuditOutput('{"error":{"summary":"no lock"}}', 'pnpm'));
  let calls = 0;
  const disabled = await checkVulnerabilities({
    manifest: {},
    enabled: false,
    run: async () => {
      calls++;
    },
  });
  assert.equal(disabled.status, 'disabled');
  assert.equal(calls, 0);
  const failed = await checkVulnerabilities({
    manifest: {},
    run: async () => ({ error: 'timed out', code: null }),
  });
  assert.equal(failed.status, 'unavailable');
  const findings = await checkVulnerabilities({
    packageManager: 'pnpm',
    manifest: { dependencies: { app: '1' } },
    run: async () => ({ code: 1, stdout: JSON.stringify(auditFixture) }),
  });
  assert.equal(findings.status, 'completed');
  const noData = await checkVulnerabilities({
    manifest: {},
    run: async () => ({ code: 1, stdout: '{"vulnerabilities":{}}' }),
  });
  assert.equal(noData.status, 'unavailable');
  const yarnCalls = [];
  const berry = await checkVulnerabilities({
    packageManager: 'yarn',
    manifest: {},
    run: async (cmd, args) => {
      yarnCalls.push(args);
      return args[0] === '--version'
        ? { code: 0, stdout: '4.0.0' }
        : { code: 0, stdout: '{"advisories":{}}' };
    },
  });
  assert.equal(berry.status, 'completed');
  assert.equal(yarnCalls[1][0], 'npm');
});

test('usage evidence includes files, suppresses candidates on parse errors and honors policy', async () => {
  const f = fixture({ dependencies: { app: '1', unused: '1' } });
  try {
    f.write('index.js', "import('app/path');");
    const result = await analyzeUsage(f.root, { dependencies: { app: '1', unused: '1' } }, config, {
      crossCheck: async () => ({ dependencies: ['unused'], using: {} }),
    });
    assert.equal(result.entries.find((item) => item.name === 'app').files[0].file, 'index.js');
    assert.equal(result.entries.find((item) => item.name === 'unused').confidence, 'high');
    f.write('broken.ts', 'export const : = ;');
    const incomplete = await analyzeUsage(
      f.root,
      { dependencies: { app: '1', unused: '1' } },
      config,
      { crossCheck: async () => ({ dependencies: ['unused'] }) },
    );
    assert.equal(incomplete.status, 'partial');
    assert.equal(incomplete.entries.find((item) => item.name === 'unused').status, 'uncertain');
    assert.equal(incomplete.errors[0].file, 'broken.ts');
  } finally {
    f.close();
  }
});

const securityDependency = {
  name: 'app',
  kind: 'registry',
  currentVersion: '1.0.0',
  spec: '^1.0.0',
};
const advisories = [{ vulnerableVersions: '<1.0.2', direct: true }];
test('security plan selects smallest in-range fix and checks engine, forward/reverse peers and deprecation', () => {
  const metadata = {
    versions: {
      '1.0.1': {},
      '1.0.2': { deprecated: 'bad' },
      '1.0.3': { engines: { node: '>=99' } },
      '1.0.4': { peerDependencies: { peer: '^3' } },
      '1.0.5': { peerDependencies: { peer: '^2' } },
      '1.1.0': {},
      '2.0.0': {},
    },
  };
  const plan = planSecurityUpdate(securityDependency, advisories, metadata, {
    peerVersions: { peer: '2.1.0' },
    nodeVersion: '22.0.0',
    dependentPeerRanges: ['<1.1.0'],
  });
  assert.equal(plan.latestVersion, '1.0.5');
  assert.equal(plan.requiresConfirmation, false);
  const major = planSecurityUpdate(securityDependency, advisories, { versions: { '2.0.0': {} } });
  assert.equal(major.requiresConfirmation, true);
  assert.equal(major.requiresRangeChange, true);
  assert.equal(
    planSecurityUpdate(
      securityDependency,
      [{ inherited: true, vulnerableVersions: '<1' }],
      metadata,
    ).status,
    'blocked',
  );
  assert.equal(
    planSecurityUpdate(securityDependency, advisories, {
      versions: { '1.0.2': { peerDependencies: { missing: '^1' } } },
    }).status,
    'blocked',
  );
});

test('workspace discovery and graph handle npm and pnpm manifests and reject duplicate names', async () => {
  const f = fixture({ workspaces: ['packages/*'], dependencies: { lib: 'workspace:*' } });
  try {
    f.write('packages/lib/package.json', { name: 'lib', version: '1.0.0' });
    f.write('packages/app/package.json', { name: 'client', dependencies: { lib: '^1' } });
    const projects = await discoverProjects(f.root, { workspaces: true });
    assert.equal(projects.length, 3);
    assert.equal(workspaceGraph(projects).edges.length, 2);
    f.write('pnpm-workspace.yaml', "packages:\n  - packages/*\n  - '!packages/app'\n");
    assert.equal((await discoverProjects(f.root, { workspaces: true })).length, 2);
    f.write('package-lock.json', {});
    f.write('pnpm-lock.yaml', {});
    assert.throws(() => selectPackageManager(f.root));
    assert.equal(selectPackageManager(f.root, { packageManager: 'npm' }), 'npm');
    f.write('pnpm-workspace.yaml', 'packages:\n  - packages/*\n');
    f.write('packages/app/package.json', { name: 'lib' });
    await assert.rejects(discoverProjects(f.root, { workspaces: true }), /Duplicate/);
  } finally {
    f.close();
  }
});

test('read-only report and CLI preserve files, emit pure JSON and return policy exit codes', async () => {
  const f = fixture({ dependencies: { app: '^1' }, packmate: { security: { enabled: false } } });
  try {
    f.write('package-lock.json', { packages: { 'node_modules/app': { version: '1.0.0' } } });
    f.write('index.js', "import 'app';");
    const before = await snapshotProject(f.root);
    const report = await analyzeProject({
      root: f.root,
      fetchLatest: async () => ({ version: '1.1.0' }),
    });
    assert.equal(report.summary.updates, 1);
    assert.equal(reportExitCode(report, { ci: true }), 1);
    assert.equal((await snapshotProject(f.root)).fingerprint, before.fingerprint);
    assert.equal(fs.existsSync(path.join(f.root, '.packmate')), false);
    const cliResult = spawnSync(process.execPath, [cli, '--ci', '--json', '--offline'], {
      cwd: f.root,
      encoding: 'utf8',
    });
    assert.equal(cliResult.status, 2, cliResult.stderr);
    const json = JSON.parse(cliResult.stdout);
    assert.equal(json.projects[0].dependencies[0].status, 'unknown');
    assert.equal((await snapshotProject(f.root)).fingerprint, before.fingerprint);
    assert.equal(fs.existsSync(path.join(f.root, '.packmate')), false);
    const clean = fixture({ packmate: { security: { enabled: false } } });
    try {
      const result = spawnSync(process.execPath, [cli, '--ci', '--json', '--offline'], {
        cwd: clean.root,
        encoding: 'utf8',
      });
      assert.equal(result.status, 0, result.stderr);
    } finally {
      clean.close();
    }
  } finally {
    f.close();
  }
});

async function planFixture(f) {
  const snapshot = await snapshotProject(f.root);
  return {
    schemaVersion: 1,
    packageManager: 'npm',
    snapshot,
    actions: [{ project: '.', name: 'app', action: 'update', latestVersion: '1.1.0' }],
  };
}
test('apply rejects stale plans before mutation, checkpoints partial failure and restores files', async () => {
  const f = fixture({ dependencies: { app: '^1', other: '^1' } });
  try {
    f.write('package-lock.json', { lockfileVersion: 3 });
    const plan = await planFixture(f);
    const original = fs.readFileSync(path.join(f.root, 'package.json'), 'utf8');
    f.write('package-lock.json', { lockfileVersion: 2 });
    let calls = 0;
    await assert.rejects(
      applyPlan(f.root, plan, {
        run: async () => {
          calls++;
        },
      }),
      /changed/,
    );
    assert.equal(calls, 0);
    assert.equal(fs.existsSync(path.join(f.root, '.packmate')), false);
    const currentPlan = await planFixture(f);
    currentPlan.actions.push({
      project: '.',
      name: 'other',
      action: 'update',
      latestVersion: '1.2.0',
    });
    const applied = await applyPlan(f.root, currentPlan, {
      run: async (cmd, args, options) => {
        assert.equal(options.cwd, fs.realpathSync(f.root));
        calls++;
        f.write('package.json', { name: 'fixture', dependencies: { app: '^1.1.0', other: '^1' } });
        return { code: 1 };
      },
    });
    assert.equal(calls, 1);
    assert.equal(applied.status, 'failed');
    assert.equal(applied.results.length, 1);
    assert.ok(applied.checkpointId);
    restoreCheckpoint(f.root, applied.checkpointId);
    assert.equal(fs.readFileSync(path.join(f.root, 'package.json'), 'utf8'), original);
  } finally {
    f.close();
  }
});

test('restore refuses subsequent user edits; security actions trigger re-audit', async () => {
  const f = fixture({ dependencies: { app: '^1' } });
  try {
    const plan = await planFixture(f);
    plan.actions[0].security = true;
    let audits = 0;
    const result = await applyPlan(f.root, plan, {
      run: async () => ({ code: 0 }),
      audit: async () => {
        audits++;
        return summarizeSecurity([]);
      },
    });
    assert.equal(audits, 1);
    assert.equal(result.security.status, 'completed');
    f.write('package.json', { name: 'user-changed' });
    assert.throws(() => restoreCheckpoint(f.root, result.checkpointId), /changed/);
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(f.root, 'package.json'))).name,
      'user-changed',
    );
  } finally {
    f.close();
  }
});

test('workspace plans execute in the correct directory and recover a newly created lockfile', async () => {
  const f = fixture({ workspaces: ['packages/*'], packageManager: 'npm@10.0.0' });
  try {
    f.write('packages/client/package.json', { name: 'client', dependencies: { app: '^1' } });
    const snapshot = await snapshotProject(f.root, { workspaces: true });
    const plan = {
      schemaVersion: 1,
      packageManager: 'npm',
      snapshot,
      actions: [
        { project: 'packages/client', name: 'app', action: 'update', latestVersion: '1.1.0' },
      ],
    };
    const applied = await applyPlan(f.root, plan, {
      run: async (cmd, args, { cwd }) => {
        assert.equal(cwd, path.join(fs.realpathSync(f.root), 'packages/client'));
        f.write('packages/client/package-lock.json', {});
        return { code: 0 };
      },
    });
    restoreCheckpoint(f.root, applied.checkpointId);
    assert.equal(fs.existsSync(path.join(f.root, 'packages/client/package-lock.json')), false);
    const malicious = { ...plan, actions: [{ ...plan.actions[0], project: '../outside' }] };
    await assert.rejects(applyPlan(f.root, malicious), /unknown workspace/);
  } finally {
    f.close();
  }
});

test('plans prefer security targets, block unverified fixes and reject tampered snapshots and flags', async () => {
  const f = fixture({ dependencies: { app: '^1' } });
  try {
    const snapshot = await snapshotProject(f.root);
    const report = {
      packageManager: 'npm',
      projects: [
        {
          path: '.',
          dependencies: [
            { name: 'app', status: 'update', kind: 'registry', latestVersion: '9.0.0' },
          ],
          usage: { entries: [] },
          securityPlans: [{ name: 'app', status: 'ready', latestVersion: '1.0.2' }],
        },
      ],
    };
    const plan = createPlan(report, snapshot);
    assert.equal(plan.actions[0].latestVersion, '1.0.2');
    report.projects[0].securityPlans[0].status = 'blocked';
    assert.equal(createPlan(report, snapshot).actions.length, 0);
    plan.snapshot.files['package.json'] = Buffer.from('{}').toString('base64');
    await assert.rejects(applyPlan(f.root, plan), /integrity/);
    assert.throws(() => parseArguments(['--apply', 'plan.json', '--offline']));
    assert.throws(() => parseArguments(['--yes']));
    assert.throws(() => parseArguments(['--unknown']));
    assert.equal(parseArguments(['--ci', '--json']).ci, true);
  } finally {
    f.close();
  }
});

test('buffered command runner bounds time/output and returns final output', async () => {
  const { readCommand } = await import('../src/read-command.js');
  const ok = await readCommand(process.execPath, [
    '-e',
    "process.stdout.write('final'); process.stderr.write('detail')",
  ]);
  assert.equal(ok.stdout, 'final');
  assert.equal(ok.stderr, 'detail');
  assert.equal(ok.code, 0);
  const timeout = await readCommand(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    timeout: 100,
  });
  assert.equal(timeout.error, 'Command timed out');
  const large = await readCommand(
    process.execPath,
    ['-e', "process.stdout.write('x'.repeat(10000))"],
    { maxBytes: 10 },
  );
  assert.equal(large.error, 'Command output limit exceeded');
});

test('workspace reports share audit, isolate usage and keep local edges out of update plans', async () => {
  const f = fixture({
    workspaces: ['packages/*'],
    packageManager: 'npm@10.0.0',
    dependencies: { lib: 'workspace:*' },
  });
  try {
    f.write('packages/lib/package.json', {
      name: 'lib',
      version: '1.0.0',
      dependencies: { app: '^1' },
    });
    f.write('packages/lib/index.js', "import 'app';");
    f.write('package-lock.json', { packages: { 'node_modules/app': { version: '1.0.0' } } });
    let audits = 0;
    const report = await analyzeProject({
      root: f.root,
      workspaces: true,
      fetchLatest: async () => ({ version: '1.1.0' }),
      audit: async () => {
        audits++;
        return summarizeSecurity([]);
      },
    });
    assert.equal(audits, 1);
    assert.equal(report.projects.length, 2);
    assert.equal(report.projects[0].dependencies[0].status, 'unsupported');
    assert.equal(report.projects[0].usage.entries[0].status, 'ignored');
    assert.equal(report.projects[1].usage.entries[0].status, 'used');
    const plan = createPlan(report, await snapshotProject(f.root, { workspaces: true }));
    assert.equal(plan.actions.length, 1);
    assert.equal(plan.actions[0].project, 'packages/lib');
  } finally {
    f.close();
  }
});

test('plan CLI never executes commands, refuses overwrite and apply requires confirmation', async () => {
  const f = fixture({ packmate: { security: { enabled: false } } });
  try {
    const filename = path.join(f.root, 'plan.json');
    const planned = spawnSync(process.execPath, [cli, '--plan', filename, '--offline', '--json'], {
      cwd: f.root,
      encoding: 'utf8',
    });
    assert.equal(planned.status, 0, planned.stderr);
    assert.equal(JSON.parse(planned.stdout).schemaVersion, 1);
    const contents = fs.readFileSync(filename, 'utf8');
    assert.equal(fs.existsSync(path.join(f.root, '.packmate')), false);
    const repeated = spawnSync(process.execPath, [cli, '--plan', filename, '--offline', '--json'], {
      cwd: f.root,
      encoding: 'utf8',
    });
    assert.equal(repeated.status, 2);
    assert.equal(JSON.parse(repeated.stdout).status, 'failed');
    assert.equal(fs.readFileSync(filename, 'utf8'), contents);
    const apply = spawnSync(process.execPath, [cli, '--apply', filename], {
      cwd: f.root,
      encoding: 'utf8',
    });
    assert.equal(apply.status, 2);
    assert.match(apply.stderr, /confirmation required/);
    assert.equal(fs.existsSync(path.join(f.root, '.packmate')), false);
  } finally {
    f.close();
  }
});

test('symlinked checkpoint directories and missing snapshot coverage are rejected before execution', async () => {
  const f = fixture({ dependencies: { app: '^1' } });
  try {
    const plan = await planFixture(f);
    const incomplete = structuredClone(plan);
    delete incomplete.snapshot.files['yarn.lock'];
    const crypto = await import('node:crypto');
    incomplete.snapshot.fingerprint = crypto
      .createHash('sha256')
      .update(JSON.stringify(incomplete.snapshot.files))
      .digest('hex');
    await assert.rejects(applyPlan(f.root, incomplete), /cover/);
    // Windows symlink creation can require elevated privileges; path-coverage check runs everywhere.
    if (process.platform !== 'win32') {
      fs.mkdirSync(path.join(f.root, 'external'));
      fs.symlinkSync(path.join(f.root, 'external'), path.join(f.root, '.packmate'));
      await assert.rejects(applyPlan(f.root, plan), /Symlink/);
    }
  } finally {
    f.close();
  }
});

test('ignored packages do not fail missing checks; invalid configuration emits a failed JSON report', async () => {
  const f = fixture({
    dependencies: { app: '^1' },
    packmate: { ignorePatterns: ['app'], security: { enabled: false } },
  });
  try {
    const report = await analyzeProject({ root: f.root, offline: true });
    assert.equal(report.summary.unknown, 0);
    assert.equal(report.summary.missing, 0);
    assert.equal(reportExitCode(report, { ci: true }), 0);
    f.write('packmate.config.json', '{broken');
    const result = spawnSync(process.execPath, [cli, '--ci', '--offline', '--json'], {
      cwd: f.root,
      encoding: 'utf8',
    });
    assert.equal(result.status, 2);
    assert.equal(JSON.parse(result.stdout).status, 'failed');
    assert.match(JSON.parse(result.stdout).error, /Invalid packmate.config.json/);
  } finally {
    f.close();
  }
});

test('manifest-only input never becomes a high-confidence removal candidate', async () => {
  const f = fixture({ dependencies: { app: '^1' } });
  try {
    const result = await analyzeUsage(f.root, { dependencies: { app: '^1' } }, config, {
      crossCheck: async () => ({ dependencies: ['app'], using: {} }),
    });
    assert.equal(result.scannedFiles, 0);
    assert.equal(result.coverage, 'manifest-only');
    assert.equal(result.status, 'partial');
    assert.equal(result.entries[0].status, 'uncertain');
    assert.equal(result.entries[0].confidence, 'low');
    assert.match(result.entries[0].reasons.join(), /No analyzable source files/);
  } finally {
    f.close();
  }
});
