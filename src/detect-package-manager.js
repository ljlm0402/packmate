import fs from 'fs';
import path from 'path';
import process from 'process';

let cachedPackageManager = null;

function getProjectRoot() {
  return process.cwd();
}

function findLockFileUpward(root, lockFile) {
  let current = root;
  for (let i = 0; i < 3; i++) {
    // 3단계까지만 탐색 (원하면 늘릴 수 있음)
    const filePath = path.join(current, lockFile);
    if (fs.existsSync(filePath)) return filePath;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

export function detectPackageManager() {
  if (cachedPackageManager) return cachedPackageManager;

  const root = getProjectRoot();

  const lockFiles = {
    pnpm: findLockFileUpward(root, 'pnpm-lock.yaml'),
    yarn: findLockFileUpward(root, 'yarn.lock'),
    npm: findLockFileUpward(root, 'package-lock.json'),
  };

  const found = Object.entries(lockFiles).filter(([, v]) => v);

  if (found.length > 1) {
    console.log(
      '\x1b[33m%s\x1b[0m',
      `⚠️  Multiple lock files detected: ${found.map(([k]) => k).join(', ')}. Using: ${found[0][0]}`,
    );
  }

  if (found.length === 0) {
    console.log('\x1b[33m%s\x1b[0m', '⚠️  No lock file detected. Defaulting to npm.');
    cachedPackageManager = 'npm';
  } else {
    cachedPackageManager = found[0][0];
  }

  return cachedPackageManager;
}
