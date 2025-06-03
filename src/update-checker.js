import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import semver from 'semver';
import process from 'process';
import yaml from 'js-yaml'; // pnpm lock yaml 파싱

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

// 여러 패키지 병렬 조회(최대 8개씩)
async function getLatestVersions(pkgs) {
  const res = {};
  const batchSize = 8;
  for (let i = 0; i < pkgs.length; i += batchSize) {
    const batch = pkgs.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (pkg) => {
        try {
          const version = execSync(`npm view ${pkg} version`, { encoding: 'utf-8' }).trim();
          res[pkg] = version;
        } catch (e) {
          res[pkg] = null;
          console.error(`[npm view error] ${pkg}: ${e.message}`);
        }
      }),
    );
  }
  return res;
}

async function getUpdateCandidates(packageManager = 'npm') {
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

export { getUpdateCandidates };
