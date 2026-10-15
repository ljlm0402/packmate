import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { discoverProjects } from './workspaces.js';

const LOCKFILES = ['package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'yarn.lock'];
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
function safePath(root, relative) {
  if (
    typeof relative !== 'string' ||
    path.isAbsolute(relative) ||
    relative.split(/[\\/]/).some((part) => part === '..' || part === '')
  )
    throw new Error('Unsafe snapshot path');
  const filename = path.resolve(root, relative);
  if (!filename.startsWith(path.resolve(root) + path.sep))
    throw new Error('Snapshot path escapes root');
  let current = path.resolve(root);
  for (const part of relative.split('/')) {
    current = path.join(current, part);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink())
      throw new Error('Symlink snapshot paths are unsupported');
  }
  return filename;
}
export async function snapshotProject(root, { workspaces = false } = {}) {
  root = fs.realpathSync(root);
  const projects = await discoverProjects(root, { workspaces });
  const files = {};
  for (const project of projects) {
    for (const basename of [
      'package.json',
      ...LOCKFILES,
      'packmate.config.json',
      'pnpm-workspace.yaml',
    ]) {
      const relative = path
        .relative(root, path.join(project.root, basename))
        .split(path.sep)
        .join('/');
      const filename = safePath(root, relative);
      files[relative] = fs.existsSync(filename)
        ? fs.readFileSync(filename).toString('base64')
        : null;
    }
  }
  return { root, workspaces, files, fingerprint: hash(JSON.stringify(files)) };
}
function validateSnapshot(snapshot) {
  if (
    !snapshot ||
    typeof snapshot.root !== 'string' ||
    !snapshot.files ||
    typeof snapshot.files !== 'object' ||
    Array.isArray(snapshot.files)
  )
    throw new Error('Invalid snapshot');
  if (hash(JSON.stringify(snapshot.files)) !== snapshot.fingerprint)
    throw new Error('Snapshot integrity check failed');
  for (const [relative, data] of Object.entries(snapshot.files)) {
    if (
      !['package.json', ...LOCKFILES, 'packmate.config.json', 'pnpm-workspace.yaml'].includes(
        path.posix.basename(relative),
      ) ||
      relative.includes('\\')
    )
      throw new Error('Unsupported snapshot file');
    if (
      data !== null &&
      (typeof data !== 'string' || Buffer.from(data, 'base64').toString('base64') !== data)
    )
      throw new Error('Invalid snapshot data');
    safePath(snapshot.root, relative);
  }
}
export function verifySnapshot(snapshot) {
  validateSnapshot(snapshot);
  for (const relative of Object.keys(snapshot.files)) safePath(snapshot.root, relative);
  const files = Object.fromEntries(
    Object.keys(snapshot.files).map((relative) => {
      const filename = safePath(snapshot.root, relative);
      return [
        relative,
        fs.existsSync(filename) ? fs.readFileSync(filename).toString('base64') : null,
      ];
    }),
  );
  if (hash(JSON.stringify(files)) !== snapshot.fingerprint)
    throw new Error('Project files changed since the plan/checkpoint was recorded');
}
export function createPlan(report, snapshot) {
  verifySnapshot(snapshot);
  const actions = [];
  for (const project of report.projects) {
    for (const entry of project.dependencies) {
      const remediation = project.securityPlans.find((plan) => plan.name === entry.name);
      if (remediation?.status === 'ready')
        actions.push({
          name: entry.name,
          packageName: entry.name,
          action: 'update',
          latestVersion: remediation.latestVersion,
          currentVersion: entry.currentVersion,
          declaredSpec: entry.spec,
          reason: remediation.reason,
          project: project.path,
          security: true,
          requiresConfirmation: remediation.requiresConfirmation,
        });
      else if (
        (!remediation || remediation.status === 'not-affected') &&
        entry.status === 'update' &&
        entry.kind === 'registry' &&
        project.usage.entries.find((item) => item.name === entry.name)?.status !== 'candidate'
      )
        actions.push({
          name: entry.name,
          action: 'update',
          latestVersion: entry.latestVersion,
          currentVersion: entry.currentVersion,
          declaredSpec: entry.spec,
          project: project.path,
          requiresConfirmation: entry.updateType === 'major',
        });
    }
  }
  return { schemaVersion: 1, packageManager: report.packageManager, snapshot, actions };
}
export function writePlan(filename, plan) {
  fs.writeFileSync(filename, JSON.stringify(plan, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
}
export function createCheckpoint(plan) {
  verifySnapshot(plan.snapshot);
  const id = crypto.randomUUID();
  const base = safePath(plan.snapshot.root, '.packmate/checkpoints');
  fs.mkdirSync(base, { recursive: true, mode: 0o700 });
  const filename = safePath(plan.snapshot.root, `.packmate/checkpoints/${id}.json`);
  const checkpoint = {
    schemaVersion: 1,
    id,
    packageManager: plan.packageManager,
    actions: plan.actions,
    before: plan.snapshot,
    after: null,
    results: [],
    status: 'running',
  };
  fs.writeFileSync(filename, JSON.stringify(checkpoint, null, 2), { flag: 'wx', mode: 0o600 });
  return { filename, checkpoint };
}
function saveCheckpoint(filename, checkpoint) {
  const temp = `${filename}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temp, JSON.stringify(checkpoint, null, 2), { flag: 'wx', mode: 0o600 });
    fs.renameSync(temp, filename);
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
}
export async function finishCheckpoint(record, results, status = 'completed') {
  record.checkpoint.results = results;
  record.checkpoint.status = status;
  // Capture exactly the original tracked paths even if a command damaged package.json.
  const before = record.checkpoint.before;
  const files = Object.fromEntries(
    Object.keys(before.files).map((relative) => {
      const filename = safePath(before.root, relative);
      return [
        relative,
        fs.existsSync(filename) ? fs.readFileSync(filename).toString('base64') : null,
      ];
    }),
  );
  record.checkpoint.after = { ...before, files, fingerprint: hash(JSON.stringify(files)) };
  saveCheckpoint(record.filename, record.checkpoint);
}
export function restoreCheckpoint(root, id) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid checkpoint ID');
  root = fs.realpathSync(root);
  const filename = safePath(root, `.packmate/checkpoints/${id}.json`);
  const checkpoint = JSON.parse(fs.readFileSync(filename, 'utf8'));
  if (
    checkpoint.schemaVersion !== 1 ||
    checkpoint.id !== id ||
    checkpoint.before.root !== root ||
    checkpoint.after?.root !== root ||
    !checkpoint.after
  )
    throw new Error('Checkpoint is incomplete or belongs to another project');
  verifySnapshot(checkpoint.after);
  validateSnapshot(checkpoint.before);
  if (Object.keys(checkpoint.before.files).join() !== Object.keys(checkpoint.after.files).join())
    throw new Error('Checkpoint file list mismatch');
  // Validate every restore target before writing anything.
  for (const relative of Object.keys(checkpoint.before.files)) safePath(root, relative);
  for (const [relative, data] of Object.entries(checkpoint.before.files)) {
    const target = safePath(root, relative);
    if (data === null) {
      if (fs.existsSync(target)) fs.unlinkSync(target);
    } else {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, Buffer.from(data, 'base64'));
    }
  }
  checkpoint.status = 'restored';
  saveCheckpoint(filename, checkpoint);
  return checkpoint;
}
