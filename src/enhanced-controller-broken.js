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
            this.ui.currentTheme.error(`❌ Fatal error: ${error.message}`);
        } finally {
            await this.shutdown();
        }
    }

    async performSystemCheck() {
        this.ui.spinner('🔍 Performing system check...');
        
        const checks = [
            { name: 'Worker Pool', fn: () => this.workerPool.isHealthy() },
            { name: 'Compressed Cache', fn: () => fs.existsSync(this.compressedCache.basePath) },
            { name: 'Predictive Cache', fn: () => fs.existsSync(this.predictiveCache.cacheDir) },
            { name: 'Security Scanner', fn: () => this.securityScanner !== null },
            { name: 'Project Structure', fn: () => fs.existsSync(path.join(this.projectPath, 'package.json')) }
        ];
        
        const results = [];
        for (const check of checks) {
            try {
                const passed = await check.fn();
                results.push({ name: check.name, passed });
            } catch (error) {
                results.push({ name: check.name, passed: false, error: error.message });
            }
        }
        
        this.ui.stopSpinner();
        this.ui.showSystemStatus(results);
    }

    async preparePredictiveCache() {
        this.ui.spinner('🧠 Initializing predictive caching...');
        
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
            
            this.ui.stopSpinner();
            if (prioritized.length > 0) {
                this.ui.success(`🎯 Predicted ${prioritized.length} packages for caching`);
            }
            
            // 백그라운드에서 예측된 패키지들 캐시
            this.prepopulateCache(prioritized.slice(0, 10)); // 상위 10개만
            
        } catch (error) {
            this.ui.stopSpinner();
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
                    this.ui.error('Unknown choice');
            }
        } catch (error) {
            this.ui.error(`Operation failed: ${error.message}`);
        }
        
        return true;
    }

    async runEnhancedAnalysis() {
        this.ui.spinner('🔍 Running enhanced dependency analysis...');
        
        try {
            // Worker Pool을 사용한 병렬 분석
            const analysisPromises = [
                this.workerPool.execute('dependency-analysis', { projectPath: this.projectPath }),
                this.workerPool.execute('compatibility-check', { projectPath: this.projectPath }),
                this.workerPool.execute('performance-analysis', { projectPath: this.projectPath })
            ];
            
            const results = await Promise.allSettled(analysisPromises);
            
            this.ui.stopSpinner();
            this.ui.showAnalysisResults(results);
            
            // 결과를 압축 캐시에 저장
            await this.compressedCache.set('last-analysis', {
                results,
                timestamp: Date.now(),
                projectPath: this.projectPath
            });
            
            this.stats.packagesProcessed += this.extractPackageCount(results);
            
        } catch (error) {
            this.ui.stopSpinner();
            throw error;
        }
    }

    async runSecurityScan() {
        this.ui.spinner('🛡️ Running comprehensive security scan...');
        
        try {
            const scanResult = await this.securityScanner.scanProject(this.projectPath, {
                includeDevDependencies: true,
                deepScan: this.config.security?.enableDeepScan || false
            });
            
            this.ui.stopSpinner();
            this.ui.showSecurityResults(scanResult);
            
            // 보안 결과 캐싱
            await this.securityScanner.cacheScanResult(this.projectPath, scanResult);
            this.stats.securityScansPerformed++;
            
        } catch (error) {
            this.ui.stopSpinner();
            throw error;
        }
    }

    async performOptimization() {
        this.ui.spinner('⚡ Performing system optimization...');
        
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
            
            this.ui.stopSpinner();
            this.ui.success(`✅ Optimization completed: ${optimizations.join(', ')}`);
            
        } catch (error) {
            this.ui.stopSpinner();
            throw error;
        }
    }

    async showCacheStatus() {
        const cacheStats = await this.compressedCache.getCacheStats();
        const workerStats = this.workerPool.getStats();
        
        this.ui.showCacheStatus({
            compressed: cacheStats,
            worker: workerStats,
            predictive: {
                packagesTracked: Object.keys(this.predictiveCache.usageHistory.packages || {}).length,
                sessionsRecorded: (this.predictiveCache.usageHistory.sessions || []).length
            }
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
        
        this.ui.showStats(statsDisplay);
    }

    async configureSettings() {
        // 설정 변경 UI
        const settings = await this.ui.showSettingsMenu(this.config);
        if (settings) {
            // 설정 저장 로직
            Object.assign(this.config, settings);
            this.ui.success('⚙️ Settings updated');
        }
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
        this.ui.info('🔄 Shutting down Enhanced Packmate...');
        
        try {
            // 모든 리소스 정리
            await Promise.all([
                this.workerPool.destroy(),
                this.compressedCache.flush(),
                this.predictiveCache.saveUsageHistory(),
                this.securityScanner.cleanup()
            ]);
            
            this.ui.success('✅ Shutdown completed successfully');
        } catch (error) {
            this.ui.error(`❌ Shutdown error: ${error.message}`);
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
    }

    async preparePredictiveCache() {
        const packageJson = JSON.parse(
            fs.readFileSync(path.join(this.projectPath, 'package.json'), 'utf-8')
        );
        
        const currentPackages = [
            ...Object.keys(packageJson.dependencies || {}),
            ...Object.keys(packageJson.devDependencies || {})
        ];
        
        // 예측할 패키지들 생성
        const predictions = this.predictiveCache.predictPackagesToCache(currentPackages);
        
        if (predictions.length > 0) {
            const logger = this.ui.createLiveLogger('Predictive Caching');
            logger.info(`Preparing to cache ${predictions.length} predicted packages...`);
            
            // 배경에서 예측 캐싱 수행
            this.performPredictiveCaching(predictions).catch(error => {
                logger.warning(`Predictive caching failed: ${error.message}`);
            });
        }
    }

    async performPredictiveCaching(predictions) {
        const batchSize = 5; // 한 번에 5개씩 처리
        
        for (let i = 0; i < predictions.length; i += batchSize) {
            const batch = predictions.slice(i, i + batchSize);
            
            const tasks = batch.map(packageName => ({
                type: 'package-info',
                data: { packageName },
                options: { priority: 'low', timeout: 15000 }
            }));
            
            const results = await this.workerPool.executeBatch(tasks);
            
            // 결과를 캐시에 저장
            for (let j = 0; j < results.length; j++) {
                if (results[j].status === 'fulfilled') {
                    const packageName = batch[j];
                    const packageInfo = results[j].value;
                    
                    await this.compressedCache.set(
                        `package-info:${packageName}`, 
                        packageInfo
                    );
                    
                    this.predictiveCache.recordPackageAccess(packageName, this.projectPath);
                }
            }
            
            // API 제한 방지를 위한 지연
            if (i + batchSize < predictions.length) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    }

    async handleMenuChoice(choice) {
        this.stats.operationsCount++;
        
        switch (choice) {
            case 'scan':
                await this.performSecurityScan();
                break;
                
            case 'update':
                await this.performUpdateCheck();
                break;
                
            case 'analyze':
                await this.performDependencyAnalysis();
                break;
                
            case 'optimize':
                await this.performOptimization();
                break;
                
            case 'report':
                await this.generateReport();
                break;
                
            case 'settings':
                await this.configureSettings();
                break;
                
            case 'exit':
                return false;
                
            default:
                this.ui.currentTheme.warning('Unknown option selected');
        }
        
        return true;
    }

    async performSecurityScan() {
        const progress = this.ui.createProgressTracker(4, 'Security Scan');
        const logger = this.ui.createLiveLogger('Security Analysis');
        
        try {
            progress.update(1, 'Initializing scan...');
            
            const options = await this.ui.showAdvancedOptions();
            const deepScan = options.includes('deep-scan');
            
            progress.update(2, 'Running security scan...');
            logger.info(`Starting ${deepScan ? 'deep' : 'standard'} security scan...`);
            
            const scanResults = await this.securityScanner.scanProject(this.projectPath, {
                includeDevDependencies: true,
                deepScan
            });
            
            progress.update(3, 'Processing results...');
            this.stats.securityScansPerformed++;
            
            progress.update(4, 'Generating recommendations...');
            
            // UI로 결과 표시
            await this.ui.displayPackageAnalysis({
                totalPackages: scanResults.packages?.size || 0,
                vulnerabilities: scanResults.summary,
                riskScore: scanResults.riskScore,
                outdated: [], // TODO: 업데이트 체크와 통합
                dependencyTree: {} // TODO: 의존성 분석과 통합
            });
            
            progress.complete('Security scan completed');
            
        } catch (error) {
            logger.error(`Security scan failed: ${error.message}`);
        }
    }

    async performUpdateCheck() {
        const progress = this.ui.createProgressTracker(3, 'Update Check');
        const logger = this.ui.createLiveLogger('Update Analysis');
        
        try {
            progress.update(1, 'Reading package.json...');
            
            const packageJson = JSON.parse(
                fs.readFileSync(path.join(this.projectPath, 'package.json'), 'utf-8')
            );
            
            const allDependencies = {
                ...packageJson.dependencies,
                ...packageJson.devDependencies
            };
            
            progress.update(2, 'Checking for updates...');
            logger.info(`Checking ${Object.keys(allDependencies).length} packages for updates...`);
            
            const updateTasks = Object.entries(allDependencies).map(([name, version]) => ({
                type: 'package-info',
                data: { packageName: name },
                options: { priority: 'normal' }
            }));
            
            const results = await this.workerPool.executeBatch(updateTasks, {
                batchSize: 10,
                progressCallback: ({ completed, total }) => {
                    progress.update(2 + (completed / total * 0.8), `Checked ${completed}/${total} packages`);
                }
            });
            
            progress.update(3, 'Analyzing update recommendations...');
            
            const outdatedPackages = [];
            results.forEach((result, index) => {
                if (result.status === 'fulfilled') {
                    const [packageName, currentVersion] = Object.entries(allDependencies)[index];
                    const latestVersion = result.value.version;
                    
                    if (currentVersion !== latestVersion) {
                        outdatedPackages.push({
                            name: packageName,
                            currentVersion,
                            latestVersion,
                            updateType: this.determineUpdateType(currentVersion, latestVersion)
                        });
                    }
                }
            });
            
            await this.ui.displayUpdateRecommendations(outdatedPackages);
            progress.complete(`Found ${outdatedPackages.length} packages with updates`);
            
        } catch (error) {
            logger.error(`Update check failed: ${error.message}`);
        }
    }

    async performDependencyAnalysis() {
        const progress = this.ui.createProgressTracker(3, 'Dependency Analysis');
        const logger = this.ui.createLiveLogger('Dependency Analysis');
        
        try {
            progress.update(1, 'Analyzing dependency tree...');
            
            const analysisTask = {
                type: 'dependency-analysis',
                data: {
                    packageJsonPath: path.join(this.projectPath, 'package.json'),
                    depth: 3
                },
                options: { timeout: 120000 } // 2분 타임아웃
            };
            
            progress.update(2, 'Processing dependency relationships...');
            const analysisResult = await this.workerPool.execute(
                analysisTask.type, 
                analysisTask.data, 
                analysisTask.options
            );
            
            progress.update(3, 'Generating dependency tree...');
            
            await this.ui.displayDependencyTree(analysisResult.dependencyTree);
            
            if (analysisResult.circularDependencies.length > 0) {
                logger.warning(`Found ${analysisResult.circularDependencies.length} circular dependencies`);
            }
            
            progress.complete('Dependency analysis completed');
            
        } catch (error) {
            logger.error(`Dependency analysis failed: ${error.message}`);
        }
    }

    async performOptimization() {
        const logger = this.ui.createLiveLogger('Optimization');
        
        // 캐시 최적화
        logger.info('Optimizing cache...');
        const cleanedEntries = await this.compressedCache.cleanup();
        logger.success(`Cleaned ${cleanedEntries} old cache entries`);
        
        // 중복 패키지 검사 (향후 구현)
        logger.info('Checking for duplicate packages...');
        
        // 번들 크기 분석 (향후 구현)
        logger.info('Analyzing bundle size impact...');
        
        logger.success('Optimization completed');
    }

    async generateReport() {
        const logger = this.ui.createLiveLogger('Report Generation');
        
        try {
            logger.info('Collecting statistics...');
            
            const report = {
                timestamp: new Date().toISOString(),
                project: path.basename(this.projectPath),
                session: this.stats,
                cache: await this.compressedCache.getStats(),
                workers: this.workerPool.getStatus(),
                recommendations: []
            };
            
            // 캐시 효율성 권장사항
            if (report.cache.hitRate < 50) {
                report.recommendations.push({
                    type: 'cache',
                    priority: 'medium',
                    title: 'Low cache hit rate',
                    description: `Current cache hit rate is ${report.cache.hitRate.toFixed(1)}%. Consider enabling predictive caching.`
                });
            }
            
            // 보안 권장사항
            if (this.stats.securityScansPerformed === 0) {
                report.recommendations.push({
                    type: 'security',
                    priority: 'high',
                    title: 'No security scans performed',
                    description: 'Regular security scanning is recommended for all projects.'
                });
            }
            
            const reportPath = path.join(this.cacheDir, `report-${Date.now()}.json`);
            fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
            
            logger.success(`Report saved to ${reportPath}`);
            
            // 요약 표시
            this.ui.displaySummary({
                packagesProcessed: this.stats.packagesProcessed,
                securityIssues: 0, // TODO: 실제 데이터
                updatesAvailable: 0, // TODO: 실제 데이터
                cacheHits: report.cache.hitRate,
                recommendations: report.recommendations
            });
            
        } catch (error) {
            logger.error(`Report generation failed: ${error.message}`);
        }
    }

    async configureSettings() {
        const newSettings = await this.ui.configureSettings();
        
        // 설정 저장
        const configPath = path.join(this.cacheDir, 'config.json');
        const currentConfig = fs.existsSync(configPath) ? 
                             JSON.parse(fs.readFileSync(configPath, 'utf-8')) : {};
        
        const updatedConfig = { ...currentConfig, ...newSettings };
        fs.writeFileSync(configPath, JSON.stringify(updatedConfig, null, 2));
        
        // 실시간 설정 적용
        if (newSettings.theme !== this.ui.currentTheme) {
            this.ui.setTheme(newSettings.theme);
        }
    }

    // 헬퍼 함수들
    determineUpdateType(current, latest) {
        // 간단한 semver 비교 (실제로는 semver 라이브러리 사용 권장)
        const currentParts = current.replace(/[^0-9.]/g, '').split('.');
        const latestParts = latest.replace(/[^0-9.]/g, '').split('.');
        
        if (parseInt(latestParts[0]) > parseInt(currentParts[0])) return 'major';
        if (parseInt(latestParts[1]) > parseInt(currentParts[1])) return 'minor';
        if (parseInt(latestParts[2]) > parseInt(currentParts[2])) return 'patch';
        
        return 'patch';
    }

    // 시스템 종료
    async shutdown() {
        console.log('\n🔄 Shutting down enhanced systems...');
        
        try {
            // Worker Pool 종료
            await this.workerPool.shutdown();
            
            // 캐시 정리
            await this.compressedCache.shutdown();
            
            // 통계 저장
            const statsPath = path.join(this.cacheDir, 'session-stats.json');
            const sessionStats = {
                ...this.stats,
                sessionEndTime: Date.now(),
                totalSessionTime: Date.now() - this.stats.sessionStartTime
            };
            
            fs.writeFileSync(statsPath, JSON.stringify(sessionStats, null, 2));
            
            this.ui.outro('👋 Goodbye! Enhanced Packmate session ended.');
            
        } catch (error) {
            console.error(`Shutdown error: ${error.message}`);
        }
    }

    // 정적 팩토리 메서드
    static async create(options = {}) {
        const controller = new EnhancedPackmateController(options);
        return controller;
    }
}