import { execSync } from 'child_process';
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

/**
 * 패키지 매니저가 실제로 설치되어 사용 가능한지 확인합니다
 */
function isPackageManagerAvailable(pm) {
  try {
    // Windows와 Unix-like 시스템 모두에서 작동하도록 개선
    // shell 옵션을 사용하여 PATH 환경변수 올바르게 해석
    const options = { 
      encoding: 'utf-8', 
      stdio: 'pipe',
      shell: true  // Windows와 Unix-like 모두에서 안정적으로 작동
    };
    execSync(`${pm} --version`, options);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * 사용 가능한 패키지 매니저 목록을 우선순위대로 가져옵니다
 */
function getAvailablePackageManagers() {
  const available = [];
  const managers = ['pnpm', 'yarn', 'npm'];

  for (const pm of managers) {
    if (isPackageManagerAvailable(pm)) {
      available.push(pm);
    }
  }

  return available;
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
  const available = getAvailablePackageManagers();

  // 사용 가능한 패키지 매니저가 전혀 없음
  if (available.length === 0) {
    console.error('\x1b[31m%s\x1b[0m', '❌ No package manager found. Please install npm, yarn, or pnpm.');
    process.exit(1);
  }

  // 여러 락 파일 감지됨
  if (found.length > 1) {
    console.log(
      '\x1b[33m%s\x1b[0m',
      `⚠️  Multiple lock files detected: ${found.map(([k]) => k).join(', ')}.`,
    );
  }

  // 락 파일 없음 - 첫 번째 사용 가능한 패키지 매니저 사용
  if (found.length === 0) {
    console.log('\x1b[33m%s\x1b[0m', `⚠️  No lock file detected. Using: ${available[0]}`);
    cachedPackageManager = available[0];
    return cachedPackageManager;
  }

  // 감지된 패키지 매니저가 실제로 사용 가능한지 확인
  const detectedPm = found[0][0];

  if (isPackageManagerAvailable(detectedPm)) {
    // 완벽한 매칭 - 락 파일이 존재하고 패키지 매니저가 설치됨
    if (found.length > 1) {
      console.log('\x1b[32m%s\x1b[0m', `✓ Using: ${detectedPm}`);
    }
    cachedPackageManager = detectedPm;
  } else {
    // 락 파일은 존재하지만 패키지 매니저가 설치되지 않음 - 폴백
    const fallbackPm = available[0];
    console.log(
      '\x1b[33m%s\x1b[0m',
      `⚠️  ${detectedPm} lock file found, but ${detectedPm} is not installed.`,
    );
    console.log(
      '\x1b[33m%s\x1b[0m',
      `⚠️  Falling back to: ${fallbackPm}`,
    );
    console.log(
      '\x1b[36m%s\x1b[0m',
      `💡 Tip: Install ${detectedPm} globally with: npm install -g ${detectedPm}`,
    );
    cachedPackageManager = fallbackPm;
  }

  return cachedPackageManager;
}
