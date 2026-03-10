/**
 * Enhanced Packmate Controller v2.2.0
 * Phase 1: 고급 기능 통합 및 성능 최적화 (완료)
 * Phase 2: 분석 & 협업 강화 (완료)
 */

import path from 'path';
import fs from 'fs';
import os from 'os';
import { PredictiveCacheEngine } from './predictive-cache.js';
import { CompressedCacheStore } from './compressed-cache.js';
import { WorkerPool } from './worker-pool.js';
import { AdvancedSecurityScanner } from './advanced-security-scanner.js';
import { AdvancedUI } from './advanced-ui.js';
import { SimpleUI } from './simple-ui.js';
import { AdvancedAnalyzer } from './advanced-analysis.js';
import { TeamConfigManager } from './team-config-manager.js';
import { PolicyValidationEngine } from './policy-validation-engine.js';
import { loadConfig } from './config-loader.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class EnhancedPackmateController {
    constructor(options = {}) {
        this.config = loadConfig();
        this.projectPath = options.projectPath || process.cwd();
        this.cacheDir = path.join(this.projectPath, '.packmate');
        
        // UI 시스템
        // Enhanced UI with full AdvancedUI compatibility
        this.ui = new SimpleUI();
        
        // Phase 1: 캐시 및 성능 최적화
        this.compressedCache = new CompressedCacheStore(
            path.join(this.cacheDir, 'compressed'),
            {
                compressionLevel: this.config.cache?.compressionLevel || 6,
                useMessagePack: this.config.cache?.useMessagePack || false
            }
        );
        
        this.predictiveCache = new PredictiveCacheEngine(
            path.join(this.cacheDir, 'predictive')
        );
        
        // Worker Pool for parallel processing (simplified for testing)
        this.workerPool = new WorkerPool(
            path.join(__dirname, 'package-worker-simple.js'),
            {
                maxWorkers: this.config.performance?.maxWorkers || 2 // 더 작은 수로 테스트
            }
        );
        
        this.securityScanner = new AdvancedSecurityScanner({
            enableOSV: this.config.security?.enableOSV !== false,
            enableGithubAdvisory: this.config.security?.enableGithubAdvisory !== false,
            cacheDir: path.join(this.cacheDir, 'security'),
            timeout: this.config.security?.timeout || 30000
        });
        
        // Phase 2: 분석 & 협업 강화
        this.analyzer = new AdvancedAnalyzer({
            projectPath: this.projectPath,
            cacheDir: path.join(this.cacheDir, 'analysis')
        });
        
        this.teamConfig = new TeamConfigManager(this.projectPath);
        
        this.policyEngine = new PolicyValidationEngine(this.teamConfig, {
            strictMode: this.config.team?.strictMode || false,
            allowOverrides: this.config.team?.allowOverrides !== false,
            logViolations: this.config.team?.logViolations !== false,
            autoFix: this.config.team?.autoFix || false
        });
        
        this.stats = {
            enhancedOperations: 0,
            cacheHits: 0,
            securityScansRun: 0,
            workerTasksCompleted: 0,
            analysisRuns: 0,
            policyValidationsRun: 0,
            teamSyncs: 0
        };
        
        this.initialized = false;
        this.healthy = true;
        this.lastHealthCheck = null;
        
        this.ensureDirectories();
    }

    ensureDirectories() {
        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir, { recursive: true });
        }
        
        // Predictive cache directory 생성
        const predictiveCacheDir = path.join(this.cacheDir, 'predictive');
        if (!fs.existsSync(predictiveCacheDir)) {
            fs.mkdirSync(predictiveCacheDir, { recursive: true });
        }
        
        // Security cache directory 생성
        const securityCacheDir = path.join(this.cacheDir, 'security');
        if (!fs.existsSync(securityCacheDir)) {
            fs.mkdirSync(securityCacheDir, { recursive: true });
        }
        
        // Analysis cache directory 생성
        const analysisCacheDir = path.join(this.cacheDir, 'analysis');
        if (!fs.existsSync(analysisCacheDir)) {
            fs.mkdirSync(analysisCacheDir, { recursive: true });
        }
    }

    // 메인 진입점 - 대화형 메뉴
    async start() {
        this.ui.intro('🚀 Enhanced Packmate v2.2.0 - Phase 2 Complete');
        
        try {
            await this.performSystemCheck();
            await this.initializeTeamConfig();
            await this.preparePredictiveCache();
            
            let continueLoop = true;
            while (continueLoop) {
                const choice = await this.ui.showEnhancedMainMenu();
                continueLoop = await this.handleMenuChoice(choice);
            }
            
        } catch (error) {
            console.error(`❌ Fatal error: ${error.message}`);
        } finally {
            await this.shutdown();
        }
    }

    // Phase 1 + Phase 2 통합 시스템 상태 확인
    async performSystemCheck() {
        console.log('🔍 Performing comprehensive system check...');
        
        const checks = [
            { name: 'Worker Pool', fn: () => this.workerPool ? this.workerPool.isHealthy() : true },
            { name: 'Compressed Cache', fn: async () => this.compressedCache.isHealthy() },
            { name: 'Predictive Cache', fn: () => fs.existsSync(this.predictiveCache.cacheDir) },
            { name: 'Security Scanner', fn: () => this.securityScanner !== null },
            { name: 'Advanced Analyzer', fn: () => this.analyzer !== null },
            { name: 'Team Config', fn: () => this.teamConfig !== null },
            { name: 'Policy Engine', fn: () => this.policyEngine !== null },
            { name: 'Project Structure', fn: () => fs.existsSync(path.join(this.projectPath, 'package.json')) }
        ];

        let allHealthy = true;
        
        for (const check of checks) {
            try {
                const result = await check.fn();
                const status = result ? '✅' : '❌';
                console.log(`  ${status} ${check.name}`);
                if (!result) allHealthy = false;
            } catch (error) {
                console.log(`  ❌ ${check.name}: ${error.message}`);
                allHealthy = false;
            }
        }
        
        this.healthy = allHealthy;
        this.lastHealthCheck = new Date();
        
        console.log(`\n${allHealthy ? '✅' : '⚠️'} System status: ${allHealthy ? 'Healthy' : 'Issues detected'}\n`);
    }

    // 팀 설정 초기화
    async initializeTeamConfig() {
        console.log('🏢 Initializing team configuration...');
        
        try {
            const hasTeamConfig = await this.teamConfig.hasTeamConfig();
            
            if (!hasTeamConfig) {
                console.log('⚠️ No team config found. Setting up...');
                await this.teamConfig.createDefaultConfig();
            }
            
            // Git hooks 설정
            await this.teamConfig.setupGitHooks();
            
            console.log('✅ Team configuration ready');
        } catch (error) {
            console.warn(`⚠️ Team config initialization failed: ${error.message}`);
        }
    }

    // 예측적 캐싱 준비
    async preparePredictiveCache() {
        console.log('🧠 Preparing predictive cache...');
        await this.predictiveCache.warmup();
        console.log('✅ Predictive cache ready');
    }

    // Phase 2 고급 분석 실행
    async runAdvancedAnalysis() {
        console.log('🔬 Running advanced project analysis...');
        
        try {
            const analysisResult = await this.analyzer.analyzeProject({
                analyzeTypeScript: true,
                analyzeConfigs: true,
                analyzeDynamicImports: true,
                generateRecommendations: true
            });
            
            // 정책 검증 실행
            const validationResult = await this.policyEngine.validate(analysisResult);
            
            this.stats.analysisRuns++;
            this.stats.policyValidationsRun++;
            
            return {
                analysis: analysisResult,
                validation: validationResult,
                timestamp: new Date().toISOString()
            };
            
        } catch (error) {
            console.error(`❌ Analysis failed: ${error.message}`);
            throw error;
        }
    }

    // 팀 정책 강화 분석
    async analyzeWithTeamPolicy() {
        console.log('👥 Analyzing project with team policy...');
        
        const result = await this.runAdvancedAnalysis();
        
        // 결과 표시
        this.displayAnalysisResults(result);
        
        return result;
    }

    // 분석 결과 표시
    displayAnalysisResults(result) {
        const { analysis, validation } = result;
        
        console.log('\n📊 Analysis Results:');
        console.log(`  📦 Packages analyzed: ${analysis.packages?.length || 0}`);
        console.log(`  🔧 Config files found: ${analysis.configFiles?.length || 0}`);
        console.log(`  🎯 TypeScript patterns: ${analysis.typescriptPatterns?.length || 0}`);
        console.log(`  ⚡ Dynamic imports: ${analysis.dynamicImports?.length || 0}`);
        
        console.log('\n🛡️ Policy Validation:');
        console.log(`  🚨 Violations: ${validation.summary.totalViolations}`);
        console.log(`  ⚠️ Warnings: ${validation.summary.warnings}`);
        console.log(`  🔧 Fixable: ${validation.summary.fixableViolations}`);
        
        if (validation.violations.length > 0) {
            console.log('\n❌ Policy Violations:');
            validation.violations.slice(0, 5).forEach(v => {
                console.log(`  • ${v.severity.toUpperCase()}: ${v.message}`);
            });
            
            if (validation.violations.length > 5) {
                console.log(`  ... and ${validation.violations.length - 5} more`);
            }
        }
        
        if (validation.fixableViolations.length > 0) {
            console.log('\n🔧 Auto-fixable Issues:');
            validation.fixableViolations.slice(0, 3).forEach(v => {
                console.log(`  • ${v.message}`);
            });
        }
    }

    // 팀 동기화
    async syncTeamConfig() {
        console.log('🔄 Synchronizing with team configuration...');
        
        try {
            const syncResult = await this.teamConfig.syncTeamConfig();
            this.stats.teamSyncs++;
            
            if (syncResult.conflicts && syncResult.conflicts.length > 0) {
                console.log('⚠️ Conflicts detected during sync:');
                syncResult.conflicts.forEach(conflict => {
                    console.log(`  • ${conflict.path}: ${conflict.description}`);
                });
            } else {
                console.log('✅ Team configuration synchronized successfully');
            }
            
            return syncResult;
        } catch (error) {
            console.error(`❌ Team sync failed: ${error.message}`);
            throw error;
        }
    }

    // 향상된 메인 메뉴 처리
    async handleMenuChoice(choice) {
        try {
            this.stats.enhancedOperations++;
            
            switch (choice) {
                case 'analyze-advanced':
                    await this.analyzeWithTeamPolicy();
                    break;
                    
                case 'security-scan':
                    await this.runEnhancedSecurityScan();
                    break;
                    
                case 'team-sync':
                    await this.syncTeamConfig();
                    break;
                    
                case 'policy-check':
                    await this.runStandalonePolicyCheck();
                    break;
                    
                case 'cache-optimize':
                    await this.optimizeCache();
                    break;
                    
                case 'health-check':
                    await this.performSystemCheck();
                    break;
                    
                case 'team-setup':
                    await this.setupTeamConfiguration();
                    break;
                    
                case 'statistics':
                    this.displayStatistics();
                    break;
                    
                case 'exit':
                    return false;
                    
                default:
                    console.log('Invalid choice. Please try again.');
            }
            
            return true;
        } catch (error) {
            console.error(`❌ Operation failed: ${error.message}`);
            return true;
        }
    }

    // 향상된 보안 스캔
    async runEnhancedSecurityScan() {
        console.log('🛡️ Running enhanced security scan...');
        
        const scanResult = await this.securityScanner.scanProject();
        this.stats.securityScansRun++;
        
        // 팀 정책과 함께 검증
        const policyResult = await this.policyEngine.validate({
            vulnerabilities: scanResult.vulnerabilities,
            packages: scanResult.packages
        });
        
        console.log(`\n🔍 Security Scan Complete:`);
        console.log(`  📦 Packages scanned: ${scanResult.packagesScanned}`);
        console.log(`  🚨 Vulnerabilities: ${scanResult.vulnerabilities?.length || 0}`);
        console.log(`  ⚠️ Policy violations: ${policyResult.summary.totalViolations}`);
        
        return { scan: scanResult, policy: policyResult };
    }

    // 독립 정책 검증
    async runStandalonePolicyCheck() {
        console.log('📋 Running policy compliance check...');
        
        const analysisData = {
            packages: await this.getPackageList(),
            vulnerabilities: []
        };
        
        const result = await this.policyEngine.validate(analysisData);
        this.stats.policyValidationsRun++;
        
        console.log(`\n✅ Policy Check Complete:`);
        console.log(`  📊 Rules evaluated: ${result.stats.rulesEvaluated}`);
        console.log(`  🚨 Violations: ${result.summary.totalViolations}`);
        console.log(`  💡 Auto-fixable: ${result.summary.fixableViolations}`);
        
        return result;
    }

    // 캐시 최적화
    async optimizeCache() {
        console.log('🗂️ Optimizing cache systems...');
        
        try {
            // 압축 캐시 정리
            await this.compressedCache.cleanup();
            
            // 예측적 캐시 최적화
            await this.predictiveCache.optimize();
            
            // 캐시 통계 업데이트
            const cacheStats = await this.compressedCache.getCacheStats();
            
            console.log('✅ Cache optimization complete:');
            console.log(`  💾 Cache size: ${(cacheStats.totalSize / 1024 / 1024).toFixed(2)}MB`);
            console.log(`  📈 Hit rate: ${cacheStats.hitRate.toFixed(1)}%`);
            
        } catch (error) {
            console.error(`❌ Cache optimization failed: ${error.message}`);
        }
    }

    // 팀 설정 구성
    async setupTeamConfiguration() {
        console.log('⚙️ Setting up team configuration...');
        
        try {
            // 대화형 설정
            const preset = await this.ui.selectPreset();
            await this.teamConfig.initializeWithPreset(preset);
            
            console.log('✅ Team configuration setup complete');
        } catch (error) {
            console.error(`❌ Team setup failed: ${error.message}`);
        }
    }

    // 통계 표시
    displayStatistics() {
        console.log('\n📊 Enhanced Packmate Statistics:');
        console.log(`  🚀 Operations: ${this.stats.enhancedOperations}`);
        console.log(`  💾 Cache hits: ${this.stats.cacheHits}`);
        console.log(`  🛡️ Security scans: ${this.stats.securityScansRun}`);
        console.log(`  ⚡ Worker tasks: ${this.stats.workerTasksCompleted}`);
        console.log(`  🔬 Analysis runs: ${this.stats.analysisRuns}`);
        console.log(`  📋 Policy validations: ${this.stats.policyValidationsRun}`);
        console.log(`  🔄 Team syncs: ${this.stats.teamSyncs}`);
        console.log(`  🏥 System health: ${this.healthy ? 'Healthy' : 'Issues'}`);
        
        if (this.lastHealthCheck) {
            console.log(`  📅 Last health check: ${this.lastHealthCheck.toLocaleString()}`);
        }
    }

    // 패키지 목록 가져오기
    async getPackageList() {
        try {
            const packageJsonPath = path.join(this.projectPath, 'package.json');
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
            
            const packages = [];
            
            // Dependencies
            if (packageJson.dependencies) {
                Object.entries(packageJson.dependencies).forEach(([name, version]) => {
                    packages.push({ name, version, type: 'dependency' });
                });
            }
            
            // DevDependencies
            if (packageJson.devDependencies) {
                Object.entries(packageJson.devDependencies).forEach(([name, version]) => {
                    packages.push({ name, version, type: 'devDependency' });
                });
            }
            
            return packages;
        } catch (error) {
            console.warn(`Could not read package.json: ${error.message}`);
            return [];
        }
    }

    // 정상 종료
    async shutdown() {
        console.log('\n🔄 Shutting down Enhanced Packmate...');
        
        try {
            // Worker pool 종료
            if (this.workerPool) {
                await this.workerPool.destroy();
            }
            
            // 캐시 정리
            if (this.compressedCache) {
                await this.compressedCache.destroy();
            }
            
            console.log('✅ Shutdown complete');
        } catch (error) {
            console.error(`⚠️ Error during shutdown: ${error.message}`);
        }
    }

    // 헬스체크
    async healthCheck() {
        return {
            healthy: this.healthy,
            lastCheck: this.lastHealthCheck,
            stats: this.stats,
            version: '2.2.0',
            phase: 'Phase 2 Complete'
        };
    }
}