#!/usr/bin/env node

import { getUpdateCandidates } from '../src/update-checker.js';
import { runUnusedCheck } from '../src/unused-checker.js';
import { detectPackageManager } from '../src/detect-package-manager.js';
import { select, multiselect, isCancel, cancel, intro, outro, note } from '@clack/prompts';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import semver from 'semver';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

/**
 * 배열의 모든 항목을 비동기로 병렬 처리하여 결과를 반환합니다. (속도 개선용)
 */
async function fetchAll(arr, cb) {
  return Promise.all(arr.map(cb));
}

/**
 * package.json에 선언된 의존성 중 설치되지 않은 패키지를 찾아서 반환합니다.
 */
function getNotInstalledPackages() {
  const pkgPath = path.resolve(process.cwd(), 'package.json');
  if (!fs.existsSync(pkgPath)) return [];
  const pkgJson = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  const allDeps = { ...pkgJson.dependencies, ...pkgJson.devDependencies };
  const notInstalled = [];
  for (const dep of Object.keys(allDeps)) {
    try {
      require.resolve(dep, { paths: [process.cwd()] });
    } catch (e) {
      notInstalled.push(dep);
    }
  }
  return notInstalled;
}

/**
 * 지정한 패키지들을 패키지 매니저를 사용해 제거합니다.
 */
function uninstallPackages(packages, packageManager) {
  if (packages.length === 0) return;
  let uninstallCmd;
  switch (packageManager) {
    case 'pnpm': uninstallCmd = 'pnpm remove'; break;
    case 'yarn': uninstallCmd = 'yarn remove'; break;
    case 'npm':
    default: uninstallCmd = 'npm uninstall'; break;
  }
  const pkgList = packages.join(' ');
  console.log(chalk.yellow(`> ${uninstallCmd} ${pkgList}`));
  try {
    execSync(`${uninstallCmd} ${pkgList}`, { stdio: 'inherit' });
    console.log(chalk.green(`Package removal completed: ${pkgList}`));
  } catch (e) {
    console.error(chalk.red(`Package removal failed: ${e.message}`));
  }
}

/**
 * 지정한 패키지들을 패키지 매니저를 사용해 설치합니다.
 */
function installPackages(packages, packageManager) {
  if (packages.length === 0) return;
  let installCmd;
  switch (packageManager) {
    case 'pnpm': installCmd = 'pnpm add'; break;
    case 'yarn': installCmd = 'yarn add'; break;
    case 'npm':
    default: installCmd = 'npm install'; break;
  }
  const pkgList = packages.map(pkg => `${pkg}@latest`).join(' ');
  console.log(chalk.yellow(`> ${installCmd} ${pkgList}`));
  try {
    execSync(`${installCmd} ${pkgList}`, { stdio: 'inherit' });
    console.log(chalk.green(`Package install completed: ${pkgList}`));
  } catch (e) {
    console.error(chalk.red(`Package install failed: ${e.message}`));
  }
}

/**
 * 버전 리스트에서 major별로 최신 버전을 추출하여 추천 목록을 만듭니다.
 */
function getRecommendedMajorVersions(versionList, currentVersion) {
  const byMajor = {};
  versionList.forEach(ver => {
    const parsed = semver.parse(ver);
    if (!parsed) return;
    const major = parsed.major;
    if (!byMajor[major] || semver.gt(ver, byMajor[major])) {
      byMajor[major] = ver;
    }
  });
  const recommended = Object.values(byMajor).sort((a, b) => semver.rcompare(a, b));
  return recommended;
}

async function main() {
  intro(chalk.cyan('📦 Packmate: Dependency Updates & Cleanup'));

  const packageManager = detectPackageManager();
  const unused = await runUnusedCheck();
  const updateCandidates = await getUpdateCandidates(packageManager);
  const notInstalled = getNotInstalledPackages();
  const allPkgs = {};

  // 업데이트가 필요한 모든 패키지들의 버전 목록을 병렬로 조회합니다.
  const updatePkgVersionLists = await fetchAll(updateCandidates, async c => {
    let versionList = [];
    try {
      const out = execSync(`npm view ${c.name} versions --json`, { encoding: 'utf-8' });
      versionList = JSON.parse(out);
    } catch {
      versionList = [c.latestVersion];
    }
    versionList.reverse();
    return { ...c, versionList };
  });

  for (const c of updatePkgVersionLists) {
    // major별 최신 버전 추천
    const recommended = getRecommendedMajorVersions(c.versionList, c.currentVersion);
    const versions = c.versionList.slice(0, 30).map(ver => ({
      version: ver,
      type: semver.diff(c.currentVersion, ver) || 'major',
      isRecommended: recommended.includes(ver)
    }));

    allPkgs[c.name] = {
      name: c.name,
      current: c.currentVersion,
      latest: c.latestVersion,
      versions,
      status: 'Update Available',
      action: 'update'
    };
  }

  // 사용되지 않는 패키지 정보 추가
  unused.forEach(dep => {
    if (allPkgs[dep]) return;
    let current = '-';
    try {
      const pkgJsonPath = require.resolve(`${dep}/package.json`);
      const content = fs.readFileSync(pkgJsonPath, 'utf-8');
      current = JSON.parse(content).version;
    } catch {}
    allPkgs[dep] = {
      name: dep,
      current,
      latest: '-',
      status: 'Unused',
      action: 'remove'
    };
  });

  // 미설치 패키지 정보 추가
  notInstalled.forEach(dep => {
    if (allPkgs[dep]) return;
    allPkgs[dep] = {
      name: dep,
      current: '-',
      latest: '-',
      status: 'Not Installed',
      action: 'install'
    };
  });

  // 이미 최신 버전인 패키지 정보 추가
  const pkgJson = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf-8'));
  const declared = { ...pkgJson.dependencies, ...pkgJson.devDependencies };
  for (const dep of Object.keys(declared)) {
    if (allPkgs[dep]) continue;
    let current = '-';
    try {
      const pkgJsonPath = require.resolve(`${dep}/package.json`);
      const content = fs.readFileSync(pkgJsonPath, 'utf-8');
      current = JSON.parse(content).version;
    } catch {}
    allPkgs[dep] = {
      name: dep,
      current,
      latest: current,
      status: 'Latest',
      action: 'latest'
    };
  }

  // 유저에게 선택 프롬프트 표시(업데이트, 미사용, 미설치만 선택 가능, 최신버전은 disabled)
  const promptChoices = Object.values(allPkgs).map(pkg => {
    let label = '';
    if (pkg.action === 'update') {
      label = `${chalk.bold(pkg.name)}  ${chalk.yellow(pkg.current)} ${chalk.white('→')} ${chalk.green(pkg.latest)}  ${chalk.blue('[Update Available]')}`;
      return { label, value: `${pkg.name}__update` };
    }
    if (pkg.action === 'remove') {
      label = `${chalk.bold(pkg.name)}  ${chalk.red(pkg.current)}  ${chalk.red('[Unused]')}`;
      return { label, value: `${pkg.name}__remove` };
    }
    if (pkg.action === 'install') {
      label = `${chalk.bold(pkg.name)}  ${chalk.cyan('[Not Installed]')}`;
      return { label, value: `${pkg.name}__install` };
    }
    label = `${chalk.bold(pkg.name)}  ${chalk.green(pkg.current)}  ${chalk.gray('[Latest]')}`;
    return { label, value: `${pkg.name}__latest`, disabled: true };
  });

  const selected = await multiselect({
    message: 'Select the packages you want to update/remove/install:',
    options: promptChoices,
    required: false,
    max: 30,
  });

  if (isCancel(selected)) {
    cancel(chalk.red('Operation cancelled.'));
    process.exit(0);
  }

  // 업데이트 대상 패키지는 추천 버전(major별 최신) 먼저, 나머지는 순차적으로 보여주고 선택
  const updateTo = [];
  for (const sel of selected) {
    if (sel.endsWith('__update')) {
      const pkgName = sel.split('__')[0];
      const pkg = allPkgs[pkgName];
      const options = [
        ...pkg.versions.filter(v => v.isRecommended)
          .map(v => ({
            label: chalk.green(`${v.version} (${v.type}) [recommended]`),
            value: v.version,
          })),
        ...pkg.versions.filter(v => !v.isRecommended)
          .map(v => ({
            label: `${v.version} (${v.type})`,
            value: v.version,
          })),
      ];
      const optionsUnique = options.filter((item, idx, arr) =>
        arr.findIndex(o => o.value === item.value) === idx
      );
      let versionChoice;
      if (optionsUnique.length > 1) {
        versionChoice = await select({
          message: `${pkgName} - choose a version to update (current: ${pkg.current}):`,
          options: optionsUnique,
        });
        if (isCancel(versionChoice)) {
          cancel(chalk.red('Operation cancelled.'));
          process.exit(0);
        }
        updateTo.push({ name: pkgName, version: versionChoice });
      } else if (optionsUnique.length === 1) {
        updateTo.push({ name: pkgName, version: optionsUnique[0].value });
      } else {
        updateTo.push({ name: pkgName, version: pkg.latest });
      }
    }
  }

  // 제거/설치할 패키지 목록 분리
  const toRemove = selected.filter(sel => sel.endsWith('__remove')).map(sel => sel.split('__')[0]);
  const toInstall = selected.filter(sel => sel.endsWith('__install')).map(sel => sel.split('__')[0]);

  // 실제 업데이트/제거/설치 명령 실행
  for (const item of updateTo) {
    let cmd;
    switch (packageManager) {
      case 'pnpm': cmd = `pnpm add ${item.name}@${item.version}`; break;
      case 'yarn': cmd = `yarn add ${item.name}@${item.version}`; break;
      case 'npm':
      default: cmd = `npm install ${item.name}@${item.version}`; break;
    }
    note(chalk.cyan(cmd), 'Command');
    try {
      execSync(cmd, { stdio: 'inherit' });
      note(chalk.green(`✔️ Package update completed: ${item.name}@${item.version}`), 'Success');
    } catch (e) {
      note(chalk.red(`❌ Package update failed: ${e.message}`), 'Failed');
    }
  }

  if (toRemove.length) {
    uninstallPackages(toRemove, packageManager);
  }
  if (toInstall.length) {
    installPackages(toInstall, packageManager);
  }

  if (updateTo.length + toRemove.length + toInstall.length === 0) {
    note(chalk.yellow('No operations selected.'), 'Info');
  }

  outro(chalk.bold.cyan('Packmate done! 🙌'));
}

main();
