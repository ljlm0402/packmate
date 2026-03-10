/**
 * 정책 검증 엔진
 * 팀 정책 및 규칙 준수 자동 검증
 */

import fs from 'fs';
import path from 'path';
import semver from 'semver';

export class PolicyValidationEngine {
    constructor(teamConfigManager, options = {}) {
        this.teamConfigManager = teamConfigManager;
        this.options = {
            strictMode: false,
            allowOverrides: true,
            logViolations: true,
            autoFix: false,
            ...options
        };
        
        this.validationRules = new Map();
        this.violations = [];
        this.warnings = [];
        
        this.stats = {
            rulesEvaluated: 0,
            violationsFound: 0,
            warningsGenerated: 0,
            autoFixesApplied: 0
        };
        
        // 기본 검증 규칙 등록
        this.registerDefaultRules();
    }

    // 기본 검증 규칙 등록
    registerDefaultRules() {
        // 의존성 관련 규칙
        this.addRule('dependency.version', this.validateDependencyVersions.bind(this));
        this.addRule('dependency.license', this.validateLicenses.bind(this));
        this.addRule('dependency.security', this.validateSecurityPolicy.bind(this));
        this.addRule('dependency.deprecation', this.validateDeprecatedPackages.bind(this));
        this.addRule('dependency.prerelease', this.validatePrereleasePackages.bind(this));
        
        // 구성 관련 규칙
        this.addRule('config.packageManager', this.validatePackageManager.bind(this));
        this.addRule('config.nodeVersion', this.validateNodeVersion.bind(this));
        this.addRule('config.lockfile', this.validateLockfile.bind(this));
        
        // 보안 관련 규칙
        this.addRule('security.vulnerabilities', this.validateVulnerabilities.bind(this));
        this.addRule('security.cvss', this.validateCvssScores.bind(this));
        this.addRule('security.audit', this.validateSecurityAudit.bind(this));
        
        // 성능 관련 규칙
        this.addRule('performance.bundleSize', this.validateBundleSize.bind(this));
        this.addRule('performance.dependencyDepth', this.validateDependencyDepth.bind(this));
        
        // 컴플라이언스 관련 규칙
        this.addRule('compliance.changelog', this.validateChangelog.bind(this));
        this.addRule('compliance.documentation', this.validateDocumentation.bind(this));
    }

    // 규칙 추가
    addRule(ruleName, validator) {
        this.validationRules.set(ruleName, validator);
    }

    // 규칙 제거
    removeRule(ruleName) {
        this.validationRules.delete(ruleName);
    }

    // 메인 검증 실행
    async validate(analysisData) {
        console.log('🔍 Starting policy validation...');
        
        try {
            // 팀 정책 로드
            const teamPolicy = await this.teamConfigManager.loadProjectPolicy();
            const teamConfig = await this.teamConfigManager.loadTeamConfig();
            const ignoreRules = await this.teamConfigManager.loadIgnoreRules();
            
            if (!teamPolicy) {
                console.warn('⚠️ No team policy found, skipping validation');
                return this.createEmptyResult();
            }
            
            // 검증 컨텍스트 준비
            const context = {
                policy: teamPolicy,
                config: teamConfig,
                ignoreRules,
                analysisData,
                projectPath: this.teamConfigManager.projectPath
            };
            
            // 모든 규칙 실행
            for (const [ruleName, validator] of this.validationRules) {
                if (this.shouldRunRule(ruleName, context)) {
                    try {
                        await validator(context);
                        this.stats.rulesEvaluated++;
                    } catch (error) {
                        console.warn(`Rule ${ruleName} failed: ${error.message}`);
                    }
                }
            }
            
            // 결과 정리
            const result = this.generateValidationResult(context);
            
            // 자동 수정 적용
            if (this.options.autoFix && result.fixableViolations.length > 0) {
                await this.applyAutoFixes(result.fixableViolations, context);
            }
            
            console.log(`✅ Policy validation completed - ${this.violations.length} violations, ${this.warnings.length} warnings`);
            
            return result;
            
        } catch (error) {
            console.error(`❌ Policy validation failed: ${error.message}`);
            throw error;
        }
    }

    // 의존성 버전 검증
    async validateDependencyVersions(context) {
        const { policy, analysisData } = context;
        const rules = policy.rules.dependencies;
        
        if (!analysisData.packages) return;
        
        analysisData.packages.forEach(pkg => {
            // 프리릴리스 버전 검증
            if (!rules.allowPrerelease && pkg.version && semver.prerelease(pkg.version)) {
                this.addViolation({
                    rule: 'dependency.version',
                    severity: 'medium',
                    message: `Pre-release version not allowed: ${pkg.name}@${pkg.version}`,
                    package: pkg.name,
                    fixable: true,
                    fix: () => this.suggestStableVersion(pkg)
                });
            }
            
            // 버전 범위 검증
            if (rules.enforceExactVersions && pkg.version && pkg.version.includes('^') || pkg.version.includes('~')) {
                this.addViolation({
                    rule: 'dependency.version',
                    severity: 'low',
                    message: `Exact version required: ${pkg.name}@${pkg.version}`,
                    package: pkg.name,
                    fixable: true,
                    fix: () => this.convertToExactVersion(pkg)
                });
            }
        });
    }

    // 라이선스 검증
    async validateLicenses(context) {
        const { policy, analysisData } = context;
        const rules = policy.rules.dependencies;
        
        if (!rules.allowedLicenses || !analysisData.packages) return;
        
        analysisData.packages.forEach(pkg => {
            if (pkg.license && rules.allowedLicenses !== '*') {
                const isAllowed = Array.isArray(rules.allowedLicenses) 
                    ? rules.allowedLicenses.includes(pkg.license)
                    : pkg.license === rules.allowedLicenses;
                
                if (!isAllowed) {
                    this.addViolation({
                        rule: 'dependency.license',
                        severity: 'high',
                        message: `License not allowed: ${pkg.name} uses ${pkg.license}`,
                        package: pkg.name,
                        fixable: false,
                        suggestion: 'Consider finding an alternative package with an allowed license'
                    });
                }
            }
        });
    }

    // 보안 정책 검증
    async validateSecurityPolicy(context) {
        const { policy, analysisData } = context;
        const rules = policy.rules.security;
        
        if (!analysisData.vulnerabilities) return;
        
        const vulnCounts = this.countVulnerabilitiesBySeverity(analysisData.vulnerabilities);
        
        // 취약점 개수 제한 검증
        if (rules.maxVulnerabilities !== undefined && vulnCounts.total > rules.maxVulnerabilities) {
            this.addViolation({
                rule: 'dependency.security',
                severity: 'high',
                message: `Too many vulnerabilities: ${vulnCounts.total} found, maximum ${rules.maxVulnerabilities} allowed`,
                fixable: true,
                fix: () => this.suggestVulnerabilityFixes(analysisData.vulnerabilities)
            });
        }
        
        // 치명적 취약점 차단
        if (rules.blockCriticalVulnerabilities && vulnCounts.critical > 0) {
            this.addViolation({
                rule: 'security.vulnerabilities',
                severity: 'critical',
                message: `Critical vulnerabilities found: ${vulnCounts.critical}. Policy requires zero critical vulnerabilities.`,
                fixable: true,
                fix: () => this.suggestCriticalFixes(analysisData.vulnerabilities)
            });
        }
    }

    // 폐기된 패키지 검증
    async validateDeprecatedPackages(context) {
        const { policy, analysisData } = context;
        const rules = policy.rules.dependencies;
        
        if (rules.allowDeprecated || !analysisData.packages) return;
        
        analysisData.packages.forEach(pkg => {
            if (pkg.deprecated) {
                this.addViolation({
                    rule: 'dependency.deprecation',
                    severity: 'medium',
                    message: `Deprecated package not allowed: ${pkg.name}`,
                    package: pkg.name,
                    fixable: true,
                    fix: () => this.suggestAlternatives(pkg)
                });
            }
        });
    }

    // 프리릴리스 패키지 검증
    async validatePrereleasePackages(context) {
        const { policy, analysisData } = context;
        const rules = policy.rules.dependencies;
        
        if (rules.allowPrerelease || !analysisData.packages) return;
        
        analysisData.packages.forEach(pkg => {
            if (pkg.version && semver.prerelease(pkg.version)) {
                this.addViolation({
                    rule: 'dependency.prerelease',
                    severity: 'medium',
                    message: `Pre-release package not allowed: ${pkg.name}@${pkg.version}`,
                    package: pkg.name,
                    fixable: true,
                    fix: () => this.suggestStableVersion(pkg)
                });
            }
        });
    }

    // 패키지 매니저 검증
    async validatePackageManager(context) {
        const { config, projectPath } = context;
        
        if (!config || !config.settings.packageManager) return;
        
        const expectedPM = config.settings.packageManager;
        const lockFiles = {
            npm: 'package-lock.json',
            yarn: 'yarn.lock',
            pnpm: 'pnpm-lock.yaml'
        };
        
        // 예상되는 락 파일 확인
        const expectedLockFile = lockFiles[expectedPM];
        const expectedLockPath = path.join(projectPath, expectedLockFile);
        
        if (!fs.existsSync(expectedLockPath)) {
            this.addWarning({
                rule: 'config.packageManager',
                message: `Expected ${expectedPM} lock file (${expectedLockFile}) not found`,
                suggestion: `Run ${expectedPM} install to generate the lock file`
            });
        }
        
        // 다른 패키지 매니저의 락 파일이 있는지 확인
        Object.entries(lockFiles).forEach(([pm, lockFile]) => {
            if (pm !== expectedPM) {
                const lockPath = path.join(projectPath, lockFile);
                if (fs.existsSync(lockPath)) {
                    this.addViolation({
                        rule: 'config.packageManager',
                        severity: 'medium',
                        message: `Conflicting package manager detected: Found ${lockFile} but team uses ${expectedPM}`,
                        fixable: true,
                        fix: () => this.suggestPackageManagerMigration(expectedPM, pm)
                    });
                }
            }
        });
    }

    // Node.js 버전 검증
    async validateNodeVersion(context) {
        const { config } = context;
        
        if (!config || !config.settings.nodeVersion) return;
        
        const expectedVersion = config.settings.nodeVersion;
        const currentVersion = process.version;
        
        if (expectedVersion !== currentVersion) {
            const severity = semver.major(expectedVersion) !== semver.major(currentVersion) ? 'high' : 'low';
            
            this.addViolation({
                rule: 'config.nodeVersion',
                severity,
                message: `Node.js version mismatch. Expected: ${expectedVersion}, Current: ${currentVersion}`,
                fixable: false,
                suggestion: `Use nvm or similar tool to switch to ${expectedVersion}`
            });
        }
    }

    // 락 파일 검증
    async validateLockfile(context) {
        const { policy, projectPath } = context;
        const rules = policy.rules.dependencies;
        
        if (!rules.requireLockfile) return;
        
        const lockFiles = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'];
        const hasLockFile = lockFiles.some(file => fs.existsSync(path.join(projectPath, file)));
        
        if (!hasLockFile) {
            this.addViolation({
                rule: 'config.lockfile',
                severity: 'high',
                message: 'Lock file required but not found',
                fixable: true,
                fix: () => 'Run npm install, yarn install, or pnpm install to generate a lock file'
            });
        }
    }

    // 취약점 검증
    async validateVulnerabilities(context) {
        const { policy, analysisData } = context;
        const rules = policy.rules.security;
        
        if (!analysisData.vulnerabilities) return;
        
        analysisData.vulnerabilities.forEach(vuln => {
            if (vuln.severity === 'critical' && rules.blockCriticalVulnerabilities) {
                this.addViolation({
                    rule: 'security.vulnerabilities',
                    severity: 'critical',
                    message: `Critical vulnerability found: ${vuln.id} in ${vuln.package}`,
                    package: vuln.package,
                    fixable: vuln.fixedIn ? true : false,
                    fix: vuln.fixedIn ? () => `Update ${vuln.package} to version ${vuln.fixedIn}` : undefined
                });
            }
        });
    }

    // CVSS 점수 검증
    async validateCvssScores(context) {
        const { policy, analysisData } = context;
        const rules = policy.rules.security;
        
        if (!rules.maxCvssScore || !analysisData.vulnerabilities) return;
        
        analysisData.vulnerabilities.forEach(vuln => {
            if (vuln.cvssScore && vuln.cvssScore > rules.maxCvssScore) {
                this.addViolation({
                    rule: 'security.cvss',
                    severity: vuln.cvssScore > 7.0 ? 'high' : 'medium',
                    message: `CVSS score too high: ${vuln.cvssScore} (max: ${rules.maxCvssScore}) for ${vuln.package}`,
                    package: vuln.package,
                    fixable: vuln.fixedIn ? true : false
                });
            }
        });
    }

    // 보안 감사 검증
    async validateSecurityAudit(context) {
        const { policy } = context;
        const rules = policy.rules.security;
        
        if (!rules.enableAutomaticScans) return;
        
        // 보안 감사가 정기적으로 실행되고 있는지 확인
        // 실제 구현에서는 CI/CD 파이프라인이나 스케줄러와 통합
        this.addWarning({
            rule: 'security.audit',
            message: 'Ensure automatic security scans are enabled in your CI/CD pipeline'
        });
    }

    // 번들 크기 검증
    async validateBundleSize(context) {
        const { policy, analysisData } = context;
        
        if (!policy.rules.performance || !policy.rules.performance.maxBundleSize) return;
        
        // 실제 구현에서는 번들 분석 데이터 필요
        if (analysisData.bundleSize) {
            const maxSize = this.parseSize(policy.rules.performance.maxBundleSize);
            const currentSize = analysisData.bundleSize;
            
            if (currentSize > maxSize) {
                this.addViolation({
                    rule: 'performance.bundleSize',
                    severity: 'medium',
                    message: `Bundle size exceeds limit: ${currentSize} > ${maxSize}`,
                    fixable: true,
                    fix: () => 'Consider code splitting, tree shaking, or removing unused dependencies'
                });
            }
        }
    }

    // 의존성 깊이 검증
    async validateDependencyDepth(context) {
        const { policy, analysisData } = context;
        
        if (!policy.rules.performance || !policy.rules.performance.limitDependencyLayers) return;
        
        const maxDepth = policy.rules.performance.limitDependencyLayers;
        
        if (analysisData.dependencyDepth && analysisData.dependencyDepth > maxDepth) {
            this.addViolation({
                rule: 'performance.dependencyDepth',
                severity: 'low',
                message: `Dependency depth too high: ${analysisData.dependencyDepth} > ${maxDepth}`,
                fixable: false,
                suggestion: 'Consider flattening dependency structure or using peer dependencies'
            });
        }
    }

    // 변경 로그 검증
    async validateChangelog(context) {
        const { policy, projectPath } = context;
        const rules = policy.rules.compliance;
        
        if (!rules.requireChangelogUpdate) return;
        
        const changelogFiles = ['CHANGELOG.md', 'CHANGELOG.txt', 'HISTORY.md'];
        const hasChangelog = changelogFiles.some(file => fs.existsSync(path.join(projectPath, file)));
        
        if (!hasChangelog) {
            this.addViolation({
                rule: 'compliance.changelog',
                severity: 'low',
                message: 'Changelog file required but not found',
                fixable: true,
                fix: () => 'Create a CHANGELOG.md file to track project changes'
            });
        }
    }

    // 문서 검증
    async validateDocumentation(context) {
        const { projectPath } = context;
        
        const requiredDocs = ['README.md', 'package.json'];
        const missingDocs = requiredDocs.filter(doc => 
            !fs.existsSync(path.join(projectPath, doc))
        );
        
        if (missingDocs.length > 0) {
            this.addWarning({
                rule: 'compliance.documentation',
                message: `Missing documentation files: ${missingDocs.join(', ')}`
            });
        }
    }

    // 위반 사항 추가
    addViolation(violation) {
        this.violations.push({
            ...violation,
            timestamp: new Date().toISOString(),
            id: this.generateViolationId()
        });
        this.stats.violationsFound++;
    }

    // 경고 추가
    addWarning(warning) {
        this.warnings.push({
            ...warning,
            timestamp: new Date().toISOString(),
            id: this.generateWarningId()
        });
        this.stats.warningsGenerated++;
    }

    // 취약점 심각도별 집계
    countVulnerabilitiesBySeverity(vulnerabilities) {
        return vulnerabilities.reduce((counts, vuln) => {
            counts[vuln.severity] = (counts[vuln.severity] || 0) + 1;
            counts.total = (counts.total || 0) + 1;
            return counts;
        }, { critical: 0, high: 0, medium: 0, low: 0, total: 0 });
    }

    // 크기 파싱 (예: "500KB" -> 500000)
    parseSize(sizeStr) {
        const units = { B: 1, KB: 1024, MB: 1024 * 1024, GB: 1024 * 1024 * 1024 };
        const match = sizeStr.toString().match(/^(\d+(?:\.\d+)?)\s*(\w+)?$/);
        
        if (!match) return Infinity;
        
        const value = parseFloat(match[1]);
        const unit = match[2] || 'B';
        
        return value * (units[unit.toUpperCase()] || 1);
    }

    // 규칙 실행 여부 확인
    shouldRunRule(ruleName, context) {
        const { ignoreRules } = context;
        
        if (!ignoreRules || !ignoreRules.patterns) return true;
        
        return !ignoreRules.patterns.some(pattern => {
            return new RegExp(pattern).test(ruleName);
        });
    }

    // 검증 결과 생성
    generateValidationResult(context) {
        const fixableViolations = this.violations.filter(v => v.fixable);
        const criticalViolations = this.violations.filter(v => v.severity === 'critical');
        
        return {
            valid: this.violations.length === 0,
            summary: {
                totalViolations: this.violations.length,
                criticalViolations: criticalViolations.length,
                fixableViolations: fixableViolations.length,
                warnings: this.warnings.length
            },
            violations: this.violations,
            fixableViolations,
            criticalViolations,
            warnings: this.warnings,
            stats: { ...this.stats },
            timestamp: new Date().toISOString(),
            policy: context.policy
        };
    }

    // 빈 결과 생성
    createEmptyResult() {
        return {
            valid: true,
            summary: {
                totalViolations: 0,
                criticalViolations: 0,
                fixableViolations: 0,
                warnings: 0
            },
            violations: [],
            fixableViolations: [],
            criticalViolations: [],
            warnings: [],
            stats: { ...this.stats },
            timestamp: new Date().toISOString(),
            policy: null
        };
    }

    // 자동 수정 적용
    async applyAutoFixes(fixableViolations, context) {
        console.log(`🔧 Applying ${fixableViolations.length} auto-fixes...`);
        
        let appliedFixes = 0;
        
        for (const violation of fixableViolations) {
            try {
                if (typeof violation.fix === 'function') {
                    await violation.fix();
                    appliedFixes++;
                } else if (typeof violation.fix === 'string') {
                    console.log(`💡 Fix suggestion: ${violation.fix}`);
                }
            } catch (error) {
                console.warn(`Failed to apply fix for ${violation.rule}: ${error.message}`);
            }
        }
        
        this.stats.autoFixesApplied = appliedFixes;
        console.log(`✅ Applied ${appliedFixes} automatic fixes`);
    }

    // 위반 ID 생성
    generateViolationId() {
        return `V-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    // 경고 ID 생성
    generateWarningId() {
        return `W-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    // 안정 버전 제안
    suggestStableVersion(pkg) {
        return `Consider using a stable version of ${pkg.name} instead of ${pkg.version}`;
    }

    // 정확한 버전 변환
    convertToExactVersion(pkg) {
        const cleanVersion = pkg.version.replace(/[\^~]/, '');
        return `Update ${pkg.name} version from ${pkg.version} to ${cleanVersion}`;
    }

    // 취약점 수정 제안
    suggestVulnerabilityFixes(vulnerabilities) {
        const fixableVulns = vulnerabilities.filter(v => v.fixedIn);
        if (fixableVulns.length === 0) return 'No automatic fixes available';
        
        return `Update the following packages: ${fixableVulns.map(v => `${v.package}@${v.fixedIn}`).join(', ')}`;
    }

    // 치명적 취약점 수정 제안
    suggestCriticalFixes(vulnerabilities) {
        const criticalVulns = vulnerabilities.filter(v => v.severity === 'critical');
        return this.suggestVulnerabilityFixes(criticalVulns);
    }

    // 대안 패키지 제안
    suggestAlternatives(pkg) {
        // 실제 구현에서는 패키지 대안 데이터베이스 필요
        return `Consider finding an alternative to deprecated package ${pkg.name}`;
    }

    // 패키지 매니저 마이그레이션 제안
    suggestPackageManagerMigration(target, current) {
        return `Remove ${current} lock file and run ${target} install to migrate to ${target}`;
    }

    // 통계 리셋
    resetStats() {
        this.violations = [];
        this.warnings = [];
        this.stats = {
            rulesEvaluated: 0,
            violationsFound: 0,
            warningsGenerated: 0,
            autoFixesApplied: 0
        };
    }

    // 커스텀 규칙 추가
    addCustomRule(name, description, validator) {
        this.addRule(name, async (context) => {
            try {
                await validator(context, this);
            } catch (error) {
                console.warn(`Custom rule ${name} failed: ${error.message}`);
            }
        });
    }
}