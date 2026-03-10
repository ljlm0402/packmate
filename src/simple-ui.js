/**
 * Simple UI for Enhanced Packmate
 * Basic console interface without external prompt libraries
 */

import chalk from 'chalk';
import readline from 'readline';

export class SimpleUI {
    constructor() {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        
        // Advanced UI features
        this.activeSpinners = new Map();
        this.currentStep = 0;
        this.totalSteps = 0;
        this.startTime = Date.now();
        this.progressBar = null;
        
        // Themes
        this.themes = {
            default: {
                primary: chalk.cyan,
                secondary: chalk.gray,
                success: chalk.green,
                warning: chalk.yellow,
                error: chalk.red,
                info: chalk.blue,
                highlight: chalk.magenta
            }
        };
        this.currentTheme = this.themes.default;
    }

    // 인트로 메시지 표시
    intro(title) {
        console.log(chalk.cyan(`\n┌─ ${title} ─┐\n`));
    }

    // 아웃트로 메시지 표시  
    outro(title) {
        console.log(chalk.green(`\n└─ ${title} ─┘\n`));
    }

    // 향상된 메인 메뉴
    async showEnhancedMainMenu() {
        console.log(chalk.cyan('\n🚀 Enhanced Packmate v2.2.0 - What would you like to do?\n'));
        console.log('1. 🔬 Advanced Analysis with Team Policy');
        console.log('2. 🛡️ Enhanced Security Scan');
        console.log('3. 🔄 Sync Team Configuration');
        console.log('4. 📋 Policy Compliance Check');
        console.log('5. ⚡ Optimize Cache Systems');
        console.log('6. 🏥 System Health Check');
        console.log('7. 👥 Setup Team Configuration');
        console.log('8. 📊 View Statistics');
        console.log('9. 👋 Exit');
        
        return new Promise((resolve) => {
            this.rl.question('\nEnter your choice (1-9): ', (answer) => {
                const choices = {
                    '1': 'analyze-advanced',
                    '2': 'security-scan',
                    '3': 'team-sync',
                    '4': 'policy-check',
                    '5': 'cache-optimize',
                    '6': 'health-check',
                    '7': 'team-setup',
                    '8': 'statistics',
                    '9': 'exit'
                };
                
                const choice = choices[answer.trim()];
                if (choice) {
                    resolve(choice);
                } else {
                    console.log(chalk.red('Invalid choice. Please enter a number between 1-9.'));
                    resolve(this.showEnhancedMainMenu());
                }
            });
        });
    }

    // 팀 프리셋 선택
    async selectPreset() {
        console.log(chalk.cyan('\n📋 Select a team configuration preset:\n'));
        console.log('1. 🔒 Strict - Maximum security (Enterprise/Financial)');
        console.log('2. ⚖️ Moderate - Balanced security and velocity');
        console.log('3. 🌍 Open Source - Community development optimized');
        console.log('4. 🚀 Startup - Fast development with safety nets');
        console.log('5. 🏃 Loose - Minimal restrictions (Prototyping)');
        
        return new Promise((resolve) => {
            this.rl.question('\nEnter your choice (1-5): ', (answer) => {
                const choices = {
                    '1': 'strict',
                    '2': 'moderate',
                    '3': 'opensource',
                    '4': 'startup',
                    '5': 'loose'
                };
                
                const preset = choices[answer.trim()];
                if (preset) {
                    resolve(preset);
                } else {
                    console.log(chalk.red('Invalid choice. Please enter a number between 1-5.'));
                    resolve(this.selectPreset());
                }
            });
        });
    }

    // 확인 메시지
    async confirm(message) {
        return new Promise((resolve) => {
            this.rl.question(`${message} (y/n): `, (answer) => {
                const confirmed = answer.toLowerCase().trim() === 'y' || answer.toLowerCase().trim() === 'yes';
                resolve(confirmed);
            });
        });
    }

    // 정리
    close() {
        this.rl.close();
    }
    
    // AdvancedUI compatibility methods
    
    // 스피너 시작
    startSpinner(id, message) {
        const spinner = {
            message,
            frames: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
            frameIndex: 0,
            timer: setInterval(() => {
                const frame = spinner.frames[spinner.frameIndex % spinner.frames.length];
                process.stdout.write(`\r${frame} ${message}`);
                spinner.frameIndex++;
            }, 80)
        };
        
        this.activeSpinners.set(id, spinner);
        return spinner;
    }
    
    // 스피너 중단
    stopSpinner(id, message = 'Done') {
        const spinner = this.activeSpinners.get(id);
        if (spinner) {
            clearInterval(spinner.timer);
            this.activeSpinners.delete(id);
            process.stdout.write(`\r✅ ${message}\n`);
        }
    }
    
    // 진행률 업데이트
    updateProgress(current, total) {
        this.currentStep = current;
        this.totalSteps = total;
        
        const percentage = Math.round((current / total) * 100);
        const barLength = 20;
        const filledLength = Math.round((current / total) * barLength);
        const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);
        
        process.stdout.write(`\rProgress [${bar}] ${percentage}% (${current}/${total})`);
        
        if (current >= total) {
            process.stdout.write('\n');
        }
    }
    
    // 멀티 선택 (간단 버전)
    async multiselect(options, message = 'Select options (comma-separated)') {
        console.log(this.currentTheme.info(`\n${message}\n`));
        
        options.forEach((option, index) => {
            console.log(`${index + 1}. ${option.label || option}`);
        });
        
        return new Promise((resolve) => {
            this.rl.question('\nEnter numbers separated by commas (e.g., 1,3,5): ', (answer) => {
                const selections = answer.split(',')
                    .map(s => parseInt(s.trim()) - 1)
                    .filter(i => i >= 0 && i < options.length)
                    .map(i => options[i]);
                
                resolve(selections);
            });
        });
    }
    
    // 단일 선택
    async select(options, message = 'Select an option') {
        console.log(this.currentTheme.info(`\n${message}\n`));
        
        options.forEach((option, index) => {
            const label = option.label || option.title || option;
            const description = option.description ? ` - ${option.description}` : '';
            console.log(`${index + 1}. ${label}${description}`);
        });
        
        return new Promise((resolve) => {
            this.rl.question('\nEnter your choice: ', (answer) => {
                const index = parseInt(answer.trim()) - 1;
                if (index >= 0 && index < options.length) {
                    const selected = options[index];
                    resolve(selected.value || selected.title || selected);
                } else {
                    console.log(this.currentTheme.error('Invalid choice. Please try again.'));
                    resolve(this.select(options, message));
                }
            });
        });
    }
    
    // 텍스트 입력
    async text(message, defaultValue = '') {
        return new Promise((resolve) => {
            const prompt = defaultValue ? `${message} (default: ${defaultValue}): ` : `${message}: `;
            this.rl.question(prompt, (answer) => {
                resolve(answer.trim() || defaultValue);
            });
        });
    }
    
    // 노트 표시
    note(title, message) {
        console.log(this.currentTheme.info(`\n📝 ${title}`));
        if (message) {
            console.log(this.currentTheme.secondary(message));
        }
        console.log();
    }
    
    // 취소 메시지
    cancel(message = 'Operation cancelled') {
        console.log(this.currentTheme.error(`\n❌ ${message}\n`));
        process.exit(0);
    }
    
    // 실시간 진행률 표시 (AdvancedUI 호환)
    showRealTimeProgress(items, processor) {
        return new Promise(async (resolve) => {
            const results = [];
            const total = items.length;
            
            console.log(this.currentTheme.info(`\nProcessing ${total} items...\n`));
            
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                this.updateProgress(i + 1, total);
                
                try {
                    const result = await processor(item, i);
                    results.push(result);
                } catch (error) {
                    console.log(`\n${this.currentTheme.error(`Error processing ${item}: ${error.message}`)}`);
                    results.push({ error: error.message });
                }
            }
            
            resolve(results);
        });
    }
}