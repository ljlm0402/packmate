import fs from 'fs-extra';
import { globby } from 'globby';
import precinct from 'precinct';
import path from 'path';
import process from 'process';

function getCustomIgnoreList(pkgJson) {
  // 예시: package.json의 "packmate.ignoreUnused" 필드 사용
  return pkgJson?.packmate?.ignoreUnused || [];
}

export async function runUnusedCheck({ withUsedList = false } = {}) {
  const pkgPath = path.resolve(process.cwd(), 'package.json');
  const pkgJson = await fs.readJSON(pkgPath);
  const declared = [
    ...Object.keys(pkgJson.dependencies || {}),
    ...Object.keys(pkgJson.devDependencies || {}),
  ];
  const used = new Set();

  const extToType = {
    '.js': 'es6',
    '.jsx': 'es6',
    '.ts': 'ts',
    '.tsx': 'tsx',
  };

  const files = await globby(['**/*.{js,ts,jsx,tsx}', '!node_modules/**']);

  for (const file of files) {
    const ext = path.extname(file);
    const type = extToType[ext] || 'es6';

    const content = await fs.readFile(file, 'utf8');
    let deps;
    try {
      deps = precinct(content, { type });
    } catch (e) {
      console.warn(`precinct parse failed in "${file}": ${e.message}`);
      deps = [];
    }
    deps.forEach((dep) => {
      if (!dep || dep.startsWith('.') || path.isAbsolute(dep)) return;
      const pkgName =
        dep.split('/')[0].startsWith('@') && dep.includes('/')
          ? dep.split('/').slice(0, 2).join('/')
          : dep.split('/')[0];
      used.add(pkgName);
    });
  }

  const DEFAULT_IGNORE_UNUSED = [
    'eslint',
    'prettier',
    'jest',
    'nodemon',
    'webpack',
    'vite',
    'babel',
    'mocha',
    'ava',
    'ts-node',
    'typescript',
  ];
  const IGNORE_UNUSED = [...DEFAULT_IGNORE_UNUSED, ...getCustomIgnoreList(pkgJson)];

  const unused = declared.filter((dep) => !used.has(dep) && !IGNORE_UNUSED.includes(dep));

  if (withUsedList) {
    return { unused, used: Array.from(used) };
  }
  return unused;
}
