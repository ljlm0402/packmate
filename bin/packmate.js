#!/usr/bin/env node

/*****************************************************************
 * Packmate - Simple dependency update & unused checker
 * (c) 2025-present AGUMON (https://github.com/ljlm0402/packmate)
 *
 * This source code is licensed under the MIT license.
 * See the LICENSE file in the project root for more information.
 *
 * Made with ❤️ by AGUMON 🦖
 *****************************************************************/

import { intro, outro, note, spinner } from '@clack/prompts';
import chalk from 'chalk';
import depcheck from 'depcheck';
import fs from 'fs';
import { createRequire } from 'module';
import path from 'path';
import process from 'process';
import { getUpdateCandidates } from '../src/update-checker.js';
import { runUnusedCheck } from '../src/unused-checker.js';
import { detectPackageManager } from '../src/detect-package-manager.js';
import { installPackages, uninstallPackages } from '../src/install-helper.js';
import { runWithWarningCapture } from '../src/warning-capture.js';
import { loadConfig } from '../src/config-loader.js';
import {
  updateAvailableSession,
  unusedSession,
  notInstalledSession,
  latestSession,
} from '../src/ui-sessions.js';

const require = createRequire(import.meta.url);

/**
 * 설치된 패키지의 현재 버전을 가져옵니다
 */
function getCurrentVersion(dep) {
  // 방법 1: 표준 node_modules 위치 확인 (npm, yarn, pnpm의 node-linker=hoisted에서 작동)
  try {
    const pkgPath = path.resolve(process.cwd(), 'node_modules', dep, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      return pkg.version;
    }
  } catch (err) {
    // 다음 방법으로 계속
  }

  // 방법 2: pnpm의 .pnpm 디렉토리 확인 (node-linker=isolated인 pnpm용)
  try {
    const pnpmDir = path.resolve(process.cwd(), 'node_modules', '.pnpm');
    if (fs.existsSync(pnpmDir)) {
      const entries = fs.readdirSync(pnpmDir);
      // @clack/prompts 같은 스코프 패키지 처리
      const depName = dep.replace('/', '+');
      const found = entries.find((f) => f.startsWith(depName + '@'));
      if (found) {
        const pkgPath = path.resolve(pnpmDir, found, 'node_modules', dep, 'package.json');
        if (fs.existsSync(pkgPath)) {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
          return pkg.version;
        }
      }
    }
  } catch (err) {
    // 다음 방법으로 계속
  }

  // 방법 3: require.resolve 시도 (일부 ESM 시나리오에서는 작동하지 않을 수 있음)
  try {
    const mainPath = require.resolve(`${dep}/package.json`, { paths: [process.cwd()] });
    if (mainPath && fs.existsSync(mainPath)) {
      const pkg = JSON.parse(fs.readFileSync(mainPath, 'utf-8'));
      return pkg.version;
    }
  } catch (err) {
    // 패키지를 찾을 수 없음
  }

  return null;
}

/**
 * 선언되었지만 설치되지 않은 패키지 목록을 가져옵니다
 */
function getNotInstalledPackages() {
  const pkgPath = path.resolve(process.cwd(), 'package.json');
  if (!fs.existsSync(pkgPath)) return [];

  const pkgJson = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  const allDeps = { ...pkgJson.dependencies, ...pkgJson.devDependencies };
  const notInstalled = [];

  for (const dep of Object.keys(allDeps)) {
    const version = getCurrentVersion(dep);
    if (!version) {  // null은 찾을 수 없음을 의미
      notInstalled.push(dep);
    }
  }

  return notInstalled;
}

async function main() {
  intro(chalk.cyan('📦 Packmate: Dependency Updates & Cleanup'));

  // 설정 로드
  const config = loadConfig();

  // node_modules 확인
  const nodeModulesPath = path.resolve(process.cwd(), 'node_modules');
  if (!fs.existsSync(nodeModulesPath)) {
    note(
      chalk.yellow(
        '⚠️  The node_modules directory is missing. Please install dependencies first (npm/yarn/pnpm install).',
      ),
      'Warning',
    );
    process.exit(0);
  }

  const packageManager = detectPackageManager();
  note(chalk.dim(`Package Manager: ${packageManager}`), 'Info');

  const s = spinner();

  // 1. 미사용 패키지 먼저 분석 (업데이트 필터링용)
  s.start('Analyzing unused packages...');
  const unused_precinct = await runUnusedCheck({ withUsedList: true });

  // depcheck로 교차 검증
  const depcheckResult = await depcheck(process.cwd(), {});
  const unused_depcheck = depcheckResult.dependencies || [];
  s.stop('✅ Unused package analysis complete');

  // 신뢰도별 분류
  const bothUnused = unused_precinct.unused.filter((x) => unused_depcheck.includes(x));
  const onlyPrecinct = unused_precinct.unused.filter((x) => !unused_depcheck.includes(x));
  const onlyDepcheck = unused_depcheck.filter((x) => !unused_precinct.unused.includes(x));

  // 필터링을 위한 모든 미사용 패키지 이름 가져오기
  const allUnusedNames = [...bothUnused, ...onlyPrecinct, ...onlyDepcheck];

  // 2. 업데이트 가능한 패키지 분석 (미사용 패키지 제외)
  s.start('Checking for available updates...');
  const allUpdateCandidates = await getUpdateCandidates(packageManager);

  // 업데이트 후보에서 미사용 패키지 필터링
  const updateCandidates = allUpdateCandidates.filter(
    (candidate) => !allUnusedNames.includes(candidate.name)
  );
  s.stop(`✅ Found ${updateCandidates.length} packages with available updates`);

  const unusedPackages = [
    ...bothUnused.map((dep) => ({
      name: dep,
      current: getCurrentVersion(dep),
      confidence: 'high',
      hint: 'Detected by both precinct and depcheck',
    })),
    ...onlyPrecinct.map((dep) => ({
      name: dep,
      current: getCurrentVersion(dep),
      confidence: 'medium',
      hint: 'Detected by precinct only',
    })),
    ...onlyDepcheck.map((dep) => ({
      name: dep,
      current: getCurrentVersion(dep),
      confidence: 'medium',
      hint: 'Detected by depcheck only',
    })),
  ];

  // 3. 미설치 패키지 확인
  s.start('Checking for not installed packages...');
  const notInstalled = getNotInstalledPackages();
  s.stop(`✅ Found ${notInstalled.length} not installed packages`);

  const notInstalledPackages = notInstalled.map((dep) => ({
    name: dep,
    current: '-',
    latest: '-',
  }));

  // 4. 최신 버전 패키지
  const pkgJson = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf-8'));
  const declared = { ...pkgJson.dependencies, ...pkgJson.devDependencies };
  const latestPackages = [];

  for (const dep of Object.keys(declared)) {
    const isUpdatable = updateCandidates.some((c) => c.name === dep);
    const isUnused = unusedPackages.some((u) => u.name === dep);
    const isNotInstalled = notInstalledPackages.some((n) => n.name === dep);

    if (!isUpdatable && !isUnused && !isNotInstalled) {
      const current = getCurrentVersion(dep);
      if (current && current !== '-') {
        latestPackages.push({
          name: dep,
          current,
          latest: current,
        });
      }
    }
  }

  // === 분석 결과 요약 ===
  // console.log를 사용하여 더 나은 포맷팅
  console.log('\n' + chalk.cyan.bold('📊 Analysis Results:'));
  console.log(chalk.cyan(`   Updates available: ${updateCandidates.length}`));
  console.log(chalk.cyan(`   Unused:            ${unusedPackages.length}`));
  console.log(chalk.cyan(`   Not installed:     ${notInstalledPackages.length}`));
  console.log(chalk.cyan(`   Up-to-date:        ${latestPackages.length}`));

  const selectedActions = [];

  // === 그룹별 UI 세션 실행 ===
  if (config.ui?.groupSessions) {
    // 1. 업데이트 가능 세션
    if (updateCandidates.length > 0) {
      const updateSelected = await updateAvailableSession(updateCandidates, config);
      selectedActions.push(...updateSelected);
    }

    // 2. 미사용 패키지 세션
    if (unusedPackages.length > 0) {
      const unusedSelected = await unusedSession(unusedPackages, config);
      selectedActions.push(...unusedSelected);
    }

    // 3. 미설치 패키지 세션
    if (notInstalledPackages.length > 0) {
      const notInstalledSelected = await notInstalledSession(notInstalledPackages, config);
      selectedActions.push(...notInstalledSelected);
    }

    // 4. 최신 버전 패키지 세션 (선택 사항)
    if (latestPackages.length > 0) {
      await latestSession(latestPackages, config);
    }
  } else {
    note(
      chalk.yellow('⚠️  groupSessions is disabled in config. Refer to packmate.js.backup for legacy mode.'),
      'Info',
    );
  }

  // === 작업 실행 ===
  if (selectedActions.length === 0) {
    note(chalk.yellow('No actions selected.'), 'Info');
    outro(chalk.bold.cyan('Packmate complete! 👋'));
    return;
  }

  note(
    chalk.cyan(
      `\n📝 Actions to execute:\n${selectedActions.map((a) => `  - ${a.action}: ${a.name}${a.latestVersion ? '@' + a.latestVersion : ''}`).join('\n')}`,
    ),
    'Actions',
  );

  // 업데이트 실행
  const toUpdate = selectedActions.filter((a) => a.action === 'update');
  for (const item of toUpdate) {
    let cmd, args;
    switch (packageManager) {
      case 'pnpm':
        cmd = 'pnpm';
        args = ['add', `${item.name}@${item.latestVersion}`];
        break;
      case 'yarn':
        cmd = 'yarn';
        args = ['add', `${item.name}@${item.latestVersion}`];
        break;
      case 'npm':
      default:
        cmd = 'npm';
        args = ['install', `${item.name}@${item.latestVersion}`];
        break;
    }

    note(chalk.cyan(`${cmd} ${args.join(' ')}`), 'Command');
    const { code, warnings } = await runWithWarningCapture(cmd, args);

    if (code === 0) {
      note(chalk.green(`✔️  Update complete: ${item.name}@${item.latestVersion}`), 'Success');
    } else {
      note(chalk.red(`❌ Update failed: ${item.name}@${item.latestVersion}`), 'Failed');
    }

    if (warnings.length) {
      note(chalk.yellow(`⚠️  Warnings:\n${warnings.map((w) => '  - ' + w).join('\n')}`), 'Warning');
    }
  }

  // 제거 실행
  const toRemove = selectedActions.filter((a) => a.action === 'remove').map((a) => a.name);
  if (toRemove.length > 0) {
    uninstallPackages(toRemove, packageManager);
  }

  // 설치 실행
  const toInstall = selectedActions.filter((a) => a.action === 'install').map((a) => a.name);
  if (toInstall.length > 0) {
    installPackages(toInstall, packageManager);
  }

  // 최종 요약 - console.log를 사용하여 더 나은 포맷팅
  console.log('\n' + chalk.green.bold('✅ Complete:'));
  console.log(chalk.green(`   Updated:   ${toUpdate.length}`));
  console.log(chalk.green(`   Removed:   ${toRemove.length}`));
  console.log(chalk.green(`   Installed: ${toInstall.length}`));

  outro(chalk.bold.cyan('Packmate complete! 🎉'));
}

main().catch((error) => {
  console.error(chalk.red('Error occurred:'), error);
  process.exit(1);
});
