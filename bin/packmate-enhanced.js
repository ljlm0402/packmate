#!/usr/bin/env node

/**
 * Enhanced Packmate v2.2.0 Entry Point
 * 모든 개선된 기능들을 통합하여 제공
 */

import { EnhancedPackmateController } from '../src/enhanced-controller-minimal.js';
import minimist from 'minimist';
import chalk from 'chalk';

const args = minimist(process.argv.slice(2));

// 명령행 도움말
function showHelp() {
    console.log(`
${chalk.cyan.bold('Enhanced Packmate v2.2.0')}
${chalk.gray('Advanced package management with security scanning, caching, and optimization')}

${chalk.yellow.bold('USAGE:')}
  ${chalk.green('packmate-enhanced')} [command] [options]

${chalk.yellow.bold('COMMANDS:')}
  ${chalk.green('scan')}        Run comprehensive security scan
  ${chalk.green('update')}      Check for package updates  
  ${chalk.green('analyze')}     Analyze dependency tree
  ${chalk.green('optimize')}    Optimize package configuration
  ${chalk.green('report')}      Generate detailed analysis report
  ${chalk.green('interactive')} Start interactive mode (default)

${chalk.yellow.bold('OPTIONS:')}
  ${chalk.green('--project-path')}    Project directory (default: current)
  ${chalk.green('--deep-scan')}       Enable deep security scanning
  ${chalk.green('--cache-disabled')}  Disable caching features
  ${chalk.green('--workers')}         Number of worker processes (default: auto)
  ${chalk.green('--json')}            Output results in JSON format
  ${chalk.green('--quiet')}           Reduce output verbosity
  ${chalk.green('--help')}            Show this help message

${chalk.yellow.bold('EXAMPLES:')}
  ${chalk.gray('# Interactive mode')}
  ${chalk.green('packmate-enhanced')}

  ${chalk.gray('# Quick security scan')}
  ${chalk.green('packmate-enhanced scan --deep-scan')}

  ${chalk.gray('# Update check with JSON output')}
  ${chalk.green('packmate-enhanced update --json')}

  ${chalk.gray('# Generate comprehensive report')}
  ${chalk.green('packmate-enhanced report --project-path ./my-project')}

${chalk.yellow.bold('NEW FEATURES IN v2.2.0:')}
  🚀 ${chalk.green('Predictive caching')} - AI-powered package prediction
  🔒 ${chalk.green('Multi-source security')} - npm, OSV, GitHub Advisory databases
  ⚡ ${chalk.green('Worker pool processing')} - Parallel package analysis
  📊 ${chalk.green('Advanced analytics')} - Dependency tree, bundle size analysis
  💾 ${chalk.green('Compressed caching')} - 90% storage reduction with Brotli
  🎨 ${chalk.green('Enhanced UI')} - Real-time progress, interactive menus
`);
}

async function main() {
    try {
        // 도움말 표시
        if (args.help || args.h) {
            showHelp();
            process.exit(0);
        }

        const command = args._[0] || 'interactive';
        const options = {
            projectPath: args['project-path'] || process.cwd(),
            deepScan: !!args['deep-scan'],
            cacheDisabled: !!args['cache-disabled'],
            workers: args.workers ? parseInt(args.workers) : undefined,
            jsonOutput: !!args.json,
            quiet: !!args.quiet
        };

        // Enhanced Controller 생성
        const controller = new EnhancedPackmateController(options);

        // 명령별 처리
        switch (command) {
            case 'interactive':
                await controller.start();
                break;

            case 'scan':
                await controller.runEnhancedSecurityScan();
                break;

            case 'update':
                console.log(chalk.yellow('Update check functionality available in interactive mode'));
                await controller.start();
                break;

            case 'analyze':
                await controller.analyzeWithTeamPolicy();
                break;

            case 'optimize':
                await controller.optimizeCache();
                break;

            case 'report':
                console.log(chalk.yellow('Report generation available in interactive mode'));
                await controller.start();
                break;

            default:
                console.error(chalk.red(`❌ Unknown command: ${command}`));
                console.log(chalk.gray('Run with --help to see available commands'));
                process.exit(1);
        }

    } catch (error) {
        console.error(chalk.red(`❌ Fatal error: ${error.message}`));
        
        if (!args.quiet) {
            console.error(chalk.gray('\nStack trace:'));
            console.error(error.stack);
        }
        
        process.exit(1);
    }
}

// 신호 처리 (기존 기능과 호환)
process.on('SIGINT', () => {
    console.log(chalk.yellow('\n🔄 Gracefully shutting down...'));
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log(chalk.yellow('\n🔄 Received SIGTERM, shutting down...'));
    process.exit(0);
});

// Windows 지원
if (process.platform === "win32") {
    process.on('SIGBREAK', () => {
        console.log(chalk.yellow('\n🔄 Received SIGBREAK, shutting down...'));
        process.exit(0);
    });
}

// 처리되지 않은 예외 처리
process.on('uncaughtException', (error) => {
    console.error(chalk.red('💥 Uncaught Exception:'), error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error(chalk.red('💥 Unhandled Rejection at:'), promise, 'reason:', reason);
    process.exit(1);
});

if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}

export { main };