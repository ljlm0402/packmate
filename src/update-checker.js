import cliProgress from 'cli-progress';
import fs from 'fs';
import yaml from 'js-yaml';
import os from 'os';
import packageJson from 'package-json';
import path from 'path';
import process from 'process';
import pMap from 'p-map';
import pRetry from 'p-retry';
import semver from 'semver';
import { getCacheManager, initializeCache } from './enhanced-cache.js';

// 기존 캐시 시스템을 Smart Cache Manager로 대체
let cacheManager = null;

const pkgPath = path.resolve(process.cwd(), 'package.json');
const nodeModulesPath = path.resolve(process.cwd(), 'node_modules');

const lockPaths = {
  npm: path.resolve(process.cwd(), 'package-lock.json'),
  pnpm: path.resolve(process.cwd(), 'pnpm-lock.yaml'),
  yarn: path.resolve(process.cwd(), 'yarn.lock'),
};

function getPkgJson() {
  if (!fs.existsSync(pkgPath)) throw new Error('package.json 없음');
  return JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
}

function getLockJson(packageManager) {
  try {
    if (packageManager === 'npm' && fs.existsSync(lockPaths.npm)) {
      return JSON.parse(fs.readFileSync(lockPaths.npm, 'utf-8'));
    }
    if (packageManager === 'pnpm' && fs.existsSync(lockPaths.pnpm)) {
      // pnpm lock yaml 파싱 예시
      return yaml.load(fs.readFileSync(lockPaths.pnpm, 'utf-8'));
    }
    // yarn lock은 좀 더 복잡(별도 파서 필요)
  } catch (e) {
    console.warn(`lock file parse failed: ${e.message}`);
    return null;
  }
  return null;
}

function getInstalledVersion(pkgName, lockJson, pkgJson) {
  // 방법 1: 먼저 표준 node_modules 위치 시도
  try {
    const pkgModulePath = path.resolve(nodeModulesPath, pkgName, 'package.json');
    if (fs.existsSync(pkgModulePath)) {
      const modPkg = JSON.parse(fs.readFileSync(pkgModulePath, 'utf-8'));
      if (modPkg.version) return modPkg.version;
    }
  } catch (err) {
    // 다음 방법으로 계속
  }

  // 방법 2: pnpm의 .pnpm 디렉토리 확인
  try {
    const pnpmDir = path.resolve(nodeModulesPath, '.pnpm');
    if (fs.existsSync(pnpmDir)) {
      const entries = fs.readdirSync(pnpmDir);
      // @clack/prompts 같은 스코프 패키지 처리
      const depName = pkgName.replace('/', '+');
      const found = entries.find((f) => f.startsWith(depName + '@'));
      if (found) {
        const pkgPath = path.resolve(pnpmDir, found, 'node_modules', pkgName, 'package.json');
        if (fs.existsSync(pkgPath)) {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
          return pkg.version;
        }
      }
    }
  } catch (err) {
    // 다음 방법으로 계속
  }

  // 방법 3: 락 파일 확인
  if (lockJson?.dependencies?.[pkgName]) {
    return lockJson.dependencies[pkgName].version;
  }

  // 폴백: package.json에서 선언된 버전 반환
  return pkgJson.dependencies?.[pkgName] || pkgJson.devDependencies?.[pkgName] || null;
}

/**
 * Smart Cache Manager 초기화
 */
async function initSmartCache() {
  if (!cacheManager) {
    cacheManager = getCacheManager();
    await cacheManager.init();
  }
  return cacheManager;
}

/**
 * Smart Cache에서 패키지 버전 가져오기
 */
async function getCachedVersion(packageName) {
  const cache = await initSmartCache();
  const result = await cache.get(packageName);
  
  if (result.data) {
    return result.data.version;
  }
  return null;
}

/**
 * Smart Cache에 패키지 버전 저장
 */
async function setCachedVersion(packageName, version) {
  const cache = await initSmartCache();
  await cache.set(packageName, { 
    version, 
    timestamp: Date.now(),
    source: 'registry'
  });
}

/**
 * 각 패키지의 최신 버전을 가져옵니다 (Smart Caching)
 */
export async function getLatestVersions(pkgs) {
  await initSmartCache();

  const total = pkgs.length;

  // 진행률 표시줄 인스턴스
  const bar = new cliProgress.SingleBar({
    format: 'Progress |{bar}| {value}/{total} ({percentage}%)',
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    hideCursor: true,
  });
  bar.start(total, 0);

  let completed = 0;

  // 개별 패키지 최신 버전 조회 함수 (Smart Cache)
  async function getLatest(pkg) {
    try {
      // Smart Cache Manager를 통한 3단계 캐싱
      const cache = await initSmartCache();
      const cacheResult = await cache.get(pkg);
      
      if (cacheResult.data) {
        // Cache Hit (Memory 또는 Disk)
        return [pkg, cacheResult.data.version];
      }

      // Cache Miss - 레지스트리에서 가져오기
      const version = await pRetry(
        async () => {
          const data = await packageJson(pkg);
          return data.version;
        },
        { retries: 3, minTimeout: 1000 },
      );

      // Smart Cache에 저장
      await cache.set(pkg, { 
        version, 
        timestamp: Date.now(),
        source: 'registry'
      });

      return [pkg, version];
    } catch (e) {
      console.error(`[fetch error] ${pkg}: ${e.message}`);
      return [pkg, null];
    } finally {
      completed += 1;
      bar.update(completed);
    }
  }

  // CPU 코어 기반 동시성 최적화 (최대 16)
  const concurrency = Math.min(Math.max(os.cpus().length * 2, 8), 16);
  const results = await pMap(pkgs, getLatest, { concurrency });
  bar.stop();

  return Object.fromEntries(results);
}

export async function getUpdateCandidates(packageManager = 'npm') {
  const pkgJson = getPkgJson();
  const lockJson = getLockJson(packageManager);

  const deps = { ...pkgJson.dependencies, ...pkgJson.devDependencies };
  const candidates = [];
  const depNames = Object.keys(deps);

  // 최신 버전 한 번에 조회
  const latests = await getLatestVersions(depNames);

  for (const pkgName of depNames) {
    const currentVersion = getInstalledVersion(pkgName, lockJson, pkgJson);
    if (!currentVersion || !semver.valid(semver.coerce(currentVersion))) continue;
    const latestVersion = latests[pkgName];
    if (!latestVersion || !semver.valid(latestVersion)) continue;
    const currentSemVer = semver.coerce(currentVersion);
    if (semver.lt(currentSemVer, latestVersion)) {
      candidates.push({
        name: pkgName,
        currentVersion: currentSemVer.version,
        latestVersion,
        updateType: semver.diff(currentSemVer.version, latestVersion),
      });
    }
  }
  return candidates;
}
