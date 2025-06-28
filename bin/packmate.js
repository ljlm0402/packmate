#!/usr/bin/env node

import { select, multiselect, isCancel, cancel, intro, outro, note } from '@clack/prompts';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import semver from 'semver';
import { createRequire } from 'module';
import process from 'process';
import depcheck from 'depcheck';
import { getUpdateCandidates } from '../src/update-checker.js';
import { runUnusedCheck } from '../src/unused-checker.js';
import { detectPackageManager } from '../src/detect-package-manager.js';
import { installPackages, uninstallPackages } from '../src/install-helper.js';
import { runWithWarningCapture } from '../src/warning-capture.js';

const require = createRequire(import.meta.url);

// --- 버전 추출 ---
function getCurrentVersion(dep) {
  try {
    const mainPath = require.resolve(`${dep}/package.json`, { paths: [process.cwd()] });
    if (mainPath && fs.existsSync(mainPath)) {
      return JSON.parse(fs.readFileSync(mainPath, 'utf-8')).version;
    }
  } catch {}
  try {
    const pnpmDir = path.resolve(process.cwd(), 'node_modules', '.pnpm');
    if (fs.existsSync(pnpmDir)) {
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

// 메이저별 추천 버전 리스트
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

  // node_modules 체크
  const nodeModulesPath = path.resolve(process.cwd(), 'node_modules');
  if (!fs.existsSync(nodeModulesPath)) {
    note(
      chalk.yellow(
        '⚠️  The node_modules directory is missing. Please install your dependencies first (e.g., npm install, yarn install, or pnpm install).',
      ),
      'Warning',
    );
    process.exit(0);
  }
  const allPkgs = {};
  const packageManager = detectPackageManager();

  // 1. 업데이트 가능 패키지(최신버전만 조회, 전체버전x)
  const updateCandidates = await getUpdateCandidates(packageManager); // 최신 버전만 한 번에 빠르게
  updateCandidates.forEach((c) => {
    allPkgs[c.name] = {
      name: c.name,
      current: c.currentVersion,
      latest: c.latestVersion,
      versions: null, // 전체 버전은 아직 조회 X
      status: 'Update Available',
      action: 'update',
    };
  });

  // 2. 미사용 패키지(precinct + depcheck 병합)
  const unused_precinct = await runUnusedCheck(); // precinct(기존)

  // depcheck(깊은 탐지)
  const depcheckResult = await depcheck(process.cwd(), {});
  const unused_depcheck = depcheckResult.unusedDependencies || [];

  // 병합: 확신/의심 unused 구분
  const bothUnused = unused_precinct.filter((x) => unused_depcheck.includes(x));
  const onlyPrecinct = unused_precinct.filter((x) => !unused_depcheck.includes(x));
  const onlyDepcheck = unused_depcheck.filter((x) => !unused_precinct.includes(x));

  bothUnused.forEach((dep) => {
    if (allPkgs[dep]) return;
    allPkgs[dep] = {
      name: dep,
      current: getCurrentVersion(dep),
      latest: '-',
      status: 'Unused (Strongly)',
      action: 'remove',
      confidence: 'high',
    };
  });
  onlyPrecinct.forEach((dep) => {
    if (allPkgs[dep]) return;
    allPkgs[dep] = {
      name: dep,
      current: getCurrentVersion(dep),
      latest: '-',
      status: 'Unused (Precinct only)',
      action: 'remove',
      confidence: 'medium',
      hint: 'precinct 방식에서만 감지됨',
    };
  });
  onlyDepcheck.forEach((dep) => {
    if (allPkgs[dep]) return;
    allPkgs[dep] = {
      name: dep,
      current: getCurrentVersion(dep),
      latest: '-',
      status: 'Unused (Depcheck only)',
      action: 'remove',
      confidence: 'medium',
      hint: 'depcheck 방식에서만 감지됨',
    };
  });

  // 3. 미설치 패키지
  const notInstalled = getNotInstalledPackages();
  notInstalled.forEach((dep) => {
    if (allPkgs[dep]) return;
    allPkgs[dep] = {
      name: dep,
      current: '-',
      latest: '-',
      status: 'Not Installed',
      action: 'install',
    };
  });

  // 4. 이미 최신 패키지
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

  // action 우선순위에 맞게 정렬
  const ACTION_ORDER = ['update', 'remove', 'install', 'latest'];
  const pkgsSorted = Object.values(allPkgs).sort((a, b) => {
    const aIdx = ACTION_ORDER.indexOf(a.action);
    const bIdx = ACTION_ORDER.indexOf(b.action);
    return aIdx - bIdx;
  });

  // ---- 프롬프트: 유저 선택 ----
  const promptChoices = pkgsSorted.map((pkg) => {
    switch (pkg.action) {
      case 'install':
        return {
          label: `${chalk.bold(pkg.name)}  ${chalk.cyan('[Not Installed]')}`,
          value: `${pkg.name}__install`,
        };
      case 'update':
        return {
          label: `${chalk.bold(pkg.name)}  ${chalk.yellow(pkg.current)} ${chalk.white('→')} ${chalk.green(pkg.latest)}  ${chalk.blue('[Update Available]')}`,
          value: `${pkg.name}__update`,
        };
      case 'remove':
        if (pkg.confidence === 'high') {
          return {
            label: `${chalk.red(pkg.name)}  ${chalk.red(pkg.current)}  ${chalk.bgRedBright('[Strongly Unused]')}`,
            value: `${pkg.name}__remove`,
            checked: true,
          };
        } else {
          return {
            label: `${chalk.yellow(pkg.name)}  ${chalk.yellow(pkg.current)}  ${chalk.bgYellowBright('[Warning: Unused only by ' + (pkg.hint?.includes('precinct') ? 'Precinct' : 'Depcheck') + ']')}`,
            value: `${pkg.name}__remove`,
            hint: chalk.yellow(pkg.hint),
            checked: false,
          };
        }
      case 'latest':
      default:
        return {
          label: `${chalk.bold(pkg.name)}  ${chalk.green(pkg.current)}  ${chalk.gray('[Latest]')}`,
          value: `${pkg.name}__latest`,
          disabled: true,
        };
    }
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

  if (
    selected.some((sel) =>
      [...onlyPrecinct, ...onlyDepcheck].map((dep) => `${dep}__remove`).includes(sel),
    )
  ) {
    note(
      chalk.yellow(
        '⚠️  한 쪽 방식에서만 unused로 감지된 패키지는, 빌드 도구/테스트/특수 환경에서 사용될 수 있으니 제거 전 주의하세요!',
      ),
      'Warning',
    );
  }

  const updateTo = [];
  for (const sel of selected) {
    if (sel.endsWith('__update')) {
      const pkgName = sel.split('__')[0];
      const pkg = allPkgs[pkgName];
      // 이 시점에만 전체 버전 쿼리!
      let versionList = [];
      try {
        const out = execSync(`npm view ${pkgName} versions --json`, { encoding: 'utf-8' });
        versionList = JSON.parse(out).reverse();
      } catch {
        versionList = [pkg.latest];
      }
      const recommended = getRecommendedMajorVersions(versionList, pkg.current);
      const options = [
        ...versionList
          .filter((v) => recommended.includes(v))
          .map((v) => ({
            label: chalk.green(`${v} [recommended]`),
            value: v,
          })),
        ...versionList
          .filter((v) => !recommended.includes(v))
          .map((v) => ({
            label: `${v}`,
            value: v,
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

  // 요약 출력 (unused 분포 등)
  note(
    chalk.gray(
      `Unused packages (both: ${bothUnused.length}, precinct only: ${onlyPrecinct.length}, depcheck only: ${onlyDepcheck.length})`,
    ),
    'Summary',
  );

  outro(chalk.bold.cyan('Packmate done! 🙌'));
}

main();
