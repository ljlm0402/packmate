import pMap from 'p-map';
import packageJson from 'package-json';
import fs from 'fs';
import path from 'path';
import semver from 'semver';
import process from 'process';
import yaml from 'js-yaml';
import cliProgress from 'cli-progress';
import pRetry from 'p-retry';

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
  if (lockJson?.dependencies?.[pkgName]) {
    return lockJson.dependencies[pkgName].version;
  }
  try {
    const pkgModulePath = path.resolve(nodeModulesPath, pkgName, 'package.json');
    if (fs.existsSync(pkgModulePath)) {
      const modPkg = JSON.parse(fs.readFileSync(pkgModulePath, 'utf-8'));
      if (modPkg.version) return modPkg.version;
    }
  } catch {}
  return pkgJson.dependencies?.[pkgName] || pkgJson.devDependencies?.[pkgName] || null;
}

// 각 패키지의 최신 버전을 가져오는 함수
export async function getLatestVersions(pkgs) {
  const total = pkgs.length;

  // 프로그레스 바 인스턴스 생성
  const bar = new cliProgress.SingleBar({
    format: '진행률 |{bar}| {value}/{total} ({percentage}%)',
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    hideCursor: true,
  });
  bar.start(total, 0); // (총개수, 시작값)

  // 실제 진행률 카운터
  let completed = 0;

  // 개별 패키지 최신 버전 조회 함수
  async function getLatest(pkg) {
    try {
      return await pRetry(
        async () => {
          const data = await packageJson(pkg);
          return [pkg, data.version];
        },
        { retries: 3 },
      );
    } catch (e) {
      console.error(`[fetch error] ${pkg}: ${e.message}`);
      return [pkg, null];
    } finally {
      completed += 1;
      bar.update(completed); // 바 갱신
    }
  }

  // p-map으로 동시성 제한(8개씩)
  const results = await pMap(pkgs, getLatest, { concurrency: 8 });
  bar.stop(); // 완료 시 바 종료

  return Object.fromEntries(results);
}

export async function getUpdateCandidates(packageManager = 'npm') {
  const pkgJson = getPkgJson();
  const lockJson = getLockJson(packageManager);

  const deps = { ...pkgJson.dependencies, ...pkgJson.devDependencies };
  const candidates = [];
  const depNames = Object.keys(deps);

  // 최신버전 한번에 조회
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
