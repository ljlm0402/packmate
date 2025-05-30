#!/usr/bin/env node

import { getUpdateCandidates } from '../src/update-checker.js';
import { runUnusedCheck } from '../src/unused-checker.js';
import { detectPackageManager } from '../src/detect-package-manager.js';
import { select, multiselect, isCancel, cancel, intro, outro, note } from '@clack/prompts';
import chalk from 'chalk'; // 🎨 컬러 메시지
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import semver from 'semver';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// 🔥 병렬 fetch(속도 개선)용 util
async function fetchAll(arr, cb) {
  return Promise.all(arr.map(cb));
}

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
    console.log(chalk.green(`패키지 삭제 완료: ${pkgList}`));
  } catch (e) {
    console.error(chalk.red(`패키지 삭제 실패: ${e.message}`));
  }
}

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
    console.log(chalk.green(`패키지 설치 완료: ${pkgList}`));
  } catch (e) {
    console.error(chalk.red(`패키지 설치 실패: ${e.message}`));
  }
}

// major별 최신 추천 + 인기 버전, 최신 버전 추천
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
  intro(chalk.cyan('📦 Packmate: 패키지 업데이트/정리'));

  const packageManager = detectPackageManager();
  const unused = await runUnusedCheck();
  const updateCandidates = await getUpdateCandidates(packageManager);
  const notInstalled = getNotInstalledPackages();
  const allPkgs = {};

  // 🌟 속도 개선: 병렬로 모든 패키지 버전 fetch!
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
    // major별 최신 추천
    const recommended = getRecommendedMajorVersions(c.versionList, c.currentVersion);
    // 최신 30개만
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
      status: '업데이트 가능',
      action: 'update'
    };
  }

  // 미사용/미설치/최신버전은 기존대로
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
      status: '미사용',
      action: 'remove'
    };
  });

  notInstalled.forEach(dep => {
    if (allPkgs[dep]) return;
    allPkgs[dep] = {
      name: dep,
      current: '-',
      latest: '-',
      status: '미설치',
      action: 'install'
    };
  });

  // 최신 버전
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
      status: '최신 버전',
      action: 'latest'
    };
  }

  // 🌈 컬러 표시 + disabled(최신버전)
  const promptChoices = Object.values(allPkgs).map(pkg => {
    let label = '';
    if (pkg.action === 'update') {
      label = `${chalk.bold(pkg.name)}  ${chalk.yellow(pkg.current)} ${chalk.white('→')} ${chalk.green(pkg.latest)}  ${chalk.blue('[업데이트 가능]')}`;
      return { label, value: `${pkg.name}__update` };
    }
    if (pkg.action === 'remove') {
      label = `${chalk.bold(pkg.name)}  ${chalk.red(pkg.current)}  ${chalk.red('[미사용]')}`;
      return { label, value: `${pkg.name}__remove` };
    }
    if (pkg.action === 'install') {
      label = `${chalk.bold(pkg.name)}  ${chalk.cyan('[미설치]')}`;
      return { label, value: `${pkg.name}__install` };
    }
    // 최신버전 (disabled)
    label = `${chalk.bold(pkg.name)}  ${chalk.green(pkg.current)}  ${chalk.gray('[최신 버전]')}`;
    return { label, value: `${pkg.name}__latest`, disabled: true };
  });

  const selected = await multiselect({
    message: '처리할 패키지를 선택하세요:',
    options: promptChoices,
    required: false,
    max: 30,
  });

  if (isCancel(selected)) {
    cancel(chalk.red('작업을 취소했습니다.'));
    process.exit(0);
  }

  // 업데이트 대상 중 버전 선택(추천 먼저, 나머지 차례로, 중복 제외)
  const updateTo = [];
  for (const sel of selected) {
    if (sel.endsWith('__update')) {
      const pkgName = sel.split('__')[0];
      const pkg = allPkgs[pkgName];
      const options = [
        ...pkg.versions.filter(v => v.isRecommended)
          .map(v => ({
            label: chalk.green(`${v.version} (${v.type}) [추천]`),
            value: v.version,
          })),
        ...pkg.versions.filter(v => !v.isRecommended)
          .map(v => ({
            label: `${v.version} (${v.type})`,
            value: v.version,
          })),
      ];
      // 중복 제거
      const optionsUnique = options.filter((item, idx, arr) =>
        arr.findIndex(o => o.value === item.value) === idx
      );
      let versionChoice;
      if (optionsUnique.length > 1) {
        versionChoice = await select({
          message: `${pkgName} 업데이트 버전을 선택하세요 (현재 ${pkg.current}):`,
          options: optionsUnique,
        });
        if (isCancel(versionChoice)) {
          cancel(chalk.red('작업을 취소했습니다.'));
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

  // 미사용 제거
  const toRemove = selected.filter(sel => sel.endsWith('__remove')).map(sel => sel.split('__')[0]);
  // 미설치 설치
  const toInstall = selected.filter(sel => sel.endsWith('__install')).map(sel => sel.split('__')[0]);

  // 실제 작업
  for (const item of updateTo) {
    let cmd;
    switch (packageManager) {
      case 'pnpm': cmd = `pnpm add ${item.name}@${item.version}`; break;
      case 'yarn': cmd = `yarn add ${item.name}@${item.version}`; break;
      case 'npm':
      default: cmd = `npm install ${item.name}@${item.version}`; break;
    }
    note(chalk.cyan(cmd), '실행 명령');
    try {
      execSync(cmd, { stdio: 'inherit' });
      note(chalk.green(`패키지 업데이트 완료: ${item.name}@${item.version}`), '성공');
    } catch (e) {
      note(chalk.red(`패키지 업데이트 실패: ${e.message}`), '실패');
    }
  }

  if (toRemove.length) {
    uninstallPackages(toRemove, packageManager);
  }
  if (toInstall.length) {
    installPackages(toInstall, packageManager);
  }

  if (updateTo.length + toRemove.length + toInstall.length === 0) {
    note(chalk.yellow('선택한 작업이 없습니다.'), '알림');
  }

  outro(chalk.bold.cyan('Packmate 완료! 🙌'));
}

main();
