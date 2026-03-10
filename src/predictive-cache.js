/**
 * 예측적 캐싱 엔진 
 * 사용 패턴 학습 및 미리 캐시 전략
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

export class PredictiveCacheEngine {
    constructor(cacheDir) {
        this.cacheDir = cacheDir;
        this.usageHistoryPath = path.join(cacheDir, 'usage-history.json');
        this.usageHistory = this.loadUsageHistory();
        this.popularPackages = new Set(); // 인기 패키지 목록
    }

    loadUsageHistory() {
        try {
            if (fs.existsSync(this.usageHistoryPath)) {
                const data = fs.readFileSync(this.usageHistoryPath, 'utf-8');
                return JSON.parse(data);
            }
        } catch (error) {
            console.warn(`Usage history load failed: ${error.message}`);
        }
        return { packages: {}, sessions: [] };
    }

    saveUsageHistory() {
        try {
            fs.writeFileSync(this.usageHistoryPath, JSON.stringify(this.usageHistory, null, 2));
        } catch (error) {
            console.warn(`Usage history save failed: ${error.message}`);
        }
    }

    // 패키지 사용 기록
    recordPackageAccess(packageName, projectPath) {
        const now = Date.now();
        const sessionId = this.getCurrentSessionId();

        // 패키지별 통계
        if (!this.usageHistory.packages[packageName]) {
            this.usageHistory.packages[packageName] = {
                accessCount: 0,
                lastAccessed: 0,
                projects: new Set(),
                frequency: 0 // 주간 접근 횟수
            };
        }

        const packageStats = this.usageHistory.packages[packageName];
        packageStats.accessCount++;
        packageStats.lastAccessed = now;
        packageStats.projects.add(projectPath);

        // 세션 기록
        this.usageHistory.sessions.push({
            sessionId,
            packageName,
            timestamp: now,
            projectPath
        });

        // 오래된 세션 정리 (30일)
        const monthAgo = now - (30 * 24 * 60 * 60 * 1000);
        this.usageHistory.sessions = this.usageHistory.sessions.filter(s => s.timestamp > monthAgo);

        this.saveUsageHistory();
    }

    // 예측할 패키지 목록 생성
    predictPackagesToCache(currentPackages = []) {
        const predictions = new Set();

        // 1. 현재 프로젝트와 유사한 패키지들
        const relatedPackages = this.findRelatedPackages(currentPackages);
        relatedPackages.forEach(pkg => predictions.add(pkg));

        // 2. 최근 자주 조회된 패키지들 (상위 20%)
        const frequentPackages = this.getFrequentPackages(0.2);
        frequentPackages.forEach(pkg => predictions.add(pkg));

        // 3. 트렌딩 패키지들 (최근 일주일 급상승)
        const trendingPackages = this.getTrendingPackages();
        trendingPackages.forEach(pkg => predictions.add(pkg));

        // 4. 의존성 체인으로 연결된 패키지들
        const dependencyChain = this.predictDependencyChain(currentPackages);
        dependencyChain.forEach(pkg => predictions.add(pkg));

        return Array.from(predictions);
    }

    findRelatedPackages(currentPackages) {
        const related = new Set();
        
        // 프로젝트별 공출현 분석
        const coOccurrence = {};
        
        this.usageHistory.sessions.forEach(session => {
            currentPackages.forEach(currentPkg => {
                if (session.packageName !== currentPkg) {
                    if (!coOccurrence[currentPkg]) coOccurrence[currentPkg] = {};
                    if (!coOccurrence[currentPkg][session.packageName]) {
                        coOccurrence[currentPkg][session.packageName] = 0;
                    }
                    coOccurrence[currentPkg][session.packageName]++;
                }
            });
        });

        // 높은 연관성 패키지 선택
        Object.values(coOccurrence).forEach(relations => {
            Object.entries(relations)
                .sort(([,a], [,b]) => b - a)
                .slice(0, 5) // 상위 5개
                .forEach(([pkg]) => related.add(pkg));
        });

        return Array.from(related);
    }

    getFrequentPackages(topPercent = 0.2) {
        const packages = Object.entries(this.usageHistory.packages)
            .sort(([,a], [,b]) => b.accessCount - a.accessCount)
            .slice(0, Math.ceil(Object.keys(this.usageHistory.packages).length * topPercent))
            .map(([pkg]) => pkg);

        return packages;
    }

    getTrendingPackages() {
        const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
        const recentSessions = this.usageHistory.sessions.filter(s => s.timestamp > weekAgo);
        
        const recentCount = {};
        recentSessions.forEach(session => {
            recentCount[session.packageName] = (recentCount[session.packageName] || 0) + 1;
        });

        // 최근 활동 vs 전체 활동 비율로 트렌드 계산
        return Object.entries(recentCount)
            .map(([pkg, recentAccess]) => {
                const totalAccess = this.usageHistory.packages[pkg]?.accessCount || 0;
                const trendScore = totalAccess > 0 ? recentAccess / totalAccess : 0;
                return [pkg, trendScore];
            })
            .sort(([,a], [,b]) => b - a)
            .slice(0, 10) // 상위 10개
            .map(([pkg]) => pkg);
    }

    predictDependencyChain(currentPackages) {
        // 실제로는 package.json이나 lock 파일을 분석해서
        // 의존성 체인의 패키지들을 예측할 수 있음
        const commonChains = {
            'react': ['react-dom', 'react-router', 'react-scripts'],
            'express': ['cors', 'morgan', 'helmet', 'compression'],
            'typescript': ['@types/node', 'ts-node', 'tslib'],
            'eslint': ['@eslint/js', 'globals', 'prettier'],
            'jest': ['@types/jest', 'ts-jest', 'jest-environment-node']
        };

        const predictions = new Set();
        currentPackages.forEach(pkg => {
            if (commonChains[pkg]) {
                commonChains[pkg].forEach(related => predictions.add(related));
            }
        });

        return Array.from(predictions);
    }

    getCurrentSessionId() {
        return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    // 캐시 우선순위 점수 계산
    calculateCachePriority(packageName) {
        const stats = this.usageHistory.packages[packageName];
        if (!stats) return 0;

        const recencyScore = this.calculateRecencyScore(stats.lastAccessed);
        const frequencyScore = Math.min(stats.accessCount / 10, 1); // 최대 1점
        const popularityScore = stats.projects.size / 10; // 프로젝트 다양성

        return recencyScore * 0.4 + frequencyScore * 0.4 + popularityScore * 0.2;
    }

    calculateRecencyScore(lastAccessed) {
        const daysSince = (Date.now() - lastAccessed) / (24 * 60 * 60 * 1000);
        return Math.max(0, 1 - (daysSince / 30)); // 30일 이내면 높은 점수
    }

    // 캐시할 패키지들을 우선순위 순으로 정렬
    prioritizedCacheList(predictions) {
        return predictions
            .map(pkg => ({
                name: pkg,
                priority: this.calculateCachePriority(pkg)
            }))
            .sort((a, b) => b.priority - a.priority)
            .map(item => item.name);
    }
}