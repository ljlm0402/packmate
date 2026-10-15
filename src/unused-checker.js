import fs from 'node:fs/promises';
import os from 'os';
import path from 'path';
import process from 'process';
import pMap from 'p-map';
import {
  normalizePackageName,
  sourceFiles,
  readSource,
  parseReferences,
} from './source-analysis.js';
import { loadConfig, shouldIgnorePackage } from './config-loader.js';

function getCustomIgnoreList(pkgJson) {
  // 예시: package.json의 "packmate.ignoreUnused" 필드 사용
  return pkgJson?.packmate?.ignoreUnused || [];
}

export async function runUnusedCheck({
  withUsedList = false,
  root = process.cwd(),
  config = loadConfig({ root }),
} = {}) {
  const pkgJson = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  const evidence = Object.create(null);
  const parseErrors = [];
  const record = (name, file, kind) => {
    (evidence[name] ||= []).push({ file, kind });
  };
  const dependencies = Object.keys(pkgJson.dependencies || {});
  const devDependencies = Object.keys(pkgJson.devDependencies || {});
  const declared = [
    ...new Set([
      ...dependencies,
      ...(config.analysisMode?.devDeps === false ? [] : devDependencies),
    ]),
  ];

  const used = new Set();
  const dynamicUsed = new Set(); // 동적 import로 사용된 것들
  const conditionalUsed = new Set(); // 조건부 require로 사용된 것들

  const { files, unsupported } = await sourceFiles(root, config);
  for (const file of unsupported)
    parseErrors.push({ file, error: 'Unsupported source format; removal suggestions suppressed' });
  const concurrency = Math.min(Math.max(os.cpus().length, 4), 16);
  const processFile = async (file) => {
    const fileDeps = new Set();
    const fileDynamicImports = new Set();
    const fileConditionalReqs = new Set();
    try {
      const { references, unresolved } = parseReferences(
        await readSource(root, file),
        file,
        config,
      );
      unresolved.forEach((error) => parseErrors.push({ file, error }));
      for (const reference of references) {
        const name = normalizePackageName(reference.specifier);
        if (!name) continue;
        fileDeps.add(name);
        record(name, file, reference.kind);
        if (reference.kind === 'dynamic-import') fileDynamicImports.add(name);
        if (reference.kind === 'conditional-require') fileConditionalReqs.add(name);
      }
    } catch (error) {
      parseErrors.push({ file, error: error.message });
    }
    return { fileDeps, fileDynamicImports, fileConditionalReqs };
  };

  // 모든 파일을 병렬로 처리
  const results = await pMap(files, processFile, { concurrency });

  // 결과 병합
  results.forEach(({ fileDeps, fileDynamicImports, fileConditionalReqs }) => {
    fileDeps.forEach((dep) => used.add(dep));
    fileDynamicImports.forEach((dep) => dynamicUsed.add(dep));
    fileConditionalReqs.forEach((dep) => conditionalUsed.add(dep));
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
    if (shouldIgnorePackage(dep, { ignorePatterns: IGNORE_UNUSED })) return false;
    if (shouldIgnorePackage(dep, config)) return false;

    // devDependency이고 알려진 개발 도구인 경우, 중간 신뢰도로 표시
    if (devDependencies.includes(dep) && isDevTool(dep)) {
      return false; // 개발 도구는 미사용으로 표시하지 않음
    }

    return true;
  });

  // devDependencies 분석 모드
  const result = {
    unused,
    used: Array.from(used).sort(),
    evidence,
    parseErrors: parseErrors.sort((a, b) => a.file.localeCompare(b.file)),
    scannedFiles: files.length,
  };
  result.exclusions = Object.fromEntries(
    declared
      .filter((name) => !unused.includes(name))
      .map((name) => [name, used.has(name) ? 'source-reference' : 'ignore-policy-or-dev-tool']),
  );

  if (config.analysisMode?.devDeps) {
    result.unusedDev = devDependencies.filter((dep) => unused.includes(dep));
    result.unusedProd = dependencies.filter((dep) => unused.includes(dep));
  }

  result.dynamicUsed = Array.from(dynamicUsed);
  result.conditionalUsed = Array.from(conditionalUsed);

  if (withUsedList) {
    return result;
  }
  return unused;
}
