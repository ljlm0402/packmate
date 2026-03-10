/**
 * 고급 분석 엔진
 * TypeScript 패턴, 설정 파일 의존성, 동적 로딩 분석
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

export class AdvancedAnalyzer {
    constructor(options = {}) {
        this.options = {
            enableTypescriptAnalysis: true,
            enableConfigAnalysis: true,
            enableDynamicAnalysis: true,
            enableDeepScan: false,
            ...options
        };
        
        this.supportedConfigFiles = [
            'webpack.config.js',
            'vite.config.js',
            'tailwind.config.js',
            'jest.config.js',
            'rollup.config.js',
            'babel.config.js',
            'postcss.config.js',
            'next.config.js',
            'nuxt.config.js',
            'astro.config.js'
        ];
        
        this.typescriptPatterns = {
            decorators: /@\w+\s*\(/g,
            genericConstraints: /<[^>]*extends\s+[^>]+>/g,
            interfaces: /interface\s+\w+/g,
            types: /type\s+\w+\s*=/g,
            imports: /import\s*.*\s*from\s*['"]([^'"]+)['"]/g,
            dynamicImports: /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g
        };
        
        this.stats = {
            filesAnalyzed: 0,
            packagesFound: 0,
            typescriptFeatures: 0,
            configDependencies: 0,
            dynamicPatterns: 0
        };
    }

    // 메인 분석 실행
    async analyze(projectPath) {
        const analysisResult = {
            projectPath,
            timestamp: new Date().toISOString(),
            packages: new Set(),
            typescript: {
                features: [],
                dependencies: new Set(),
                patterns: []
            },
            configFiles: {
                found: [],
                dependencies: new Set(),
                analysis: []
            },
            dynamicPatterns: {
                imports: [],
                requires: [],
                plugins: []
            },
            recommendations: [],
            stats: { ...this.stats }
        };

        try {
            console.log('🔍 Starting advanced dependency analysis...');
            
            // 1. TypeScript 분석
            if (this.options.enableTypescriptAnalysis) {
                await this.analyzeTypescriptPatterns(projectPath, analysisResult);
            }
            
            // 2. 설정 파일 분석  
            if (this.options.enableConfigAnalysis) {
                await this.analyzeConfigDependencies(projectPath, analysisResult);
            }
            
            // 3. 동적 패턴 분석
            if (this.options.enableDynamicAnalysis) {
                await this.analyzeDynamicPatterns(projectPath, analysisResult);
            }
            
            // 4. 결과 통합 및 권장사항 생성
            this.generateRecommendations(analysisResult);
            
            // 5. 통계 업데이트
            analysisResult.stats = { ...this.stats };
            
            console.log(`✅ Advanced analysis completed - Found ${analysisResult.packages.size} dependencies`);
            
            return this.convertSetsToArrays(analysisResult);
            
        } catch (error) {
            console.error(`❌ Advanced analysis failed: ${error.message}`);
            throw error;
        }
    }

    // TypeScript 패턴 분석
    async analyzeTypescriptPatterns(projectPath, result) {
        const tsFiles = this.findTypescriptFiles(projectPath);
        
        console.log(`📘 Analyzing ${tsFiles.length} TypeScript files...`);
        
        for (const filePath of tsFiles) {
            try {
                const content = fs.readFileSync(filePath, 'utf-8');
                this.stats.filesAnalyzed++;
                
                // 데코레이터 분석 (@Injectable, @Component 등)
                const decorators = this.extractDecorators(content);
                if (decorators.length > 0) {
                    result.typescript.features.push({
                        file: path.relative(projectPath, filePath),
                        type: 'decorators',
                        patterns: decorators
                    });
                    this.stats.typescriptFeatures++;
                    
                    // 데코레이터 관련 패키지 추출
                    this.extractDecoratorDependencies(decorators, result.packages);
                }
                
                // 제네릭 제약 조건 분석
                const generics = this.extractGenerics(content);
                if (generics.length > 0) {
                    result.typescript.features.push({
                        file: path.relative(projectPath, filePath),
                        type: 'generics',
                        patterns: generics
                    });
                }
                
                // Import 문 분석
                const imports = this.extractImports(content);
                imports.forEach(imp => {
                    if (!imp.startsWith('.')) {
                        result.packages.add(this.extractPackageName(imp));
                        result.typescript.dependencies.add(imp);
                    }
                });
                
            } catch (error) {
                console.warn(`Failed to analyze TypeScript file ${filePath}: ${error.message}`);
            }
        }
    }

    // 설정 파일 의존성 분석
    async analyzeConfigDependencies(projectPath, result) {
        console.log('⚙️ Analyzing configuration files...');
        
        for (const configFile of this.supportedConfigFiles) {
            const configPath = path.join(projectPath, configFile);
            
            if (fs.existsSync(configPath)) {
                try {
                    result.configFiles.found.push(configFile);
                    const analysis = await this.analyzeConfigFile(configPath, configFile);
                    
                    result.configFiles.analysis.push({
                        file: configFile,
                        ...analysis
                    });
                    
                    // 발견된 의존성을 전체 결과에 추가
                    analysis.dependencies.forEach(dep => {
                        result.packages.add(dep);
                        result.configFiles.dependencies.add(dep);
                    });
                    
                    this.stats.configDependencies += analysis.dependencies.length;
                    
                } catch (error) {
                    console.warn(`Failed to analyze config file ${configFile}: ${error.message}`);
                }
            }
        }
    }

    // 개별 설정 파일 분석
    async analyzeConfigFile(configPath, fileName) {
        const content = fs.readFileSync(configPath, 'utf-8');
        const dependencies = new Set();
        const plugins = [];
        const loaders = [];
        
        // Webpack 설정 분석
        if (fileName.includes('webpack')) {
            const webpackPlugins = this.extractWebpackPlugins(content);
            plugins.push(...webpackPlugins);
            
            const webpackLoaders = this.extractWebpackLoaders(content);
            loaders.push(...webpackLoaders);
        }
        
        // Vite 설정 분석
        if (fileName.includes('vite')) {
            const vitePlugins = this.extractVitePlugins(content);
            plugins.push(...vitePlugins);
        }
        
        // Babel 설정 분석
        if (fileName.includes('babel')) {
            const babelPlugins = this.extractBabelPlugins(content);
            plugins.push(...babelPlugins);
        }
        
        // Jest 설정 분석
        if (fileName.includes('jest')) {
            const jestDeps = this.extractJestDependencies(content);
            jestDeps.forEach(dep => dependencies.add(dep));
        }
        
        // 일반적인 require/import 패턴
        const requirePatterns = [
            /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
            /import\s+.+\s+from\s+['"]([^'"]+)['"]/g
        ];
        
        requirePatterns.forEach(pattern => {
            let match;
            while ((match = pattern.exec(content)) !== null) {
                const packageName = this.extractPackageName(match[1]);
                if (packageName && !packageName.startsWith('.')) {
                    dependencies.add(packageName);
                }
            }
        });
        
        return {
            dependencies: Array.from(dependencies),
            plugins,
            loaders,
            complexity: this.calculateConfigComplexity(content)
        };
    }

    // 동적 패턴 분석
    async analyzeDynamicPatterns(projectPath, result) {
        console.log('🔮 Analyzing dynamic loading patterns...');
        
        const jsFiles = this.findJavaScriptFiles(projectPath);
        const patterns = {
            dynamicImports: [],
            conditionalRequires: [],
            pluginPatterns: []
        };
        
        for (const filePath of jsFiles) {
            try {
                const content = fs.readFileSync(filePath, 'utf-8');
                
                // 동적 import() 분석
                const dynamicImports = this.extractDynamicImports(content);
                patterns.dynamicImports.push(...dynamicImports.map(imp => ({
                    file: path.relative(projectPath, filePath),
                    pattern: imp
                })));
                
                // 조건부 require 분석
                const conditionalRequires = this.extractConditionalRequires(content);
                patterns.conditionalRequires.push(...conditionalRequires.map(req => ({
                    file: path.relative(projectPath, filePath),
                    pattern: req
                })));
                
                // 플러그인 패턴 분석
                const pluginPatterns = this.extractPluginPatterns(content);
                patterns.pluginPatterns.push(...pluginPatterns.map(plugin => ({
                    file: path.relative(projectPath, filePath),
                    pattern: plugin
                })));
                
                this.stats.dynamicPatterns += dynamicImports.length + conditionalRequires.length + pluginPatterns.length;
                
            } catch (error) {
                console.warn(`Failed to analyze dynamic patterns in ${filePath}: ${error.message}`);
            }
        }
        
        result.dynamicPatterns = patterns;
        
        // 동적 패턴에서 패키지 추출
        this.extractPackagesFromDynamicPatterns(patterns, result.packages);
    }

    // TypeScript 파일 찾기
    findTypescriptFiles(projectPath) {
        const files = [];
        this.walkDirectory(projectPath, (filePath) => {
            if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) {
                files.push(filePath);
            }
        });
        return files;
    }

    // JavaScript 파일 찾기
    findJavaScriptFiles(projectPath) {
        const files = [];
        this.walkDirectory(projectPath, (filePath) => {
            if ((filePath.endsWith('.js') || filePath.endsWith('.jsx')) && 
                !filePath.includes('node_modules') && 
                !filePath.includes('.min.js')) {
                files.push(filePath);
            }
        });
        return files;
    }

    // 디렉터리 순회
    walkDirectory(dir, callback) {
        if (!fs.existsSync(dir)) return;
        
        const skipDirs = ['node_modules', '.git', 'dist', 'build', '.next', 'coverage'];
        
        const items = fs.readdirSync(dir);
        for (const item of items) {
            const fullPath = path.join(dir, item);
            const stat = fs.statSync(fullPath);
            
            if (stat.isDirectory()) {
                if (!skipDirs.includes(item)) {
                    this.walkDirectory(fullPath, callback);
                }
            } else {
                callback(fullPath);
            }
        }
    }

    // 데코레이터 추출
    extractDecorators(content) {
        const decorators = [];
        const matches = content.matchAll(this.typescriptPatterns.decorators);
        
        for (const match of matches) {
            decorators.push(match[0]);
        }
        
        return decorators;
    }

    // 제네릭 추출
    extractGenerics(content) {
        const generics = [];
        const matches = content.matchAll(this.typescriptPatterns.genericConstraints);
        
        for (const match of matches) {
            generics.push(match[0]);
        }
        
        return generics;
    }

    // Import 문 추출
    extractImports(content) {
        const imports = [];
        const matches = content.matchAll(this.typescriptPatterns.imports);
        
        for (const match of matches) {
            imports.push(match[1]);
        }
        
        return imports;
    }

    // 동적 import 추출
    extractDynamicImports(content) {
        const imports = [];
        const pattern = /import\s*\(\s*(['"`])([^'"`]+)\1\s*\)/g;
        let match;
        
        while ((match = pattern.exec(content)) !== null) {
            imports.push(match[2]);
        }
        
        return imports;
    }

    // 조건부 require 추출
    extractConditionalRequires(content) {
        const requires = [];
        const pattern = /if\s*\([^)]*\)\s*{[^}]*require\s*\(\s*(['"`])([^'"`]+)\1\s*\)/g;
        let match;
        
        while ((match = pattern.exec(content)) !== null) {
            requires.push(match[2]);
        }
        
        return requires;
    }

    // 플러그인 패턴 추출
    extractPluginPatterns(content) {
        const patterns = [];
        
        // 일반적인 플러그인 패턴들
        const pluginPatterns = [
            /require\s*\(\s*(['"`])([^'"`]*plugin[^'"`]*)\1\s*\)/gi,
            /import\s+.+\s+from\s+(['"`])([^'"`]*plugin[^'"`]*)\1/gi,
            /['"`]([^'"`]*-plugin[^'"`]*)['"]/gi
        ];
        
        pluginPatterns.forEach(pattern => {
            let match;
            while ((match = pattern.exec(content)) !== null) {
                const pluginName = match[2] || match[1];
                if (pluginName && !pluginName.startsWith('.')) {
                    patterns.push(pluginName);
                }
            }
        });
        
        return patterns;
    }

    // Webpack 플러그인 추출
    extractWebpackPlugins(content) {
        const plugins = [];
        const pattern = /new\s+(\w+Plugin)\s*\(/g;
        let match;
        
        while ((match = pattern.exec(content)) !== null) {
            plugins.push(match[1]);
        }
        
        return plugins;
    }

    // Webpack 로더 추출
    extractWebpackLoaders(content) {
        const loaders = [];
        const pattern = /['"`]([^'"`]*-loader)['"]/g;
        let match;
        
        while ((match = pattern.exec(content)) !== null) {
            loaders.push(match[1]);
        }
        
        return loaders;
    }

    // Vite 플러그인 추출
    extractVitePlugins(content) {
        const plugins = [];
        const pattern = /plugins:\s*\[[^\]]*\]/s;
        const match = content.match(pattern);
        
        if (match) {
            const pluginsArray = match[0];
            const pluginPattern = /(\w+)\s*\(/g;
            let pluginMatch;
            
            while ((pluginMatch = pluginPattern.exec(pluginsArray)) !== null) {
                plugins.push(pluginMatch[1]);
            }
        }
        
        return plugins;
    }

    // Babel 플러그인 추출
    extractBabelPlugins(content) {
        const plugins = [];
        
        try {
            const config = new Function('module', 'exports', content + '; return module.exports')({exports: {}}, {});
            
            if (config.plugins) {
                config.plugins.forEach(plugin => {
                    if (typeof plugin === 'string') {
                        plugins.push(plugin);
                    } else if (Array.isArray(plugin) && plugin[0]) {
                        plugins.push(plugin[0]);
                    }
                });
            }
        } catch (error) {
            // JSON 형태인 경우
            try {
                const config = JSON.parse(content);
                if (config.plugins) {
                    plugins.push(...config.plugins);
                }
            } catch (jsonError) {
                console.warn(`Failed to parse Babel config: ${error.message}`);
            }
        }
        
        return plugins;
    }

    // Jest 의존성 추출
    extractJestDependencies(content) {
        const dependencies = [];
        
        const jestPatterns = [
            /setupFilesAfterEnv:\s*\[\s*(['"`])([^'"`]+)\1\s*\]/,
            /testEnvironment:\s*(['"`])([^'"`]+)\1/,
            /transform:\s*{[^}]*(['"`])([^'"`]*)\1:\s*(['"`])([^'"`]+)\3/g
        ];
        
        jestPatterns.forEach(pattern => {
            let match;
            if (pattern.global) {
                while ((match = pattern.exec(content)) !== null) {
                    dependencies.push(match[4] || match[2]);
                }
            } else {
                match = content.match(pattern);
                if (match) {
                    dependencies.push(match[2]);
                }
            }
        });
        
        return dependencies;
    }

    // 패키지 이름 추출
    extractPackageName(importPath) {
        if (importPath.startsWith('@')) {
            const parts = importPath.split('/');
            return parts.slice(0, 2).join('/');
        } else {
            return importPath.split('/')[0];
        }
    }

    // 데코레이터 의존성 추출
    extractDecoratorDependencies(decorators, packages) {
        const decoratorMap = {
            '@Component': '@angular/core',
            '@Injectable': '@angular/core',
            '@Module': '@nestjs/common',
            '@Controller': '@nestjs/common',
            '@Entity': 'typeorm',
            '@Column': 'typeorm'
        };
        
        decorators.forEach(decorator => {
            const cleanDecorator = decorator.split('(')[0];
            if (decoratorMap[cleanDecorator]) {
                packages.add(decoratorMap[cleanDecorator]);
            }
        });
    }

    // 동적 패턴에서 패키지 추출
    extractPackagesFromDynamicPatterns(patterns, packages) {
        const allPatterns = [
            ...patterns.dynamicImports,
            ...patterns.conditionalRequires,  
            ...patterns.pluginPatterns
        ];
        
        allPatterns.forEach(item => {
            const pattern = item.pattern || item;
            if (typeof pattern === 'string' && !pattern.startsWith('.')) {
                packages.add(this.extractPackageName(pattern));
            }
        });
    }

    // 설정 복잡도 계산
    calculateConfigComplexity(content) {
        const lines = content.split('\n').length;
        const objects = (content.match(/{/g) || []).length;
        const functions = (content.match(/function|=>/g) || []).length;
        
        return {
            lines,
            objects, 
            functions,
            score: Math.min(100, (lines / 10) + (objects * 2) + (functions * 3))
        };
    }

    // 권장사항 생성
    generateRecommendations(result) {
        const recommendations = [];
        
        // TypeScript 권장사항
        if (result.typescript.features.length > 0) {
            recommendations.push({
                type: 'typescript',
                priority: 'medium',
                title: 'TypeScript 의존성 최적화',
                description: `${result.typescript.dependencies.size}개의 TypeScript 관련 패키지가 발견되었습니다.`,
                suggestions: [
                    'TypeScript 컴파일러 옵션 최적화',
                    '불필요한 @types 패키지 제거',
                    'TypeScript 버전 업데이트 검토'
                ]
            });
        }
        
        // 설정 파일 권장사항  
        if (result.configFiles.found.length > 5) {
            recommendations.push({
                type: 'configuration',
                priority: 'low',
                title: '설정 파일 통합 검토',
                description: `${result.configFiles.found.length}개의 설정 파일이 발견되었습니다.`,
                suggestions: [
                    '중복 설정 통합',
                    '설정 파일 간소화',
                    '통합 설정 시스템 도입 검토'
                ]
            });
        }
        
        // 동적 패턴 권장사항
        if (result.dynamicPatterns.dynamicImports.length > 0) {
            recommendations.push({
                type: 'performance',
                priority: 'medium',
                title: '동적 로딩 최적화',
                description: `${result.dynamicPatterns.dynamicImports.length}개의 동적 import가 발견되었습니다.`,
                suggestions: [
                    '번들 분할 전략 최적화',
                    '로딩 우선순위 설정',
                    '프리로딩 적용 검토'
                ]
            });
        }
        
        result.recommendations = recommendations;
    }

    // Set을 Array로 변환 (JSON 직렬화를 위해)
    convertSetsToArrays(result) {
        return {
            ...result,
            packages: Array.from(result.packages),
            typescript: {
                ...result.typescript,
                dependencies: Array.from(result.typescript.dependencies)
            },
            configFiles: {
                ...result.configFiles,
                dependencies: Array.from(result.configFiles.dependencies)
            }
        };
    }

    // 통계 리셋
    resetStats() {
        this.stats = {
            filesAnalyzed: 0,
            packagesFound: 0,
            typescriptFeatures: 0,
            configDependencies: 0,
            dynamicPatterns: 0
        };
    }
}