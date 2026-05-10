import fs from 'fs';
import path from 'path';
import process from 'process';

/**
 * Packmate 설정 로더
 * packmate.config.json 또는 package.json의 packmate 필드에서 설정을 읽습니다.
 */

const DEFAULT_CONFIG = {
    packageManager: null,
    ignorePatterns: ['@types/*'],
    analysisMode: {
        unused: 'moderate', // conservative | moderate | aggressive
        devDeps: true,
    },
    ui: {
        groupSessions: true,
        colorScheme: 'auto',
        defaultChecked: {
            updateAvailable: true,
            unused: false,
            notInstalled: true,
            latest: false,
            security: true,  // 보안 업데이트는 기본 선택됨
        },
    },
    security: {
        enabled: true,              // 보안 검사 활성화
        autoSelectCritical: true,   // Critical 취약성 자동 선택
        autoSelectHigh: true,       // High 취약성 자동 선택
        showLowPriority: false,     // Low priority 취약성 표시할지
        sources: ['npm-audit'],     // 검사할 취약성 소스
    },
    cache: {
        enabled: true,              // 캐싱 활성화
        memorySize: 1000,           // 메모리 캐시 크기
        diskTTL: 3600000,          // 디스크 캐시 TTL (1시간)
        showStats: true,            // 캐시 통계 표시
        autoCleanup: true,          // 자동 정리
        maxAge: 604800000,          // 최대 보관 기간 (7일)
    },
    detection: {
        dynamicImport: true,
        conditionalRequire: true,
        ignorePaths: [
            'node_modules/**',
            'backup/**',
            'dist/**',
            'build/**',
            'coverage/**',
            '.git/**',
            '.packmate/**',
        ],
        ignoreUnused: [
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
        ],
    },
};

/**
 * 설정 파일을 로드합니다
 */
export function loadConfig() {
    const configPath = path.resolve(process.cwd(), 'packmate.config.json');
    const pkgJsonPath = path.resolve(process.cwd(), 'package.json');

    let config = { ...DEFAULT_CONFIG };

    // 1. packmate.config.json 우선
    if (fs.existsSync(configPath)) {
        try {
            const fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            config = mergeConfig(config, fileConfig);
        } catch (e) {
            console.warn(`⚠️  packmate.config.json 파싱 실패: ${e.message}`);
        }
    }

    // 2. package.json의 packmate 필드
    if (fs.existsSync(pkgJsonPath)) {
        try {
            const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
            if (pkgJson.packmate) {
                config = mergeConfig(config, pkgJson.packmate);
            }
        } catch (e) {
            console.warn(`⚠️  package.json 파싱 실패: ${e.message}`);
        }
    }

    return config;
}

/**
 * packmate.config.json에 설정을 저장합니다.
 */
export function saveProjectConfig(partialConfig) {
    const configPath = path.resolve(process.cwd(), 'packmate.config.json');
    let currentConfig = {};

    if (fs.existsSync(configPath)) {
        try {
            currentConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        } catch {
            currentConfig = {};
        }
    }

    const nextConfig = mergeConfig(currentConfig, partialConfig);
    fs.writeFileSync(configPath, JSON.stringify(nextConfig, null, 2) + '\n');
    return nextConfig;
}

/**
 * 두 설정 객체를 깊게 병합합니다
 */
function mergeConfig(base, override) {
    const result = { ...base };

    for (const key in override) {
        if (override[key] !== undefined) {
            if (
                typeof override[key] === 'object' &&
                override[key] !== null &&
                !Array.isArray(override[key])
            ) {
                result[key] = mergeConfig(base[key] || {}, override[key]);
            } else {
                result[key] = override[key];
            }
        }
    }

    return result;
}

/**
 * ignorePatterns에 매칭되는지 확인
 */
export function shouldIgnorePackage(packageName, config) {
    const patterns = config.ignorePatterns || [];

    for (const pattern of patterns) {
        // 간단한 glob 패턴 지원 (* wildcard)
        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
        if (regex.test(packageName)) {
            return true;
        }
    }

    return false;
}

/**
 * 분석 모드에 따른 신뢰도 임계값 반환
 */
export function getConfidenceThreshold(config) {
    const mode = config.analysisMode?.unused || 'moderate';

    switch (mode) {
        case 'conservative':
            return 0.9; // 매우 확실한 경우만
        case 'moderate':
            return 0.7; // 보통 수준
        case 'aggressive':
            return 0.5; // 적극적으로 탐지
        default:
            return 0.7;
    }
}
