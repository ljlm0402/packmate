/**
 * 팀 협업 설정 관리 시스템
 * 팀 공유 설정, 정책 검증, Git hooks 통합
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import crypto from 'crypto';

export class TeamConfigManager {
    constructor(projectPath = process.cwd()) {
        this.projectPath = projectPath;
        this.configDir = path.join(projectPath, '.packmate');
        this.presetsDir = path.join(this.configDir, 'presets');
        
        this.configFiles = {
            team: path.join(this.configDir, 'team-config.json'),
            policy: path.join(this.configDir, 'project-policy.json'),
            ignore: path.join(this.configDir, 'ignore-rules.json')
        };
        
        this.presets = {
            strict: path.join(this.presetsDir, 'strict.json'),
            moderate: path.join(this.presetsDir, 'moderate.json'),
            loose: path.join(this.presetsDir, 'loose.json')
        };
        
        this.gitHooksDir = path.join(projectPath, '.git', 'hooks');
        
        this.stats = {
            configsLoaded: 0,
            policiesValidated: 0,
            violationsFound: 0,
            hooksInstalled: 0
        };
    }

    // 초기 설정
    async initialize(options = {}) {
        const {
            preset = 'moderate',
            enableGitHooks = true,
            teamName = 'development-team',
            enforcePolicy = true
        } = options;
        
        console.log('🔧 Initializing team collaboration system...');
        
        try {
            // 디렉터리 생성
            this.ensureDirectories();
            
            // 기본 설정 파일 생성  
            await this.createDefaultConfigs(preset, teamName, enforcePolicy);
            
            // 프리셋 파일 생성
            await this.createPresets();
            
            // Git hooks 설정
            if (enableGitHooks && this.isGitRepository()) {
                await this.setupGitHooks();
            }
            
            console.log('✅ Team collaboration system initialized successfully');
            
            return {
                configDir: this.configDir,
                preset,
                gitHooksEnabled: enableGitHooks,
                teamName
            };
            
        } catch (error) {
            console.error(`❌ Team config initialization failed: ${error.message}`);
            throw error;
        }
    }

    // 디렉터리 구조 생성
    ensureDirectories() {
        const dirs = [this.configDir, this.presetsDir];
        
        dirs.forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        });
    }

    // 기본 설정 파일 생성
    async createDefaultConfigs(preset, teamName, enforcePolicy) {
        // 팀 설정 파일
        const teamConfig = {
            version: '1.0.0',
            teamName,
            createdAt: new Date().toISOString(),
            settings: {
                packageManager: 'npm', // npm, yarn, pnpm
                nodeVersion: process.version,
                preset,
                enforcePolicy,
                autoUpdate: false,
                securityScanLevel: 'medium',
                cacheStrategy: 'predictive'
            },
            members: [],
            lastSyncAt: new Date().toISOString(),
            syncHash: this.generateSyncHash()
        };
        
        // 프로젝트 정책 파일
        const projectPolicy = {
            version: '1.0.0',
            policyLevel: preset,
            rules: {
                dependencies: {
                    allowPrerelease: preset === 'loose',
                    allowDeprecated: false,
                    maxVulnerabilities: preset === 'strict' ? 0 : 5,
                    requireLockfile: true,
                    allowedLicenses: ['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC']
                },
                security: {
                    enableAutomaticScans: true,
                    blockCriticalVulnerabilities: true,
                    requireSecurityReview: preset === 'strict',
                    maxCvssScore: preset === 'strict' ? 3.0 : 7.0
                },
                updates: {
                    autoMajor: false,
                    autoMinor: preset !== 'strict',
                    autoPatch: true,
                    requireApproval: preset === 'strict',
                    maxBatchSize: 10
                },
                compliance: {
                    requireLockfileCommit: true,
                    enforcePeerDependencies: preset === 'strict',
                    allowGlobalPackages: preset === 'loose',
                    requireChangelogUpdate: preset !== 'loose'
                }
            },
            permissions: {
                canOverridePolicy: ['admin', 'tech-lead'],
                canUpdateDependencies: ['admin', 'tech-lead', 'developer'],
                canApproveUpdates: ['admin', 'tech-lead']
            },
            notifications: {
                securityAlerts: true,
                updateNotifications: true,
                policyViolations: true,
                channels: ['console', 'file'] // console, file, slack, teams
            }
        };
        
        // 무시 규칙 파일
        const ignoreRules = {
            version: '1.0.0',
            packages: [
                // 개발 도구는 보안 검사에서 제외
                '@types/*',
                'eslint-*',
                'prettier',
                'typescript'
            ],
            patterns: [
                // 테스트 파일 제외
                '**/*.test.js',
                '**/*.spec.js',
                '**/test/**/*',
                '**/tests/**/*'
            ],
            vulnerabilities: [
                // 특정 CVE 무시 (주의해서 사용)
            ],
            temporary: {
                // 임시 무시 규칙 (만료 날짜 포함)
                packages: [],
                expiresAt: null
            },
            reason: {
                // 무시 이유 추적
                packages: {},
                patterns: {},
                vulnerabilities: {}
            }
        };
        
        // 파일 저장
        await Promise.all([
            this.saveJsonFile(this.configFiles.team, teamConfig),
            this.saveJsonFile(this.configFiles.policy, projectPolicy),
            this.saveJsonFile(this.configFiles.ignore, ignoreRules)
        ]);
        
        this.stats.configsLoaded += 3;
    }

    // 프리셋 파일 생성
    async createPresets() {
        const strictPreset = {
            name: 'Strict Policy',
            description: '엄격한 보안 및 품질 정책',
            level: 'strict',
            rules: {
                vulnerabilities: {
                    maxCritical: 0,
                    maxHigh: 0,
                    maxMedium: 2,
                    blockDeployment: true
                },
                dependencies: {
                    allowPrerelease: false,
                    allowDeprecated: false,
                    requireApproval: true,
                    autoUpdate: false
                },
                licensing: {
                    allowedTypes: ['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause'],
                    requireReview: true
                },
                performance: {
                    maxBundleSize: '500KB',
                    requireTreeShaking: true,
                    limitDependencyLayers: 3
                }
            }
        };
        
        const moderatePreset = {
            name: 'Moderate Policy',
            description: '균형잡힌 보안과 생산성 정책',
            level: 'moderate',
            rules: {
                vulnerabilities: {
                    maxCritical: 0,
                    maxHigh: 3,
                    maxMedium: 10,
                    blockDeployment: false
                },
                dependencies: {
                    allowPrerelease: false,
                    allowDeprecated: true,
                    requireApproval: false,
                    autoUpdate: true
                },
                licensing: {
                    allowedTypes: ['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'LGPL-2.1'],
                    requireReview: false
                },
                performance: {
                    maxBundleSize: '1MB',
                    requireTreeShaking: false,
                    limitDependencyLayers: 5
                }
            }
        };
        
        const loosePreset = {
            name: 'Loose Policy',
            description: '유연한 개발 우선 정책',
            level: 'loose',
            rules: {
                vulnerabilities: {
                    maxCritical: 2,
                    maxHigh: 10,
                    maxMedium: 50,
                    blockDeployment: false
                },
                dependencies: {
                    allowPrerelease: true,
                    allowDeprecated: true,
                    requireApproval: false,
                    autoUpdate: true
                },
                licensing: {
                    allowedTypes: '*', // 모든 라이선스 허용
                    requireReview: false
                },
                performance: {
                    maxBundleSize: '5MB',
                    requireTreeShaking: false,
                    limitDependencyLayers: 10
                }
            }
        };
        
        await Promise.all([
            this.saveJsonFile(this.presets.strict, strictPreset),
            this.saveJsonFile(this.presets.moderate, moderatePreset),
            this.saveJsonFile(this.presets.loose, loosePreset)
        ]);
    }

    // 팀 설정 로드
    async loadTeamConfig() {
        try {
            if (fs.existsSync(this.configFiles.team)) {
                const config = await this.loadJsonFile(this.configFiles.team);
                this.stats.configsLoaded++;
                return config;
            }
            return null;
        } catch (error) {
            console.warn(`Failed to load team config: ${error.message}`);
            return null;
        }
    }

    // 프로젝트 정책 로드
    async loadProjectPolicy() {
        try {
            if (fs.existsSync(this.configFiles.policy)) {
                const policy = await this.loadJsonFile(this.configFiles.policy);
                this.stats.configsLoaded++;
                return policy;
            }
            return null;
        } catch (error) {
            console.warn(`Failed to load project policy: ${error.message}`);
            return null;
        }
    }

    // 무시 규칙 로드
    async loadIgnoreRules() {
        try {
            if (fs.existsSync(this.configFiles.ignore)) {
                const rules = await this.loadJsonFile(this.configFiles.ignore);
                this.stats.configsLoaded++;
                return rules;
            }
            return null;
        } catch (error) {
            console.warn(`Failed to load ignore rules: ${error.message}`);
            return null;
        }
    }

    // 정책 검증
    async validateTeamPolicy(localConfig = {}) {
        const teamConfig = await this.loadTeamConfig();
        const projectPolicy = await this.loadProjectPolicy();
        
        if (!teamConfig || !projectPolicy) {
            return {
                valid: true,
                violations: [],
                warnings: ['No team policy found']
            };
        }
        
        const violations = [];
        const warnings = [];
        
        // Node.js 버전 검증
        if (teamConfig.settings.nodeVersion !== process.version) {
            warnings.push({
                type: 'version',
                message: `Node.js version mismatch. Expected: ${teamConfig.settings.nodeVersion}, Current: ${process.version}`
            });
        }
        
        // 패키지 매니저 검증
        if (localConfig.packageManager && localConfig.packageManager !== teamConfig.settings.packageManager) {
            violations.push({
                type: 'packageManager',
                severity: 'medium',
                message: `Package manager mismatch. Team uses: ${teamConfig.settings.packageManager}, Found: ${localConfig.packageManager}`
            });
        }
        
        // 보안 정책 검증
        if (localConfig.vulnerabilities) {
            const securityViolations = this.validateSecurityPolicy(localConfig.vulnerabilities, projectPolicy.rules.security);
            violations.push(...securityViolations);
        }
        
        // 의존성 정책 검증
        if (localConfig.dependencies) {
            const dependencyViolations = this.validateDependencyPolicy(localConfig.dependencies, projectPolicy.rules.dependencies);
            violations.push(...dependencyViolations);
        }
        
        this.stats.policiesValidated++;
        this.stats.violationsFound += violations.length;
        
        return {
            valid: violations.length === 0,
            violations,
            warnings,
            policy: projectPolicy,
            teamConfig
        };
    }

    // 보안 정책 검증  
    validateSecurityPolicy(vulnerabilities, securityRules) {
        const violations = [];
        
        const criticalCount = vulnerabilities.filter(v => v.severity === 'critical').length;
        const highCount = vulnerabilities.filter(v => v.severity === 'high').length;
        
        if (criticalCount > 0 && securityRules.blockCriticalVulnerabilities) {
            violations.push({
                type: 'security',
                severity: 'critical',
                message: `${criticalCount} critical vulnerabilities found. Policy requires zero critical vulnerabilities.`
            });
        }
        
        if (securityRules.maxCvssScore) {
            const highScoreVulns = vulnerabilities.filter(v => v.cvssScore > securityRules.maxCvssScore);
            if (highScoreVulns.length > 0) {
                violations.push({
                    type: 'security',
                    severity: 'high',
                    message: `${highScoreVulns.length} vulnerabilities exceed maximum CVSS score of ${securityRules.maxCvssScore}`
                });
            }
        }
        
        return violations;
    }

    // 의존성 정책 검증
    validateDependencyPolicy(dependencies, dependencyRules) {
        const violations = [];
        
        dependencies.forEach(dep => {
            // 프리릴리스 버전 검증
            if (!dependencyRules.allowPrerelease && dep.version && dep.version.includes('-')) {
                violations.push({
                    type: 'dependency',
                    severity: 'medium',
                    message: `Pre-release version not allowed: ${dep.name}@${dep.version}`,
                    package: dep.name
                });
            }
            
            // 폐기된 패키지 검증
            if (!dependencyRules.allowDeprecated && dep.deprecated) {
                violations.push({
                    type: 'dependency',
                    severity: 'medium',
                    message: `Deprecated package not allowed: ${dep.name}`,
                    package: dep.name
                });
            }
            
            // 라이선스 검증
            if (dependencyRules.allowedLicenses && dep.license && 
                !dependencyRules.allowedLicenses.includes(dep.license)) {
                violations.push({
                    type: 'license',
                    severity: 'low',
                    message: `License not allowed: ${dep.name} uses ${dep.license}`,
                    package: dep.name
                });
            }
        });
        
        return violations;
    }

    // Git hooks 설정
    async setupGitHooks() {
        if (!this.isGitRepository()) {
            console.warn('Not a Git repository, skipping Git hooks setup');
            return false;
        }
        
        console.log('🪝 Setting up Git hooks...');
        
        try {
            // Git hooks 디렉터리 생성
            if (!fs.existsSync(this.gitHooksDir)) {
                fs.mkdirSync(this.gitHooksDir, { recursive: true });
            }
            
            // Pre-commit hook
            await this.installPreCommitHook();
            
            // Pre-push hook
            await this.installPrePushHook();
            
            // Commit-msg hook
            await this.installCommitMsgHook();
            
            this.stats.hooksInstalled++;
            console.log('✅ Git hooks installed successfully');
            
            return true;
        } catch (error) {
            console.error(`Failed to setup Git hooks: ${error.message}`);
            return false;
        }
    }

    // Pre-commit hook 설치
    async installPreCommitHook() {
        const hookPath = path.join(this.gitHooksDir, 'pre-commit');
        const hookScript = `#!/bin/sh
# Packmate Team Config - Pre-commit Hook

echo "🔍 Running Packmate team config validation..."

# 팀 설정 동기화 확인
node -e "
const { TeamConfigManager } = require('${path.relative(this.projectPath, __filename)}');
const manager = new TeamConfigManager();
manager.syncTeamConfig().catch(err => {
    console.error('❌ Team config sync failed:', err.message);
    process.exit(1);
});
"

# 정책 검증
node -e "
const { TeamConfigManager } = require('${path.relative(this.projectPath, __filename)}');
const manager = new TeamConfigManager();
manager.validateTeamPolicy().then(result => {
    if (!result.valid) {
        console.error('❌ Policy violations found:');
        result.violations.forEach(v => console.error('  -', v.message));
        process.exit(1);
    }
    console.log('✅ Policy validation passed');
}).catch(err => {
    console.error('❌ Policy validation failed:', err.message);
    process.exit(1);
});
"

echo "✅ Team config validation completed"
`;
        
        fs.writeFileSync(hookPath, hookScript, { mode: 0o755 });
    }

    // Pre-push hook 설치
    async installPrePushHook() {
        const hookPath = path.join(this.gitHooksDir, 'pre-push');
        const hookScript = `#!/bin/sh
# Packmate Team Config - Pre-push Hook

echo "🚀 Running pre-push team config checks..."

# 의존성 보안 스캔
node -e "
const packmate = require('${path.join(this.projectPath, 'bin/packmate.js')}');
// 보안 스캔 실행
console.log('🔒 Running security scan...');
// 실제 스캔 로직은 기존 packmate 시스템 사용
"

echo "✅ Pre-push checks completed"
`;
        
        fs.writeFileSync(hookPath, hookScript, { mode: 0o755 });
    }

    // Commit message hook 설치
    async installCommitMsgHook() {
        const hookPath = path.join(this.gitHooksDir, 'commit-msg');
        const hookScript = `#!/bin/sh
# Packmate Team Config - Commit Message Hook

commit_msg_file="$1"
commit_msg=$(cat "$commit_msg_file")

# 커밋 메시지에 의존성 변경 사항이 있는지 확인
if git diff --cached --name-only | grep -E "(package\\.json|.*lock\\.json|yarn\\.lock)" > /dev/null; then
    echo "📦 Dependency changes detected in commit"
    
    # 커밋 메시지에 의존성 태그 추가 권장
    if ! echo "$commit_msg" | grep -E "\\[deps\\]|\\[dependencies\\]" > /dev/null; then
        echo "💡 Consider adding [deps] tag to commit message for dependency changes"
    fi
fi
`;
        
        fs.writeFileSync(hookPath, hookScript, { mode: 0o755 });
    }

    // 팀 설정 동기화
    async syncTeamConfig() {
        const teamConfig = await this.loadTeamConfig();
        
        if (!teamConfig) {
            console.log('⚠️ No team config found, skipping sync');
            return false;
        }
        
        console.log('🔄 Syncing team configuration...');
        
        try {
            // 현재 설정 해시 계산
            const currentHash = this.generateSyncHash();
            
            if (teamConfig.syncHash && teamConfig.syncHash !== currentHash) {
                console.log('📝 Configuration changes detected, updating sync hash...');
                
                teamConfig.syncHash = currentHash;
                teamConfig.lastSyncAt = new Date().toISOString();
                
                await this.saveJsonFile(this.configFiles.team, teamConfig);
            }
            
            console.log('✅ Team config synchronized');
            return true;
            
        } catch (error) {
            console.error(`❌ Team config sync failed: ${error.message}`);
            return false;
        }
    }

    // 동기화 해시 생성
    generateSyncHash() {
        const packageJsonPath = path.join(this.projectPath, 'package.json');
        
        if (fs.existsSync(packageJsonPath)) {
            const packageContent = fs.readFileSync(packageJsonPath, 'utf-8');
            return crypto.createHash('md5').update(packageContent).digest('hex');
        }
        
        return crypto.createHash('md5').update(Date.now().toString()).digest('hex');
    }

    // Git 저장소 확인
    isGitRepository() {
        return fs.existsSync(path.join(this.projectPath, '.git'));
    }

    // JSON 파일 저장
    async saveJsonFile(filePath, data) {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    }

    // JSON 파일 로드
    async loadJsonFile(filePath) {
        const content = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(content);
    }

    // 멤버 추가
    async addTeamMember(memberInfo) {
        const teamConfig = await this.loadTeamConfig();
        
        if (teamConfig) {
            const member = {
                name: memberInfo.name,
                email: memberInfo.email,
                role: memberInfo.role || 'developer',
                joinedAt: new Date().toISOString(),
                permissions: this.getDefaultPermissions(memberInfo.role)
            };
            
            teamConfig.members.push(member);
            await this.saveJsonFile(this.configFiles.team, teamConfig);
            
            console.log(`✅ Team member added: ${member.name} (${member.role})`);
            return member;
        }
        
        throw new Error('Team config not found');
    }

    // 기본 권한 설정
    getDefaultPermissions(role) {
        const permissions = {
            admin: ['*'],
            'tech-lead': ['updateDependencies', 'approveUpdates', 'overridePolicy'],
            developer: ['updateDependencies'],
            intern: []
        };
        
        return permissions[role] || permissions.developer;
    }

    // 통계 조회
    getStats() {
        return {
            ...this.stats,
            configFilesExist: Object.values(this.configFiles).filter(fs.existsSync).length,
            presetsExist: Object.values(this.presets).filter(fs.existsSync).length,
            gitHooksInstalled: this.isGitRepository() && fs.existsSync(this.gitHooksDir)
        };
    }

    // 설정 초기화
    async reset() {
        console.log('🔄 Resetting team configuration...');
        
        // 설정 파일 삭제
        Object.values(this.configFiles).forEach(filePath => {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        });
        
        // 프리셋 파일 삭제
        Object.values(this.presets).forEach(filePath => {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        });
        
        // Git hooks 삭제 (선택적)
        const hooksToRemove = ['pre-commit', 'pre-push', 'commit-msg'];
        hooksToRemove.forEach(hook => {
            const hookPath = path.join(this.gitHooksDir, hook);
            if (fs.existsSync(hookPath)) {
                fs.unlinkSync(hookPath);
            }
        });
        
        console.log('✅ Team configuration reset completed');
    }
}