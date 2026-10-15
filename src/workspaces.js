import fs from 'node:fs';
import path from 'node:path';
import { glob } from 'tinyglobby';
import yaml from 'js-yaml';
import semver from 'semver';
import { declaredDependencies, readManifest } from './dependency-resolver.js';

export async function discoverProjects(root, { workspaces = false } = {}) {
  root = fs.realpathSync(root);
  const manifest = readManifest(root);
  const projects = [{ root, relativePath: '.', manifest }];
  if (!workspaces) return projects;
  let patterns = Array.isArray(manifest.workspaces)
    ? manifest.workspaces
    : manifest.workspaces?.packages || [];
  const pnpmFile = path.join(root, 'pnpm-workspace.yaml');
  if (fs.existsSync(pnpmFile))
    patterns = yaml.load(fs.readFileSync(pnpmFile, 'utf8'))?.packages || patterns;
  if (
    !Array.isArray(patterns) ||
    patterns.some(
      (value) =>
        typeof value !== 'string' || path.isAbsolute(value) || value.split('/').includes('..'),
    )
  ) {
    throw new Error('Workspace patterns must be relative paths within the project');
  }
  const directories = await glob(patterns, {
    cwd: root,
    onlyDirectories: true,
    expandDirectories: false,
    followSymbolicLinks: false,
    ignore: ['**/node_modules/**', '**/.git/**', '**/.packmate/**'],
  });
  for (const relative of directories.sort()) {
    const directory = fs.realpathSync(path.join(root, relative));
    if (!directory.startsWith(root + path.sep))
      throw new Error('Workspace escapes the project root');
    if (fs.existsSync(path.join(directory, 'package.json')))
      projects.push({
        root: directory,
        relativePath: path.relative(root, directory).split(path.sep).join('/'),
        manifest: readManifest(directory),
      });
  }
  const names = projects.map(({ manifest: pkg }) => pkg.name).filter(Boolean);
  if (new Set(names).size !== names.length) throw new Error('Duplicate workspace package names');
  return projects;
}

export function workspaceGraph(projects) {
  const byName = new Map(
    projects
      .filter((project) => project.manifest.name)
      .map((project) => [project.manifest.name, project]),
  );
  const edges = [];
  for (const project of projects) {
    for (const entry of declaredDependencies(project.manifest)) {
      const target = byName.get(entry.name);
      if (!target) continue;
      let range = entry.spec;
      if (typeof range !== 'string') continue;
      if (range.startsWith('workspace:')) range = range.slice(10);
      const explicit =
        /^(?:file:|link:|portal:)/.test(entry.spec) &&
        path.resolve(project.root, entry.spec.replace(/^[^:]+:/, '')) === target.root;
      if (
        explicit ||
        ['*', '^', '~'].includes(range) ||
        (semver.valid(target.manifest.version) &&
          semver.validRange(range) &&
          semver.satisfies(target.manifest.version, range))
      ) {
        edges.push({
          from: project.relativePath,
          to: target.relativePath,
          packageName: entry.name,
          spec: entry.spec,
          section: entry.section,
        });
      }
    }
  }
  return {
    nodes: projects.map((project) => ({
      path: project.relativePath,
      name: project.manifest.name || null,
      version: project.manifest.version || null,
    })),
    edges,
  };
}

export function selectPackageManager(root, config = {}) {
  if (config.packageManager && ['npm', 'pnpm', 'yarn'].includes(config.packageManager))
    return config.packageManager;
  const declared = readManifest(root).packageManager?.split('@')[0];
  if (['npm', 'pnpm', 'yarn'].includes(declared)) return declared;
  const found = [
    ['pnpm', 'pnpm-lock.yaml'],
    ['yarn', 'yarn.lock'],
    ['npm', 'npm-shrinkwrap.json'],
    ['npm', 'package-lock.json'],
  ]
    .filter(([, filename]) => fs.existsSync(path.join(root, filename)))
    .map(([manager]) => manager);
  const unique = [...new Set(found)];
  if (unique.length > 1)
    throw new Error(
      'Ambiguous lockfiles: set packageManager in packmate.config.json or package.json',
    );
  return unique[0] || 'npm';
}
