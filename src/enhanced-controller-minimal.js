/**
 * Minimal Enhanced Packmate Controller
 * Testing basic functionality without Phase 2 modules
 */

import path from 'path';
import fs from 'fs';
import { SimpleUI } from './simple-ui.js';
import { loadConfig } from './config-loader.js';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class EnhancedPackmateController {
    constructor(options = {}) {
        this.config = loadConfig();
        this.projectPath = options.projectPath || process.cwd();
        this.cacheDir = path.join(this.projectPath, '.packmate');
        
        // UI 시스템
        this.ui = new SimpleUI();
        
        this.stats = {
            enhancedOperations: 0,
            cacheHits: 0,
            securityScansRun: 0
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
    }

    // 메인 진입점 - 대화형 메뉴
    async start() {
        this.ui.intro('🚀 Enhanced Packmate v2.2.0 - Minimal Mode');
        
        try {
            await this.performSystemCheck();
            
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

    // 기본 시스템 상태 확인
    async performSystemCheck() {
        console.log('🔍 Performing basic system check...');
        
        const checks = [
            { name: 'UI System', fn: () => this.ui !== null },
            { name: 'Project Structure', fn: () => fs.existsSync(path.join(this.projectPath, 'package.json')) },
            { name: 'Cache Directory', fn: () => fs.existsSync(this.cacheDir) }
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

    // 메뉴 선택 처리
    async handleMenuChoice(choice) {
        try {
            this.stats.enhancedOperations++;
            
            switch (choice) {
                case 'health-check':
                    await this.performSystemCheck();
                    break;
                    
                case 'statistics':
                    this.displayStatistics();
                    break;
                    
                case 'exit':
                    return false;
                    
                default:
                    console.log('Function not implemented in minimal mode. Full functionality coming soon.');
            }
            
            return true;
        } catch (error) {
            console.error(`❌ Operation failed: ${error.message}`);
            return true;
        }
    }

    // 통계 표시
    displayStatistics() {
        console.log('\n📊 Enhanced Packmate Statistics (Minimal Mode):');
        console.log(`  🚀 Operations: ${this.stats.enhancedOperations}`);
        console.log(`  🏥 System health: ${this.healthy ? 'Healthy' : 'Issues'}`);
        
        if (this.lastHealthCheck) {
            console.log(`  📅 Last health check: ${this.lastHealthCheck.toLocaleString()}`);
        }
    }

    // 정상 종료
    async shutdown() {
        console.log('\n🔄 Shutting down Enhanced Packmate (Minimal Mode)...');
        this.ui.close();
        console.log('✅ Shutdown complete');
    }

    // 헬스체크
    async healthCheck() {
        return {
            healthy: this.healthy,
            lastCheck: this.lastHealthCheck,
            stats: this.stats,
            version: '2.2.0',
            mode: 'minimal'
        };
    }
}