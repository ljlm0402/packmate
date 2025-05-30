#!/usr/bin/env node

import { getUpdateCandidates, updatePackages } from '../src/update-checker.js';
import { runUnusedCheck } from '../src/unused-checker.js';
import { promptUpdateCandidates, promptUnusedPackages } from '../src/ui.js';
import { detectPackageManager } from '../src/detect-package-manager.js';
import { execSync } from 'child_process';

function uninstallPackages(packages, packageManager) {
  if (packages.length === 0) return;

  let uninstallCmd;
  switch (packageManager) {
    case 'pnpm':
      uninstallCmd = 'pnpm remove';
      break;
    case 'yarn':
      uninstallCmd = 'yarn remove';
      break;
    case 'npm':
    default:
      uninstallCmd = 'npm uninstall';
      break;
  }

  // 여러 패키지를 한 번에 삭제
  const pkgList = packages.join(' ');
  console.log(`> ${uninstallCmd} ${pkgList}`);
  try {
    execSync(`${uninstallCmd} ${pkgList}`, { stdio: 'inherit' });
    console.log(`패키지 삭제 완료: ${pkgList}`);
  } catch (e) {
    console.error(`패키지 삭제 실패: ${e.message}`);
  }
}

async function main() {
  const cmd = process.argv[2];
  const packageManager = detectPackageManager();

  try {
    if (cmd === 'interactive-update') {
      const candidates = await getUpdateCandidates(packageManager);
      const toUpdate = await promptUpdateCandidates(candidates);

      if (toUpdate.length > 0) {
        await updatePackages(toUpdate, packageManager);
      } else {
        console.log('업데이트할 패키지를 선택하지 않았습니다.');
      }
    } else if (cmd === 'check-unused') {
      const unused = await runUnusedCheck();
      if (unused.length === 0) {
        console.log('사용하지 않는 패키지가 없습니다.');
        return;
      }
      console.log('사용하지 않는 패키지 목록:');
      unused.forEach(pkg => console.log(` - ${pkg}`));

      const toRemove = await promptUnusedPackages(unused);
      if (toRemove.length > 0) {
        uninstallPackages(toRemove, packageManager);
      } else {
        console.log('삭제할 패키지를 선택하지 않았습니다.');
      }
    } else {
      console.log('명령어:');
      console.log('  interactive-update  - 인터랙티브 패키지 업데이트');
      console.log('  check-unused        - 사용하지 않는 패키지 검사 및 삭제');
    }
  } catch (err) {
    console.error('오류:', err);
    process.exit(1);
  }
}

main();
