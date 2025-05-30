import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import semver from 'semver';

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
  if (packageManager === 'npm' && fs.existsSync(lockPaths.npm)) {
    return JSON.parse(fs.readFileSync(lockPaths.npm, 'utf-8'));
  }
  // TODO: pnpm/yarn lock 파싱 추가 가능
  return null;
}

function getInstalledVersion(pkgName, lockJson, pkgJson) {
  // 1. lock 파일에서 버전 가져오기
  if (lockJson?.dependencies?.[pkgName]) {
    return lockJson.dependencies[pkgName].version;
  }

  // 2. node_modules/<pkgName>/package.json 에서 버전 직접 가져오기 시도
  try {
    const pkgModulePath = path.resolve(nodeModulesPath, pkgName, 'package.json');
    if (fs.existsSync(pkgModulePath)) {
      const modPkg = JSON.parse(fs.readFileSync(pkgModulePath, 'utf-8'));
      if (modPkg.version) return modPkg.version;
    }
  } catch {}

  // 3. package.json 의존성 버전 리턴 (대부분 range 형태)
  return pkgJson.dependencies?.[pkgName] || pkgJson.devDependencies?.[pkgName] || null;
}

async function getLatestVersion(pkgName, cache = {}) {
  if (cache[pkgName]) return cache[pkgName];
  try {
    const version = execSync(`npm view ${pkgName} version`, { encoding: 'utf-8' }).trim();
    cache[pkgName] = version;
    return version;
  } catch {
    return null;
  }
}

/**
 * 업데이트 후보 리스트 반환 (비동기)
 * @param {string} packageManager
 * @returns {Promise<Array>}
 */
async function getUpdateCandidates(packageManager = 'npm') {
  const pkgJson = getPkgJson();
  const lockJson = getLockJson(packageManager);

  const deps = { ...pkgJson.dependencies, ...pkgJson.devDependencies };
  const candidates = [];
  const latestCache = {};

  for (const pkgName of Object.keys(deps)) {
    const currentVersion = getInstalledVersion(pkgName, lockJson, pkgJson);
    if (!currentVersion || !semver.valid(semver.coerce(currentVersion))) continue;

    const latestVersion = await getLatestVersion(pkgName, latestCache);
    if (!latestVersion || !semver.valid(latestVersion)) continue;

    // semver.coerce로 범용 버전 비교 (예: ^1.2.3)
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

/**
 * 패키지 업데이트 실행
 * @param {Array} pkgNames
 * @param {string} packageManager
 */
async function updatePackages(pkgNames, packageManager = 'npm') {
  if (pkgNames.length === 0) return;

  let installCmd;
  switch (packageManager) {
    case 'pnpm':
      installCmd = 'pnpm add';
      break;
    case 'yarn':
      installCmd = 'yarn add';
      break;
    case 'npm':
    default:
      installCmd = 'npm install';
      break;
  }

  const pkgList = pkgNames.map(name => `${name}@latest`).join(' ');
  console.log(`> ${installCmd} ${pkgList}`);

  try {
    execSync(`${installCmd} ${pkgList}`, { stdio: 'inherit' });
    console.log(`패키지 업데이트 완료: ${pkgList}`);
  } catch (e) {
    console.error(`패키지 업데이트 실패: ${e.message}`);
  }
}

export { getUpdateCandidates, updatePackages };
