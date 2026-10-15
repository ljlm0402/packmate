import fs from 'node:fs';
import { executeActions } from './action-runner.js';

async function apply(packages, packageManager, action) {
  if (!packages.length) return [];
  const manifest = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const results = await executeActions(packages.map((name) => ({ name, action })), packageManager, manifest);
  const failure = results.find((result) => result.code !== 0 || result.terminated);
  if (failure) throw Object.assign(new Error(`Package ${action} failed`), failure);
  return results;
}

export function installPackages(packages, packageManager) {
  return apply(packages, packageManager, 'install');
}

export function uninstallPackages(packages, packageManager) {
  return apply(packages, packageManager, 'remove');
}
