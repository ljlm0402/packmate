/**
 * 통합 개선 시스템 컨트롤러
 * 모든 새로운 기능들을 기존 시스템과 통합
 */

import path from 'path';
import fs from 'fs';
import { PredictiveCacheEngine } from './predictive-cache.js';
import { CompressedCacheStore } from './compressed-cache.js';
import { WorkerPool } from './worker-pool.js';
import { AdvancedSecurityScanner } from './advanced-security-scanner.js';
import { AdvancedUI } from './advanced-ui.js';
import { loadConfig } from './config-loader.js';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class EnhancedPackmateController {
    constructor(options = {}) {
        this.config = loadConfig();
        this.projectPath = options.projectPath || process.cwd();
        this.cacheDir = path.join(this.projectPath, '.packmate');
        
        // UI 시스템
        this.ui = new AdvancedUI();
        
        // 캐시 시스템들
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
        
        // Worker Pool (패키지 워커 스크립트 사용)
        this.workerPool = new WorkerPool(
            path.join(__dirname, 'package-worker.js'),
            {
                maxWorkers: this.config.performance?.maxWorkers || 
                           Math.max(2, require('os').cpus().length - 1)
            }
        );
        
        // 고급 보안 스캐너
        this.securityScanner = new AdvancedSecurityScanner({
            useNpmAudit: this.config.security?.enableNpmAudit !== false,
            useOsvDatabase: this.config.security?.enableOsvDatabase !== false,
            useGitHubAdvisory: this.config.security?.enableGithubAdvisory !== false,
            cacheResults: this.config.security?.cacheResults !== false
        });
        
        this.stats = {
            sessionStartTime: Date.now(),
            operationsCount: 0,
            cacheHitRate: 0,
            securityScansPerformed: 0,
            packagesProcessed: 0,
            timesSaved: 0
        };
        
        this.ensureDirectories();
    }

    ensureDirectories() {
        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir, { recursive: true });
        }
    }

    // 메인 진입점 - 대화형 메뉴
    async start() {
        this.ui.intro('🚀 Enhanced Packmate v2.2.0');
        
        try {
            // 시스템 상태 확인
            await this.performSystemCheck();
            
            // 예측적 캐싱 준비
            await this.preparePredictiveCache();
            
            // 메인 루프
            let continueLoop = true;
            while (continueLoop) {
                const choice = await this.ui.showMainMenu();
                continueLoop = await this.handleMenuChoice(choice);
            }
            
        } catch (error) {
            console.error(`❌ Fatal error: ${error.message}`);
        } finally {
            await this.shutdown();
        }
    }

    async performSystemCheck() {
        console.log('🔍 Performing system check...');
        
        const checks = [
            { name: 'Worker Pool', fn: () => this.workerPool.isHealthy() },
            { name: 'Compressed Cache', fn: () => fs.existsSync(this.compressedCache.cacheDir) },
            { name: 'Predictive Cache', fn: () => fs.existsSync(this.predictiveCache.cacheDir) },
            { name: 'Security Scanner', fn: () => this.securityScanner !== null },
            { name: 'Project Structure', fn: () => fs.existsSync(path.join(this.projectPath, 'package.json')) }
        ];
        
        const results = [];
        for (const check of checks) {
            try {
                const passed = await check.fn();
                results.push({ name: check.name, passed });
                console.log(`${passed ? '✅' : '❌'} ${check.name}`);
            } catch (error) {
                results.push({ name: check.name, passed: false, error: error.message });
                console.log(`❌ ${check.name}: ${error.message}`);
            }
        }
        
        return results;
    }

    async preparePredictiveCache() {
        console.log('🧠 Initializing predictive caching...');
        
        try {
            // 현재 프로젝트 패키지 목록 가져오기
            const packageJson = JSON.parse(fs.readFileSync(path.join(this.projectPath, 'package.json'), 'utf-8'));
            const currentPackages = [
                ...Object.keys(packageJson.dependencies || {}),
                ...Object.keys(packageJson.devDependencies || {})
            ];
            
            // 예측적 캐싱 실행
            const predicted = this.predictiveCache.predictPackagesToCache(currentPackages);
            const prioritized = this.predictiveCache.prioritizedCacheList(predicted);
            
            if (prioritized.length > 0) {
                console.log(`🎯 Predicted ${prioritized.length} packages for caching`);
            }
            
            // 백그라운드에서 예측된 패키지들 캐시
            this.prepopulateCache(prioritized.slice(0, 10)); // 상위 10개만
            
        } catch (error) {
            console.warn(`Predictive cache preparation failed: ${error.message}`);
        }
    }

    async prepopulateCache(packages) {
        // 백그라운드에서 실행 (UI 블록하지 않음)
        Promise.allSettled(packages.map(async (pkg) => {
            try {
                const metadata = await this.compressedCache.get(`package-meta-${pkg}`);
                if (!metadata) {
                    // 실제 패키지 메타데이터 조회 로직이 있어야 함
                    // 여기서는 시뮬레이션
                    const fakeMetadata = { name: pkg, version: 'latest', cached: Date.now() };
                    await this.compressedCache.set(`package-meta-${pkg}`, fakeMetadata);
                }
            } catch (error) {
                console.warn(`Failed to prepopulate cache for ${pkg}: ${error.message}`);
            }
        })).then(() => {
            console.log('📦 Background cache population completed');
        });
    }

    async handleMenuChoice(choice) {
        this.stats.operationsCount++;
        
        try {
            switch (choice) {
                case 'analyze':
                    await this.runEnhancedAnalysis();
                    break;
                case 'security':
                    await this.runSecurityScan();
                    break;
                case 'optimize':
                    await this.performOptimization();
                    break;
                case 'cache-status':
                    await this.showCacheStatus();
                    break;
                case 'stats':
                    this.showStats();
                    break;
                case 'settings':
                    await this.configureSettings();
                    break;
                case 'exit':
                    return false;
                default:
                    console.log('Unknown choice');
            }
        } catch (error) {
            console.error(`Operation failed: ${error.message}`);
        }
        
        return true;
    }

    async runEnhancedAnalysis() {
        console.log('🔍 Running enhanced dependency analysis...');
        
        try {
            // Worker Pool을 사용한 병렬 분석
            const analysisPromises = [
                this.workerPool.execute('dependency-analysis', { projectPath: this.projectPath }),
                this.workerPool.execute('compatibility-check', { projectPath: this.projectPath }),
                this.workerPool.execute('performance-analysis', { projectPath: this.projectPath })
            ];
            
            const results = await Promise.allSettled(analysisPromises);
            
            console.log('✅ Enhanced analysis completed');
            console.log(results);
            
            // 결과를 압축 캐시에 저장
            await this.compressedCache.set('last-analysis', {
                results,
                timestamp: Date.now(),
                projectPath: this.projectPath
            });
            
            this.stats.packagesProcessed += this.extractPackageCount(results);
            
        } catch (error) {
            throw error;
        }
    }

    async runSecurityScan() {
        console.log('🛡️ Running comprehensive security scan...');
        
        try {
            const scanResult = await this.securityScanner.scanProject(this.projectPath, {
                includeDevDependencies: true,
                deepScan: this.config.security?.enableDeepScan || false
            });
            
            console.log('✅ Security scan completed');
            console.log(`Found ${scanResult.summary.total} vulnerabilities`);
            
            // 보안 결과 캐싱
            await this.securityScanner.cacheScanResult(this.projectPath, scanResult);
            this.stats.securityScansPerformed++;
            
        } catch (error) {
            throw error;
        }
    }

    async performOptimization() {
        console.log('⚡ Performing system optimization...');
        
        try {
            const optimizations = [];
            
            // 캐시 정리
            await this.compressedCache.cleanup();
            optimizations.push('Cache cleaned');
            
            // 예측 캐시 최적화
            await this.predictiveCache.saveUsageHistory();
            optimizations.push('Usage history optimized');
            
            // 보안 캐시 정리
            await this.securityScanner.cleanup();
            optimizations.push('Security cache cleaned');
            
            // Worker Pool 상태 최적화
            if (!this.workerPool.isHealthy()) {
                const stats = this.workerPool.getStats();
                if (stats.activeWorkers < 2) {
                    await this.workerPool.resize(Math.max(2, require('os').cpus().length - 1));
                    optimizations.push('Worker pool resized');
                }
            }
            
            console.log(`✅ Optimization completed: ${optimizations.join(', ')}`);
            
        } catch (error) {
            throw error;
        }
    }

    async showCacheStatus() {
        const cacheStats = await this.compressedCache.getCacheStats();
        const workerStats = this.workerPool.getStats();
        
        console.log('📊 Cache Status:');
        console.log('Compressed Cache:', cacheStats);
        console.log('Worker Pool:', workerStats);
        console.log('Predictive Cache:', {
            packagesTracked: Object.keys(this.predictiveCache.usageHistory.packages || {}).length,
            sessionsRecorded: (this.predictiveCache.usageHistory.sessions || []).length
        });
    }

    showStats() {
        const sessionDuration = Date.now() - this.stats.sessionStartTime;
        const statsDisplay = {
            ...this.stats,
            sessionDuration: Math.round(sessionDuration / 1000) + 's',
            averageOpTime: this.stats.operationsCount > 0 ? 
                Math.round(sessionDuration / this.stats.operationsCount) + 'ms' : 'N/A'
        };
        
        console.log('📈 Session Stats:', statsDisplay);
    }

    async configureSettings() {
        console.log('⚙️ Configuration settings would be displayed here');
        // 설정 변경 UI placeholder
    }

    extractPackageCount(results) {
        // 결과에서 패키지 개수 추출
        return results.reduce((count, result) => {
            if (result.status === 'fulfilled' && result.value?.packageCount) {
                return count + result.value.packageCount;
            }
            return count;
        }, 0);
    }

    // 시스템 종료 및 정리
    async shutdown() {
        console.log('🔄 Shutting down Enhanced Packmate...');
        
        try {
            // 모든 리소스 정리
            await Promise.all([
                this.workerPool.destroy(),
                this.compressedCache.flush(),
                this.predictiveCache.saveUsageHistory(),
                this.securityScanner.cleanup()
            ]);
            
            console.log('✅ Shutdown completed successfully');
        } catch (error) {
            console.error(`❌ Shutdown error: ${error.message}`);
        }
    }

    // 배치 모드 실행 (CLI용)
    async runBatch(commands) {
        for (const cmd of commands) {
            await this.handleMenuChoice(cmd);
        }
        await this.shutdown();
    }

    // 통합 헬스체크
    async healthCheck() {
        return {
            workerPool: this.workerPool.isHealthy(),
            cacheSystem: await this.compressedCache.isHealthy(),
            securityScanner: this.securityScanner !== null,
            overallHealth: true
        };
    }
}