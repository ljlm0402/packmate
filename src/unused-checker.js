import fs from 'fs-extra';
import { globby } from 'globby';
import os from 'os';
import path from 'path';
import precinct from 'precinct';
import process from 'process';
import pMap from 'p-map';
import { loadConfig, shouldIgnorePackage } from './config-loader.js';

// package.json을 반복해서 읽지 않도록 캐시
let cachedPkgJson = null;
let cachedPkgJsonPath = null;

function getCustomIgnoreList(pkgJson) {
  // 예시: package.json의 "packmate.ignoreUnused" 필드 사용
  return pkgJson?.packmate?.ignoreUnused || [];
}

/**
 * 동적 import 패턴 감지
 * import('module-name'), require(variable) 등
 */
function detectDynamicImports(content) {
  const dynamicImports = new Set();

  // import('module-name') 패턴
  const importRegex = /import\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    dynamicImports.add(match[1]);
  }

  // require 변수 패턴에서 문자열 리터럴 추출 시도
  const requireVarRegex = /require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
  while ((match = requireVarRegex.exec(content)) !== null) {
    dynamicImports.add(match[1]);
  }

  return Array.from(dynamicImports);
}

/**
 * 조건부 require 감지
 * if/try-catch 안의 require 등
 */
function detectConditionalRequires(content) {
  const conditionalRequires = new Set();

  // try-catch 블록 내 require
  const tryRegex = /try\s*{[\s\S]*?require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)[\s\S]*?}\s*catch/g;
  let match;
  while ((match = tryRegex.exec(content)) !== null) {
    conditionalRequires.add(match[1]);
  }

  // if 문 안의 require (단순 패턴)
  const ifRegex = /if\s*\([^)]*\)\s*{[\s\S]*?require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
  while ((match = ifRegex.exec(content)) !== null) {
    conditionalRequires.add(match[1]);
  }

  return Array.from(conditionalRequires);
}

/**
 * 패키지명 정규화 (스코프 패키지 처리)
 */
function normalizePackageName(dep) {
  if (!dep || dep.startsWith('.') || path.isAbsolute(dep)) return null;

  // @scope/package/subpath → @scope/package
  if (dep.startsWith('@') && dep.includes('/')) {
    const parts = dep.split('/');
    return parts.slice(0, 2).join('/');
  }

  // package/subpath → package
  return dep.split('/')[0];
}

/**
 * 캐시된 package.json을 가져오거나 디스크에서 읽기
 */
async function getPkgJson() {
  const pkgPath = path.resolve(process.cwd(), 'package.json');

  if (cachedPkgJson && cachedPkgJsonPath === pkgPath) {
    return cachedPkgJson;
  }

  cachedPkgJson = await fs.readJSON(pkgPath);
  cachedPkgJsonPath = pkgPath;
  return cachedPkgJson;
}

export async function runUnusedCheck({ withUsedList = false } = {}) {
  const config = loadConfig();
  const pkgJson = await getPkgJson();

  const dependencies = Object.keys(pkgJson.dependencies || {});
  const devDependencies = Object.keys(pkgJson.devDependencies || {});
  const declared = [...dependencies, ...devDependencies];

  const used = new Set();
  const dynamicUsed = new Set(); // 동적 import로 사용된 것들
  const conditionalUsed = new Set(); // 조건부 require로 사용된 것들

  const extToType = {
    '.js': 'es6',
    '.jsx': 'es6',
    '.ts': 'ts',
    '.tsx': 'tsx',
    '.mjs': 'es6',
    '.cjs': 'commonjs',
  };

  const files = await globby(['**/*.{js,ts,jsx,tsx,mjs,cjs}', '!node_modules/**']);

  // 성능 향상을 위해 파일을 병렬로 처리
  const concurrency = Math.max(os.cpus().length, 4);

  const processFile = async (file) => {
    const ext = path.extname(file);
    const type = extToType[ext] || 'es6';
    const content = await fs.readFile(file, 'utf8');

    const fileDeps = new Set();
    const fileDynamicImports = new Set();
    const fileConditionalReqs = new Set();

    // 1. Precinct를 통한 정적 분석
    try {
      const deps = precinct(content, { type });
      deps.forEach((dep) => {
        const pkgName = normalizePackageName(dep);
        if (pkgName) fileDeps.add(pkgName);
      });
    } catch (e) {
      console.warn(`precinct parse failed in "${file}": ${e.message}`);
    }

    // 2. 동적 import 감지
    if (config.detection?.dynamicImport) {
      const dynamicImports = detectDynamicImports(content);
      dynamicImports.forEach((dep) => {
        const pkgName = normalizePackageName(dep);
        if (pkgName) {
          fileDeps.add(pkgName);
          fileDynamicImports.add(pkgName);
        }
      });
    }

    // 3. 조건부 require 감지
    if (config.detection?.conditionalRequire) {
      const conditionalReqs = detectConditionalRequires(content);
      conditionalReqs.forEach((dep) => {
        const pkgName = normalizePackageName(dep);
        if (pkgName) {
          fileDeps.add(pkgName);
          fileConditionalReqs.add(pkgName);
        }
      });
    }

    return { fileDeps, fileDynamicImports, fileConditionalReqs };
  };

  // 모든 파일을 병렬로 처리
  const results = await pMap(files, processFile, { concurrency });

  // 결과 병합
  results.forEach(({ fileDeps, fileDynamicImports, fileConditionalReqs }) => {
    fileDeps.forEach(dep => used.add(dep));
    fileDynamicImports.forEach(dep => dynamicUsed.add(dep));
    fileConditionalReqs.forEach(dep => conditionalUsed.add(dep));
  });

  const DEFAULT_IGNORE_UNUSED = config.detection?.ignoreUnused || [
    'eslint',
    'prettier',
    'jest',
    'nodemon',
    'webpack',
    'vite',
    'typescript',
    'ts-node',
    '@types/*',
  ];

  // import되지 않을 수 있는 빌드 도구 및 개발 전용 패키지
  const DEV_TOOLS = new Set([
    'eslint',
    'prettier',
    'jest',
    'mocha',
    'chai',
    'webpack',
    'vite',
    'rollup',
    'parcel',
    'typescript',
    'ts-node',
    'nodemon',
    'concurrently',
    '@swc/core',
    'esbuild',
    'babel',
    '@babel/core',
    'husky',
    'lint-staged',
    'commitlint',
  ]);

  // 패키지가 개발 도구인지 확인
  function isDevTool(pkgName) {
    if (DEV_TOOLS.has(pkgName)) return true;
    if (pkgName.startsWith('@types/')) return true;
    if (pkgName.startsWith('eslint-')) return true;
    if (pkgName.startsWith('babel-')) return true;
    if (pkgName.startsWith('@babel/')) return true;
    if (pkgName.startsWith('webpack-')) return true;
    if (pkgName.startsWith('vite-')) return true;
    return false;
  }

  const IGNORE_UNUSED = [...DEFAULT_IGNORE_UNUSED, ...getCustomIgnoreList(pkgJson)];

  // 사용되지 않았고, ignore 목록에도 없는 패키지
  const unused = declared.filter((dep) => {
    if (used.has(dep)) return false;
    if (IGNORE_UNUSED.includes(dep)) return false;
    if (shouldIgnorePackage(dep, config)) return false;

    // devDependency이고 알려진 개발 도구인 경우, 중간 신뢰도로 표시
    if (devDependencies.includes(dep) && isDevTool(dep)) {
      return false; // 개발 도구는 미사용으로 표시하지 않음
    }

    return true;
  });

  // devDependencies 분석 모드
  const result = { unused, used: Array.from(used) };

  if (config.analysisMode?.devDeps) {
    result.unusedDev = devDependencies.filter(
      (dep) => !used.has(dep) && !IGNORE_UNUSED.includes(dep) && !shouldIgnorePackage(dep, config),
    );
    result.unusedProd = dependencies.filter(
      (dep) => !used.has(dep) && !IGNORE_UNUSED.includes(dep) && !shouldIgnorePackage(dep, config),
    );
  }

  result.dynamicUsed = Array.from(dynamicUsed);
  result.conditionalUsed = Array.from(conditionalUsed);

  if (withUsedList) {
    return result;
  }
  return unused;
}
