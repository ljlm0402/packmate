import { checkReferences } from './reference-checker.js';
import path from 'node:path';
import { runUnusedCheck } from './unused-checker.js';
import { declaredDependencies } from './dependency-resolver.js';

export async function analyzeUsage(
  root,
  manifest,
  config,
  { scan = runUnusedCheck, crossCheck = checkReferences } = {},
) {
  const primary = await scan({ root, config, withUsedList: true });
  let secondary;
  let crossError = null;
  try {
    secondary = await crossCheck(root, {
      package: manifest,
      config,
      ignorePatterns: config.detection?.ignorePaths || [],
      ignoreDirs: ['node_modules', '.git', '.packmate', 'dist', 'build', 'coverage'],
    });
  } catch (error) {
    crossError = error.message;
    secondary = {};
  }
  const errors = [
    ...primary.parseErrors,
    ...Object.entries(secondary.invalidFiles || {}).map(([file, error]) => ({
      file: path.relative(root, file),
      error: error.message || String(error),
    })),
  ];
  const hasSource = primary.scannedFiles > 0;
  const crossUnused = new Set([
    ...(secondary.dependencies || []),
    ...(secondary.devDependencies || []),
  ]);
  const entries = declaredDependencies(manifest).map(({ name, section }) => {
    const files = [
      ...(primary.evidence[name] || []),
      ...(secondary.using?.[name] || []).map((file) => ({
        file: path.relative(root, file),
        kind: 'lexical-or-config-reference',
      })),
    ];
    const base = { name, section, files, reasons: [], confidence: null };
    if (primary.used.includes(name) || files.length)
      return { ...base, status: 'used', reasons: ['Source or tool reference found'] };
    if (!primary.unused.includes(name))
      return {
        ...base,
        status: 'ignored',
        reasons: [primary.exclusions[name] || 'Excluded from source analysis'],
      };
    const both = crossUnused.has(name);
    const confidence = !hasSource || errors.length || crossError ? 'low' : both ? 'high' : 'medium';
    const conservative = config.analysisMode?.unused === 'conservative';
    return {
      ...base,
      status: confidence === 'low' || (conservative && !both) ? 'uncertain' : 'candidate',
      confidence,
      reasons: [
        both
          ? 'No reference found by AST and lexical/config checks'
          : 'No reference found by AST; lexical/config check did not confirm',
        ...(!hasSource
          ? ['No analyzable source files; usage cannot be determined from package.json alone']
          : []),
        ...(errors.length ? ['Source parsing was incomplete; removal suppressed'] : []),
        ...(crossError ? [`Cross-check unavailable: ${crossError}`] : []),
      ],
    };
  });
  return {
    status:
      errors.length ||
      crossError ||
      entries.some((entry) => entry.status === 'uncertain' && !hasSource)
        ? 'partial'
        : 'completed',
    coverage: hasSource ? 'source-files' : 'manifest-only',
    scannedFiles: primary.scannedFiles,
    errors,
    crossError,
    entries,
  };
}
