import fs from 'fs';
import path from 'path';

let cachedPackageManager = null;

/**
 * 프로젝트 루트 경로 가져오기
 * @returns {string}
 */
function getProjectRoot() {
  return process.cwd();
}

/**
 * 패키지 매니저 감지 (pnpm > yarn > npm)
 * @returns {'pnpm' | 'yarn' | 'npm'}
 */
export function detectPackageManager() {
  if (cachedPackageManager) return cachedPackageManager;

  const root = getProjectRoot();

  const lockFiles = {
    pnpm: path.join(root, 'pnpm-lock.yaml'),
    yarn: path.join(root, 'yarn.lock'),
    npm: path.join(root, 'package-lock.json'),
  };

  // 우선순위 pnpm > yarn > npm
  if (fs.existsSync(lockFiles.pnpm)) {
    cachedPackageManager = 'pnpm';
  } else if (fs.existsSync(lockFiles.yarn)) {
    cachedPackageManager = 'yarn';
  } else if (fs.existsSync(lockFiles.npm)) {
    cachedPackageManager = 'npm';
  } else {
    // 기본값 npm
    cachedPackageManager = 'npm';
  }

  return cachedPackageManager;
}
