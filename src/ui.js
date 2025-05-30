import inquirer from 'inquirer';
import semver from 'semver';

const COLOR_RESET = '\x1b[0m';
const COLOR_RED = '\x1b[31m';
const COLOR_YELLOW = '\x1b[33m';
const COLOR_GREEN = '\x1b[32m';

function getUpdateType(current, latest) {
  if (!semver.valid(current) || !semver.valid(latest)) return 'unknown';
  return semver.diff(current, latest) || 'unknown';
}

function colorizeUpdateType(type) {
  switch (type) {
    case 'major':
      return `${COLOR_RED}[Major]${COLOR_RESET}`;
    case 'minor':
      return `${COLOR_YELLOW}[Minor]${COLOR_RESET}`;
    case 'patch':
      return `${COLOR_GREEN}[Patch]${COLOR_RESET}`;
    default:
      return '[Unknown]';
  }
}

function filterCandidates(candidates, filterOptions = {}) {
  const { scope, maxVersion } = filterOptions;
  return candidates.filter(({ name, currentVersion }) => {
    if (scope && !name.startsWith(scope)) return false;
    if (maxVersion && semver.valid(currentVersion)) {
      return semver.lte(currentVersion, maxVersion);
    }
    return !maxVersion;
  });
}

export async function promptUpdateCandidates(candidates, filterOptions = {}) {
  const filtered = filterCandidates(candidates, filterOptions);
  if (filtered.length === 0) {
    console.log('업데이트 가능한 패키지가 없습니다.');
    return [];
  }

  const choices = filtered.map(({ name, currentVersion, latestVersion }) => {
    const updateType = getUpdateType(currentVersion, latestVersion);
    const typeLabel = colorizeUpdateType(updateType);

    return {
      name: `${name} (현재: ${currentVersion}, 최신: ${latestVersion}) ${typeLabel}`,
      value: name,
      short: name,
    };
  });

  const answers = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'toUpdate',
      message: '업데이트할 패키지를 선택하세요:',
      choices,
      pageSize: 15,
    },
  ]);
  return answers.toUpdate;
}

export async function promptUnusedPackages(unusedPackages) {
  const answers = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'toRemove',
      message: '삭제할 사용하지 않는 패키지를 선택하세요:',
      choices: unusedPackages,
      pageSize: 15,
    },
  ]);
  return answers.toRemove;
}
