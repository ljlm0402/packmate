import fs from 'node:fs';
import path from 'node:path';
import semver from 'semver';
import yaml from 'js-yaml';

export const DEPENDENCY_SECTIONS = ['dependencies', 'devDependencies', 'optionalDependencies'];
export function readManifest(root) {
  return JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
}
export function declaredDependencies(manifest) {
  const entries = new Map();
  for (const section of DEPENDENCY_SECTIONS) {
    for (const [name, spec] of Object.entries(manifest[section] || {}))
      entries.set(name, { name, spec, section });
  }
  return [...entries.values()];
}
export function classifySpecifier(name, spec) {
  if (typeof spec !== 'string') return { kind: 'unsupported', registryName: null };
  if (spec.startsWith('workspace:')) return { kind: 'workspace', registryName: null };
  if (/^(?:file:|link:|portal:|\.\.?\/)/.test(spec)) return { kind: 'local', registryName: null };
  if (spec.startsWith('npm:')) {
    const match = /^npm:((?:@[^/]+\/)?[^@]+)@(.+)$/.exec(spec);
    return match
      ? { kind: 'alias', registryName: match[1], range: match[2] }
      : { kind: 'unsupported', registryName: null };
  }
  if (semver.validRange(spec)) return { kind: 'registry', registryName: name, range: spec };
  if (/^[a-zA-Z][a-zA-Z0-9._-]*$/.test(spec)) return { kind: 'tag', registryName: name };
  return { kind: 'unsupported', registryName: null };
}
function within(root, target) {
  const relative = path.relative(root, target);
  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
  );
}
export function resolveDependency(root, entry, { lockRoot = root, packageManager = 'npm' } = {}) {
  if (!/^(?:@[a-z0-9_~.-]+\/)?[a-z0-9_~.-]+$/i.test(entry.name) || entry.name.startsWith('-'))
    throw new Error('Invalid dependency name');
  root = path.resolve(root);
  lockRoot = path.resolve(lockRoot);
  if (!within(lockRoot, root)) throw new Error('Project is outside lockfile root');
  const specifier = classifySpecifier(entry.name, entry.spec);
  const base = {
    ...entry,
    ...specifier,
    installedVersion: null,
    lockedVersion: null,
    source: null,
    errors: [],
  };
  // Only direct resolution paths are authoritative. Never pick an arbitrary .pnpm store entry.
  for (let current = root; within(lockRoot, current); current = path.dirname(current)) {
    const filename = path.join(current, 'node_modules', entry.name, 'package.json');
    try {
      if (fs.existsSync(filename)) {
        const installed = JSON.parse(fs.readFileSync(filename, 'utf8'));
        if (!semver.valid(installed.version)) throw new Error('Invalid installed version');
        if (installed.name !== (specifier.registryName || entry.name))
          throw new Error('Installed package name mismatch');
        return { ...base, installedVersion: installed.version, source: 'node_modules' };
      }
    } catch (error) {
      base.errors.push(error.message);
    }
    if (current === lockRoot) break;
  }
  try {
    let version;
    if (packageManager === 'npm') {
      const lockPath = ['npm-shrinkwrap.json', 'package-lock.json']
        .map((name) => path.join(lockRoot, name))
        .find(fs.existsSync);
      if (lockPath) {
        const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
        const relative = path.relative(lockRoot, root).split(path.sep).join('/');
        if (lock.packages) {
          let current = relative;
          while (true) {
            const key = [current, 'node_modules', entry.name].filter(Boolean).join('/');
            const locked = lock.packages[key];
            if (locked && !locked.link) {
              version = locked.version;
              break;
            }
            if (!current) break;
            current = path.posix.dirname(current);
            if (current === '.') current = '';
          }
        } else if (root === lockRoot) version = lock.dependencies?.[entry.name]?.version;
      }
    } else if (packageManager === 'pnpm') {
      const filename = path.join(lockRoot, 'pnpm-lock.yaml');
      if (fs.existsSync(filename)) {
        const lock = yaml.load(fs.readFileSync(filename, 'utf8'));
        const importer = path.relative(lockRoot, root).split(path.sep).join('/') || '.';
        const data = lock.importers?.[importer] || (importer === '.' ? lock : null);
        const value = data?.[entry.section]?.[entry.name];
        version = typeof value === 'object' ? value.version : value;
        if (typeof version === 'string') version = version.replace(/\(.*$/, '');
      }
    } else if (packageManager === 'yarn') {
      const filename = path.join(lockRoot, 'yarn.lock');
      if (fs.existsSync(filename)) {
        const text = fs.readFileSync(filename, 'utf8');
        const selector = `${entry.name}@${entry.spec}`;
        const matches = [];
        // Classic and Berry descriptors, including grouped quoted selectors.
        for (const block of text.split(/\n(?=\S)/)) {
          const header = block.split('\n')[0].replace(/:\s*$/, '').replace(/"/g, '');
          const selectors = header.split(/,\s*/);
          if (
            !selectors.includes(selector) &&
            !selectors.includes(`${entry.name}@npm:${entry.spec}`)
          )
            continue;
          const match = /^\s+version:?\s+"?([^"\s]+)"?\s*$/m.exec(block);
          if (match) matches.push(match[1]);
        }
        if (new Set(matches).size === 1) version = matches[0];
      }
    }
    if (semver.valid(version)) return { ...base, lockedVersion: version, source: 'lockfile' };
  } catch (error) {
    base.errors.push(error.message);
  }
  return base;
}
