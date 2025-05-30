import fs from 'fs';
import path from 'path';
import process from 'process';

let cachedPackageManager = null;

function getProjectRoot() {
  return process.cwd();
}

export function detectPackageManager() {
  if (cachedPackageManager) return cachedPackageManager;

  const root = getProjectRoot();

  const lockFiles = {
    pnpm: path.join(root, 'pnpm-lock.yaml'),
    yarn: path.join(root, 'yarn.lock'),
    npm: path.join(root, 'package-lock.json'),
  };

  if (fs.existsSync(lockFiles.pnpm)) {
    cachedPackageManager = 'pnpm';
  } else if (fs.existsSync(lockFiles.yarn)) {
    cachedPackageManager = 'yarn';
  } else if (fs.existsSync(lockFiles.npm)) {
    cachedPackageManager = 'npm';
  } else {
    cachedPackageManager = 'npm';
  }

  return cachedPackageManager;
}
