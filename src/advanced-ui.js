/**
 * 고급 사용자 인터페이스
 * 실시간 진행률, 상세 분석, 대화형 선택 옵션
 */

import chalk from 'chalk';
import { intro, outro, text, select, multiselect, confirm, spinner, note, cancel } from '@clack/prompts';
import { setTimeout as delay } from 'timers/promises';

export class AdvancedUI {
    constructor() {
        this.activeSpinners = new Map();
        this.currentStep = 0;
        this.totalSteps = 0;
        this.startTime = Date.now();
        
        this.themes = {
            default: {
                primary: chalk.cyan,
                secondary: chalk.gray,
                success: chalk.green,
                warning: chalk.yellow,
                error: chalk.red,
                info: chalk.blue,
                highlight: chalk.magenta
            },
            dark: {
                primary: chalk.blueBright,
                secondary: chalk.whiteBright,
                success: chalk.greenBright,
                warning: chalk.yellowBright,
                error: chalk.redBright,
                info: chalk.cyanBright,
                highlight: chalk.magentaBright
            }
        };
        
        this.currentTheme = this.themes.default;
    }

    // 인트로 메시지 표시
    intro(title) {
        intro(this.currentTheme.highlight(title));
    }

    // 아웃트로 메시지 표시  
    outro(title) {
        outro(this.currentTheme.highlight(title));
    }

    // 진행률 추적기
    createProgressTracker(totalSteps, title = 'Processing') {
        this.totalSteps = totalSteps;
        this.currentStep = 0;
        this.startTime = Date.now();
        
        return {
            update: (step, description = '') => this.updateProgress(step, description),
            increment: (description = '') => this.incrementProgress(description),
            complete: (message = 'Complete!') => this.completeProgress(message)
        };
    }

    updateProgress(step, description = '') {
        this.currentStep = step;
        const percentage = Math.round((step / this.totalSteps) * 100);
        const elapsed = Date.now() - this.startTime;
        const estimatedTotal = elapsed / (step / this.totalSteps);
        const remaining = Math.max(0, estimatedTotal - elapsed);
        
        const progressBar = this.createProgressBar(percentage);
        const timeInfo = this.formatTime(remaining);
        
        process.stdout.write(`\r${progressBar} ${percentage}% | ${description} | ETA: ${timeInfo}`);
    }

    incrementProgress(description = '') {
        this.updateProgress(this.currentStep + 1, description);
    }

    completeProgress(message) {
        const totalTime = Date.now() - this.startTime;
        process.stdout.write(`\r${this.currentTheme.success('✅')} ${message} | Completed in ${this.formatTime(totalTime)}\n`);
    }

    createProgressBar(percentage, width = 20) {
        const filled = Math.round((percentage / 100) * width);
        const empty = width - filled;
        const bar = this.currentTheme.primary('█'.repeat(filled)) + 
                    this.currentTheme.secondary('░'.repeat(empty));
        return `[${bar}]`;
    }

    formatTime(milliseconds) {
        const seconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(seconds / 60);
        
        if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        }
        return `${seconds}s`;
    }

    // 고급 패키지 분석 디스플레이
    async displayPackageAnalysis(analysis) {
        intro(this.currentTheme.highlight('📊 Package Analysis Results'));
        
        // 기본 통계
        const stats = `
${this.currentTheme.info('📦 Packages:')} ${analysis.totalPackages}
${this.currentTheme.info('🔒 Security Issues:')} ${analysis.vulnerabilities.total}
${this.currentTheme.info('📈 Outdated:')} ${analysis.outdated.length}
${this.currentTheme.info('💾 Total Size:')} ${this.formatFileSize(analysis.totalSize)}
${this.currentTheme.info('⚡ Risk Score:')} ${this.getRiskScoreColor(analysis.riskScore)}${analysis.riskScore}/100
        `.trim();
        
        note(stats, 'Summary');
        
        // 취약점 상세 정보
        if (analysis.vulnerabilities.total > 0) {
            await this.displayVulnerabilityDetails(analysis.vulnerabilities);
        }
        
        // 업데이트 권장사항
        if (analysis.outdated.length > 0) {
            await this.displayUpdateRecommendations(analysis.outdated);
        }
        
        // 의존성 트리 (선택적)
        const showDependencyTree = await confirm({
            message: 'Would you like to see the dependency tree?'
        });
        
        if (showDependencyTree) {
            await this.displayDependencyTree(analysis.dependencyTree);
        }
    }

    async displayVulnerabilityDetails(vulnerabilities) {
        const { critical, high, moderate, low, details } = vulnerabilities;
        
        let vulnSummary = '🔒 Security Vulnerabilities:\n\n';
        
        if (critical > 0) vulnSummary += `${this.currentTheme.error('⚠️  Critical:')} ${critical}\n`;
        if (high > 0) vulnSummary += `${this.currentTheme.error('🔥 High:')} ${high}\n`;
        if (moderate > 0) vulnSummary += `${this.currentTheme.warning('⚠️  Moderate:')} ${moderate}\n`;
        if (low > 0) vulnSummary += `${this.currentTheme.info('🔍 Low:')} ${low}\n`;
        
        note(vulnSummary.trim(), 'Vulnerabilities Found');
        
        // 상위 취약점 표시
        const topVulnerabilities = details
            .sort((a, b) => this.getSeverityWeight(b.severity) - this.getSeverityWeight(a.severity))
            .slice(0, 5);
        
        if (topVulnerabilities.length > 0) {
            console.log(this.currentTheme.highlight('\n🔍 Top Vulnerabilities:'));
            
            topVulnerabilities.forEach((vuln, index) => {
                const severityIcon = this.getSeverityIcon(vuln.severity);
                const severityColor = this.getSeverityColor(vuln.severity);
                
                console.log(`\n${index + 1}. ${severityColor(severityIcon + ' ' + vuln.title)}`);
                console.log(`   ${this.currentTheme.secondary(`Package: ${vuln.package}`)}`);
                console.log(`   ${this.currentTheme.secondary(`Severity: ${vuln.severity.toUpperCase()}`)}`);
                
                if (vuln.fixedIn) {
                    console.log(`   ${this.currentTheme.success(`Fixed in: ${vuln.fixedIn}`)}`);
                }
                if (vuln.url) {
                    console.log(`   ${this.currentTheme.info(`More info: ${vuln.url}`)}`);
                }
            });
        }
        
        // 수정 가능한 취약점 처리 옵션
        const fixableVulns = details.filter(v => v.fixedIn);
        if (fixableVulns.length > 0) {
            const shouldFix = await confirm({
                message: `Found ${fixableVulns.length} fixable vulnerabilities. Apply fixes now?`
            });
            
            if (shouldFix) {
                return { action: 'fix', packages: fixableVulns.map(v => v.package) };
            }
        }
        
        return { action: 'none' };
    }

    async displayUpdateRecommendations(outdatedPackages) {
        console.log(this.currentTheme.highlight('\n📈 Update Recommendations:'));
        
        // 업데이트 타입별 분류
        const updateTypes = {
            major: outdatedPackages.filter(p => p.updateType === 'major'),
            minor: outdatedPackages.filter(p => p.updateType === 'minor'),
            patch: outdatedPackages.filter(p => p.updateType === 'patch')
        };
        
        Object.entries(updateTypes).forEach(([type, packages]) => {
            if (packages.length === 0) return;
            
            const typeColor = type === 'major' ? this.currentTheme.warning : 
                              type === 'minor' ? this.currentTheme.info : 
                              this.currentTheme.success;
            
            console.log(`\n${typeColor(type.charAt(0).toUpperCase() + type.slice(1))} updates (${packages.length}):`);
            
            packages.slice(0, 10).forEach(pkg => { // 최대 10개만 표시
                const arrow = this.currentTheme.secondary(' → ');
                console.log(`  ${pkg.name}: ${pkg.currentVersion}${arrow}${typeColor(pkg.latestVersion)}`);
            });
            
            if (packages.length > 10) {
                console.log(`  ${this.currentTheme.secondary(`... and ${packages.length - 10} more`)}`);
            }
        });
        
        // 일괄 업데이트 옵션
        const updateOptions = await multiselect({
            message: 'Select update types to apply:',
            options: [
                { value: 'patch', label: `Patch updates (${updateTypes.patch.length}) - Safe` },
                { value: 'minor', label: `Minor updates (${updateTypes.minor.length}) - Usually safe` },
                { value: 'major', label: `Major updates (${updateTypes.major.length}) - May have breaking changes` }
            ]
        });
        
        return { selectedUpdateTypes: updateOptions };
    }

    async displayDependencyTree(dependencyTree, maxDepth = 3) {
        console.log(this.currentTheme.highlight('\n🌳 Dependency Tree:'));
        
        const displayNode = (node, depth = 0, prefix = '', isLast = true) => {
            if (depth > maxDepth) return;
            
            const connector = isLast ? '└── ' : '├── ';
            const nodePrefix = depth === 0 ? '' : prefix + connector;
            const childPrefix = depth === 0 ? '' : prefix + (isLast ? '    ' : '│   ');
            
            // 패키지 정보
            let nodeInfo = nodePrefix + this.currentTheme.primary(node.name);
            if (node.version) {
                nodeInfo += this.currentTheme.secondary(` @${node.version}`);
            }
            
            // 상태 표시
            if (node.isOutdated) {
                nodeInfo += this.currentTheme.warning(' (outdated)');
            }
            if (node.hasVulnerabilities) {
                nodeInfo += this.currentTheme.error(' (vulnerable)');
            }
            if (node.size) {
                nodeInfo += this.currentTheme.info(` [${this.formatFileSize(node.size)}]`);
            }
            
            console.log(nodeInfo);
            
            // 하위 의존성들
            if (node.dependencies) {
                const deps = Object.entries(node.dependencies);
                deps.forEach(([depName, depInfo], index) => {
                    const isLastChild = index === deps.length - 1;
                    displayNode(
                        { name: depName, ...depInfo }, 
                        depth + 1, 
                        childPrefix, 
                        isLastChild
                    );
                });
            }
        };
        
        Object.entries(dependencyTree).forEach(([name, info], index, arr) => {
            const isLast = index === arr.length - 1;
            displayNode({ name, ...info }, 0, '', isLast);
        });
    }

    // 대화형 메뉴 시스템
    async showMainMenu() {
        const choice = await select({
            message: 'What would you like to do?',
            options: [
                { value: 'scan', label: '🔍 Run security scan' },
                { value: 'update', label: '📈 Check for updates' },
                { value: 'analyze', label: '📊 Analyze dependencies' },
                { value: 'optimize', label: '⚡ Optimize packages' },
                { value: 'report', label: '📋 Generate report' },
                { value: 'settings', label: '⚙️  Settings' },
                { value: 'exit', label: '👋 Exit' }
            ]
        });
        
        return choice;
    }

    // Phase 2 Enhanced 메뉴
    async showEnhancedMainMenu() {
        const choice = await select({
            message: 'Enhanced Packmate v2.2.0 - What would you like to do?',
            options: [
                { value: 'analyze-advanced', label: '🔬 Advanced Analysis with Team Policy' },
                { value: 'security-scan', label: '🛡️ Enhanced Security Scan' },
                { value: 'team-sync', label: '🔄 Sync Team Configuration' },
                { value: 'policy-check', label: '📋 Policy Compliance Check' },
                { value: 'cache-optimize', label: '⚡ Optimize Cache Systems' },
                { value: 'health-check', label: '🏥 System Health Check' },
                { value: 'team-setup', label: '👥 Setup Team Configuration' },
                { value: 'statistics', label: '📊 View Statistics' },
                { value: 'exit', label: '👋 Exit' }
            ]
        });
        
        return choice;
    }

    // 팀 프리셋 선택
    async selectPreset() {
        const preset = await select({
            message: 'Select a team configuration preset:',
            options: [
                { value: 'strict', label: '🔒 Strict - Maximum security (Enterprise/Financial)' },
                { value: 'moderate', label: '⚖️ Moderate - Balanced security and velocity' },
                { value: 'opensource', label: '🌍 Open Source - Community development optimized' },
                { value: 'startup', label: '🚀 Startup - Fast development with safety nets' },
                { value: 'loose', label: '🏃 Loose - Minimal restrictions (Prototyping)' }
            ]
        });
        
        return preset;
    }

    async showAdvancedOptions() {
        const options = await multiselect({
            message: 'Select analysis options:',
            options: [
                { value: 'deep-scan', label: '🔬 Deep security scan (slower)' },
                { value: 'dependency-tree', label: '🌳 Analyze dependency tree' },
                { value: 'size-analysis', label: '📊 Bundle size analysis' },
                { value: 'compatibility', label: '🔧 Compatibility check' },
                { value: 'performance', label: '⚡ Performance impact analysis' },
                { value: 'license-check', label: '📄 License compliance check' }
            ]
        });
        
        return options;
    }

    // 실시간 로그 출력
    createLiveLogger(title) {
        console.log(this.currentTheme.highlight(`\n📋 ${title}`));
        console.log(this.currentTheme.secondary('=' .repeat(50)));
        
        return {
            info: (message) => console.log(`${this.currentTheme.info('ℹ')} ${message}`),
            success: (message) => console.log(`${this.currentTheme.success('✅')} ${message}`),
            warning: (message) => console.log(`${this.currentTheme.warning('⚠️')} ${message}`),
            error: (message) => console.log(`${this.currentTheme.error('❌')} ${message}`),
            debug: (message) => console.log(`${this.currentTheme.secondary('🐛')} ${message}`)
        };
    }

    // 결과 요약 표시
    displaySummary(results) {
        outro(this.currentTheme.highlight('📋 Summary'));
        
        const summaryStats = `
${this.currentTheme.info('⏱️  Total time:')} ${this.formatTime(Date.now() - this.startTime)}
${this.currentTheme.info('📦 Packages processed:')} ${results.packagesProcessed || 0}
${this.currentTheme.info('🔒 Security issues:')} ${results.securityIssues || 0}
${this.currentTheme.info('📈 Updates available:')} ${results.updatesAvailable || 0}
${this.currentTheme.info('💾 Cache hits:')} ${results.cacheHits || 0}%
        `.trim();
        
        note(summaryStats, 'Results');
        
        if (results.recommendations && results.recommendations.length > 0) {
            console.log(this.currentTheme.highlight('\n💡 Recommendations:'));
            results.recommendations.forEach((rec, index) => {
                const priorityIcon = rec.priority === 'critical' ? '🚨' : 
                                   rec.priority === 'high' ? '⚠️' : '💡';
                console.log(`${index + 1}. ${priorityIcon} ${rec.title}`);
                if (rec.description) {
                    console.log(`   ${this.currentTheme.secondary(rec.description)}`);
                }
            });
        }
    }

    // 헬퍼 함수들
    getSeverityWeight(severity) {
        const weights = { critical: 4, high: 3, moderate: 2, low: 1, info: 0 };
        return weights[severity] || 0;
    }

    getSeverityIcon(severity) {
        const icons = {
            critical: '🚨',
            high: '🔥',
            moderate: '⚠️',
            low: '🔍',
            info: 'ℹ️'
        };
        return icons[severity] || '❓';
    }

    getSeverityColor(severity) {
        const colors = {
            critical: this.currentTheme.error,
            high: this.currentTheme.error,
            moderate: this.currentTheme.warning,
            low: this.currentTheme.info,
            info: this.currentTheme.secondary
        };
        return colors[severity] || this.currentTheme.secondary;
    }

    getRiskScoreColor(score) {
        if (score >= 80) return this.currentTheme.error(score);
        if (score >= 60) return this.currentTheme.warning(score);
        if (score >= 40) return this.currentTheme.info(score);
        return this.currentTheme.success(score);
    }

    formatFileSize(bytes) {
        const units = ['B', 'KB', 'MB', 'GB'];
        let size = bytes;
        let unitIndex = 0;
        
        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }
        
        return `${size.toFixed(1)}${units[unitIndex]}`;
    }

    // 테마 변경
    setTheme(themeName) {
        if (this.themes[themeName]) {
            this.currentTheme = this.themes[themeName];
        }
    }

    // 대화형 설정
    async configureSettings() {
        intro(this.currentTheme.highlight('⚙️  Settings Configuration'));
        
        const settings = {
            autoUpdate: await confirm({ message: 'Enable automatic updates?' }),
            securityScan: await confirm({ message: 'Enable security scanning?' }),
            cacheEnabled: await confirm({ message: 'Enable caching?' }),
            notifications: await confirm({ message: 'Enable notifications?' }),
            theme: await select({
                message: 'Choose theme:',
                options: [
                    { value: 'default', label: 'Default' },
                    { value: 'dark', label: 'Dark' }
                ]
            })
        };
        
        this.setTheme(settings.theme);
        
        outro(this.currentTheme.success('Settings saved!'));
        
        return settings;
    }
}