import fs from 'node:fs';
import path from 'node:path';
import semver from 'semver';
import { buildActionCommand, executeActions } from './action-runner.js';
import { readManifest, classifySpecifier } from './dependency-resolver.js';
import { discoverProjects } from './workspaces.js';
import {
  verifySnapshot,
  snapshotProject,
  createCheckpoint,
  finishCheckpoint,
} from './checkpoints.js';
import { checkVulnerabilities, summarizeSecurity } from './security-checker.js';

export async function applyPlan(
  root,
  plan,
  { run, audit = checkVulnerabilities, onCommand = () => {}, onResult = () => {} } = {},
) {
  root = fs.realpathSync(root);
  if (plan.schemaVersion !== 1 || plan.snapshot?.root !== root || !Array.isArray(plan.actions))
    throw new Error('Invalid plan or project root');
  if (!['npm', 'pnpm', 'yarn'].includes(plan.packageManager))
    throw new Error('Unsupported plan package manager');
  verifySnapshot(plan.snapshot);
  const currentSnapshot = await snapshotProject(root, { workspaces: plan.snapshot.workspaces });
  if (currentSnapshot.fingerprint !== plan.snapshot.fingerprint)
    throw new Error('Plan snapshot does not cover the current project files');
  const current = await discoverProjects(root, { workspaces: plan.snapshot.workspaces });
  const projects = new Map(current.map((project) => [project.relativePath, project]));
  const seen = new Set();
  const actions = plan.actions.map((action) => {
    if (action.packageName && action.packageName !== action.name)
      throw new Error('Conflicting action package names');
    const project = projects.get(action.project);
    if (!project) throw new Error('Plan references an unknown workspace');
    const identity = `${action.project}:${action.name}`;
    if (seen.has(identity)) throw new Error('Plan contains duplicate actions');
    seen.add(identity);
    const manifest = readManifest(project.root);
    if (action.action === 'update' && !semver.valid(action.latestVersion))
      throw new Error('Updates require an exact version');
    const spec =
      manifest.optionalDependencies?.[action.name] ??
      manifest.dependencies?.[action.name] ??
      manifest.devDependencies?.[action.name];
    if (!spec || !['registry', 'tag'].includes(classifySpecifier(action.name, spec).kind))
      throw new Error('Applying local, alias or undeclared dependencies is unsupported');
    const workspaceRoot =
      project.relativePath === '.' && fs.existsSync(path.join(root, 'pnpm-workspace.yaml'));
    buildActionCommand(action, plan.packageManager, manifest, { workspaceRoot });
    return { action, project, manifest, workspaceRoot };
  });
  if (!actions.length) return { results: [], checkpointId: null, security: null };
  const record = createCheckpoint(plan);
  const results = [];
  let status = 'completed';
  try {
    for (const { action, project, manifest, workspaceRoot } of actions) {
      const entries = await executeActions([action], plan.packageManager, manifest, {
        run: run ? (cmd, args) => run(cmd, args, { cwd: project.root }) : undefined,
        cwd: project.root,
        workspaceRoot,
        onCommand,
        onResult,
      });
      results.push(...entries);
      if (entries.some((entry) => entry.code !== 0 || entry.terminated)) {
        status = 'failed';
        break;
      }
    }
  } catch (error) {
    status = 'failed';
    results.push({ code: 1, error: error.message });
  } finally {
    await finishCheckpoint(record, results, status);
  }
  let security = null;
  if (plan.actions.some((action) => action.security)) {
    if (results.some((entry) => entry.terminated))
      security = summarizeSecurity([], 'unavailable', 'Execution interrupted');
    else {
      try {
        security = await audit({ root, packageManager: plan.packageManager });
      } catch (error) {
        security = summarizeSecurity([], 'unavailable', error.message);
      }
    }
  }
  return { results, status, checkpointId: record.checkpoint.id, security };
}
