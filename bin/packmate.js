#!/usr/bin/env node

import { select, multiselect, isCancel, cancel, intro, outro, note } from '@clack/prompts';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import semver from 'semver';
import { createRequire } from 'module';
import process from 'process';
import pLimit from 'p-limit';
import { getUpdateCandidates } from '../src/update-checker.js';
import { runUnusedCheck } from '../src/unused-checker.js';
import { detectPackageManager } from '../src/detect-package-manager.js';
import { installPackages, uninstallPackages } from '../src/install-helper.js';
import { runWithWarningCapture } from '../src/warning-capture.js';

const require = createRequire(import.meta.url);

// 🚩 버전 추출: npm/yarn/pnpm 구조 모두 대응!
function getCurrentVersion(dep) {
  // 1. npm/yarn 방식
  try {
    const mainPath = require.resolve(`${dep}/package.json`, { paths: [process.cwd()] });
    if (mainPath && fs.existsSync(mainPath)) {
      return JSON.parse(fs.readFileSync(mainPath, 'utf-8')).version;
    }
  } catch {}
  // 2. pnpm 하드링크 구조
  try {
    const pnpmDir = path.resolve(process.cwd(), 'node_modules', '.pnpm');
    if (fs.existsSync(pnpmDir)) {
      // ex: "chalk@5.4.1"
      const found = fs.readdirSync(pnpmDir).find((f) => f.startsWith(dep + '@'));
      if (found) {
        const pkgPath = path.resolve(pnpmDir, found, 'node_modules', dep, 'package.json');
        if (fs.existsSync(pkgPath)) {
          return JSON.parse(fs.readFileSync(pkgPath, 'utf-8')).version;
        }
      }
    }
  } catch {}
  return '-';
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
    const version = getCurrentVersion(dep);
    if (!version || version === '-') notInstalled.push(dep);
  }

  return notInstalled;
}

/**
 * 버전 리스트에서 major별로 최신 버전을 추출하여 추천 목록을 만듭니다.
 */
function getRecommendedMajorVersions(versionList) {
  const byMajor = {};
  versionList.forEach((ver) => {
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

  // (1) node_modules 체크 및 가이드 메시지
  const nodeModulesPath = path.resolve(process.cwd(), 'node_modules');
  let nodeModulesExists = fs.existsSync(nodeModulesPath);

  if (!nodeModulesExists) {
    note(
      chalk.yellow(
        '⚠️  The node_modules directory is missing. Please install your dependencies first (e.g., npm install, yarn install, or pnpm install).',
      ),
      'Warning',
    );
    process.exit(0);
  }

  const packageManager = detectPackageManager();
  const unused = await runUnusedCheck();
  const updateCandidates = await getUpdateCandidates(packageManager);
  const notInstalled = getNotInstalledPackages();
  const allPkgs = {};

  // 업데이트가 필요한 모든 패키지들의 버전 목록을 병렬로 조회합니다.
  const limit = pLimit(5); // 동시에 5개만 실행

  const updatePkgVersionLists = await Promise.all(
    updateCandidates.map((c) =>
      limit(async () => {
        let versionList = [];
        try {
          const out = execSync(`npm view ${c.name} versions --json`, { encoding: 'utf-8' });
          versionList = JSON.parse(out);
        } catch {
          versionList = [c.latestVersion];
        }
        versionList.reverse();
        return { ...c, versionList };
      }),
    ),
  );

  for (const c of updatePkgVersionLists) {
    // major별 최신 버전 추천
    const recommended = getRecommendedMajorVersions(c.versionList, c.currentVersion);
    const versions = c.versionList.slice(0, 30).map((ver) => ({
      version: ver,
      type: semver.diff(c.currentVersion, ver) || 'major',
      isRecommended: recommended.includes(ver),
    }));

    allPkgs[c.name] = {
      name: c.name,
      current: c.currentVersion,
      latest: c.latestVersion,
      versions,
      status: 'Update Available',
      action: 'update',
    };
  }

  // 사용되지 않는 패키지 정보 추가
  unused.forEach((dep) => {
    if (allPkgs[dep]) return;
    const current = getCurrentVersion(dep);
    allPkgs[dep] = {
      name: dep,
      current,
      latest: '-',
      status: 'Unused',
      action: 'remove',
    };
  });

  // (2) 미설치 패키지 정보 추가 (상태 세분화)
  notInstalled.forEach((dep) => {
    if (allPkgs[dep]) return;

    let lockJson;
    try {
      if (packageManager === 'npm') {
        lockJson = JSON.parse(
          fs.readFileSync(path.resolve(process.cwd(), 'package-lock.json'), 'utf-8'),
        );
      }
      // pnpm/yarn lock 파싱 필요하면 여기에
    } catch {
      lockJson = null;
    }

    let status = 'Not Installed';
    let version = '-';

    if (!nodeModulesExists) {
      // node_modules 자체가 없음
      if (lockJson && lockJson.dependencies && lockJson.dependencies[dep]) {
        status = 'Declared but Not Installed';
        version = lockJson.dependencies[dep].version || '-';
      } else {
        status = 'Not Installed';
      }
    } else {
      // node_modules가 있으나 해당 패키지가 없음
      if (lockJson && lockJson.dependencies && lockJson.dependencies[dep]) {
        status = 'Declared but Not Installed';
        version = lockJson.dependencies[dep].version || '-';
      } else {
        status = 'Not Installed';
      }
    }

    allPkgs[dep] = {
      name: dep,
      current: version,
      latest: '-',
      status,
      action: 'install',
    };
  });

  // 이미 최신 버전인 패키지 정보 추가
  const pkgJson = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf-8'));
  const declared = { ...pkgJson.dependencies, ...pkgJson.devDependencies };
  for (const dep of Object.keys(declared)) {
    if (allPkgs[dep]) continue;
    const current = getCurrentVersion(dep);
    allPkgs[dep] = {
      name: dep,
      current,
      latest: current,
      status: 'Latest',
      action: 'latest',
    };
  }

  // 유저에게 선택 프롬프트 표시(업데이트, 미사용, 미설치만 선택 가능, 최신버전은 disabled)
  const promptChoices = Object.values(allPkgs).map((pkg) => {
    let label = '';
    if (pkg.action === 'install') {
      label = `${chalk.bold(pkg.name)}  `;
      if (pkg.status === 'Declared but Not Installed') {
        label += chalk.magenta('[Declared but Not Installed]');
      } else if (pkg.status === 'Not Installed') {
        label += chalk.cyan('[Not Installed]');
      }
      return { label, value: `${pkg.name}__install` };
    }

    if (pkg.action === 'update') {
      label = `${chalk.bold(pkg.name)}  ${chalk.yellow(pkg.current)} ${chalk.white('→')} ${chalk.green(pkg.latest)}  ${chalk.blue('[Update Available]')}`;
      return { label, value: `${pkg.name}__update` };
    }

    if (pkg.action === 'remove') {
      label = `${chalk.bold(pkg.name)}  ${chalk.red(pkg.current)}  ${chalk.red('[Unused]')}`;
      return { label, value: `${pkg.name}__remove` };
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
        ...pkg.versions
          .filter((v) => v.isRecommended)
          .map((v) => ({
            label: chalk.green(`${v.version} (${v.type}) [recommended]`),
            value: v.version,
          })),
        ...pkg.versions
          .filter((v) => !v.isRecommended)
          .map((v) => ({
            label: `${v.version} (${v.type})`,
            value: v.version,
          })),
      ];
      const optionsUnique = options.filter(
        (item, idx, arr) => arr.findIndex((o) => o.value === item.value) === idx,
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
  const toRemove = selected
    .filter((sel) => sel.endsWith('__remove'))
    .map((sel) => sel.split('__')[0]);
  const toInstall = selected
    .filter((sel) => sel.endsWith('__install'))
    .map((sel) => sel.split('__')[0]);

  // 실제 업데이트/제거/설치 명령 실행(경고 메시지 실시간 캡처)
  for (const item of updateTo) {
    let cmd, args;
    switch (packageManager) {
      case 'pnpm':
        cmd = 'pnpm';
        args = ['add', `${item.name}@${item.version}`];
        break;
      case 'yarn':
        cmd = 'yarn';
        args = ['add', `${item.name}@${item.version}`];
        break;
      case 'npm':
      default:
        cmd = 'npm';
        args = ['install', `${item.name}@${item.version}`];
        break;
    }
    note(chalk.cyan(`${cmd} ${args.join(' ')}`), 'Command');
    const { code, warnings } = await runWithWarningCapture(cmd, args);
    if (code === 0) {
      note(chalk.green(`✔️ Package update completed: ${item.name}@${item.version}`), 'Success');
    } else {
      note(chalk.red(`❌ Package update failed: ${item.name}@${item.version}`), 'Failed');
    }
    if (warnings.length) {
      note(
        chalk.yellow(
          `⚠️  Detected warnings during install/update of ${item.name}:\n` +
            warnings.map((w) => '  - ' + w).join('\n'),
        ),
        'Warning',
      );
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
