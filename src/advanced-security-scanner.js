/**
 * 고급 보안 스캐너
 * 다중 소스 취약점 데이터 통합 및 고급 분석
 */

import https from 'https';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

export class AdvancedSecurityScanner {
    constructor(options = {}) {
        this.options = {
            useNpmAudit: true,
            useOsvDatabase: true,
            useGitHubAdvisory: true,
            useSnykDatabase: false, // API 키 필요
            cacheResults: true,
            ...options
        };
        
        this.vulnerabilityDatabase = new Map();
        this.cacheDir = path.join(process.cwd(), '.packmate', 'security-cache');
        this.osv_API_BASE = 'https://api.osv.dev/v1';
        this.github_API_BASE = 'https://api.github.com/advisories';
        
        this.severityWeights = {
            critical: 10,
            high: 7,
            moderate: 4,
            low: 1,
            info: 0.1
        };
        
        this.ensureCacheDir();
    }

    ensureCacheDir() {
        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir, { recursive: true });
        }
    }

    // 종합 보안 스캔 실행
    async scanProject(projectPath, options = {}) {
        const { 
            includeDevDependencies = true,
            includePeerDependencies = false,
            deepScan = false,
            customSources = []
        } = options;

        console.log('🔒 Starting comprehensive security scan...');
        
        const scanResult = {
            sources: [],
            vulnerabilities: [],
            summary: {
                total: 0,
                critical: 0,
                high: 0,
                moderate: 0,
                low: 0,
                info: 0
            },
            packages: new Map(),
            recommendations: [],
            riskScore: 0,
            scanTimestamp: new Date().toISOString()
        };

        try {
            // 1. package.json 분석
            const packageJson = this.parsePackageJson(projectPath);
            const allPackages = this.extractPackages(packageJson, {
                includeDevDependencies,
                includePeerDependencies
            });

            console.log(`📦 Found ${allPackages.length} packages to scan`);

            // 2. 각 소스별 스캔 병렬 실행
            const scanPromises = [];
            
            if (this.options.useNpmAudit) {
                scanPromises.push(this.scanWithNpmAudit(projectPath));
            }
            
            if (this.options.useOsvDatabase) {
                scanPromises.push(this.scanWithOSV(allPackages));
            }
            
            if (this.options.useGitHubAdvisory) {
                scanPromises.push(this.scanWithGitHubAdvisory(allPackages));
            }

            // 커스텀 소스들
            customSources.forEach(source => {
                if (typeof source.scan === 'function') {
                    scanPromises.push(source.scan(allPackages));
                }
            });

            // 모든 스캔 결과 수집
            const scanResults = await Promise.allSettled(scanPromises);
            
            // 결과 통합 및 분석
            this.consolidateResults(scanResult, scanResults);
            
            // 위험도 점수 계산
            scanResult.riskScore = this.calculateRiskScore(scanResult.vulnerabilities);
            
            // 개선 권장사항 생성
            scanResult.recommendations = this.generateRecommendations(scanResult);
            
            console.log(`✅ Security scan completed. Found ${scanResult.summary.total} vulnerabilities`);
            
            return scanResult;
        } catch (error) {
            // 상세한 에러 분석 및 복구 시도
            console.error(`❌ Security scan failed: ${error.message}`);
            
            // 네트워크 오류 시 캐시된 결과 반환
            if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
                console.warn('🌐 Network issue detected, trying cached results...');
                const cachedResult = await this.getCachedScanResult(projectPath);
                if (cachedResult) {
                    console.log('📦 Using cached security scan results');
                    return cachedResult;
                }
            }
            
            // 부분적 실패 시 완료된 소스 결과라도 반환
            if (scanResult.sources.length > 0) {
                console.warn('⚠️ Partial scan completed, returning available results');
                return scanResult;
            }
            
            // 마지막 대안 - 기본 빈 결과 반환
            return this.getEmptyResult();
        }
    }

    parsePackageJson(projectPath) {
        // 입력 검증
        if (!projectPath || typeof projectPath !== 'string') {
            throw new Error('Invalid project path provided');
        }

        const packageJsonPath = path.join(projectPath, 'package.json');
        
        if (!fs.existsSync(packageJsonPath)) {
            throw new Error(`package.json not found at ${packageJsonPath}`);
        }

        try {
            const content = fs.readFileSync(packageJsonPath, 'utf-8');
            const parsed = JSON.parse(content);
            
            // 기본 구조 검증
            if (!parsed || typeof parsed !== 'object') {
                throw new Error('Invalid package.json structure');
            }

            return parsed;
        } catch (error) {
            if (error instanceof SyntaxError) {
                throw new Error(`Invalid JSON in package.json: ${error.message}`);
            }
            throw new Error(`Failed to read package.json: ${error.message}`);
        }
    }

    extractPackages(packageJson, options) {
        const packages = [];
        
        // 기본 의존성
        if (packageJson.dependencies) {
            Object.entries(packageJson.dependencies).forEach(([name, version]) => {
                packages.push({ name, version, type: 'dependency' });
            });
        }
        
        // 개발 의존성
        if (options.includeDevDependencies && packageJson.devDependencies) {
            Object.entries(packageJson.devDependencies).forEach(([name, version]) => {
                packages.push({ name, version, type: 'devDependency' });
            });
        }
        
        // Peer 의존성
        if (options.includePeerDependencies && packageJson.peerDependencies) {
            Object.entries(packageJson.peerDependencies).forEach(([name, version]) => {
                packages.push({ name, version, type: 'peerDependency' });
            });
        }
        
        return packages;
    }

    // npm audit 스캔
    async scanWithNpmAudit(projectPath) {
        try {
            console.log('🔍 Running npm audit...');
            const auditResult = execSync('npm audit --json', {
                cwd: projectPath,
                encoding: 'utf-8',
                timeout: 60000
            });

            const auditData = JSON.parse(auditResult);
            
            return {
                source: 'npm-audit',
                vulnerabilities: this.parseNpmAuditResults(auditData),
                metadata: auditData.metadata || {}
            };
        } catch (error) {
            // npm audit는 취약점 발견 시 exit code > 0
            if (error.stdout) {
                try {
                    const auditData = JSON.parse(error.stdout);
                    return {
                        source: 'npm-audit',
                        vulnerabilities: this.parseNpmAuditResults(auditData),
                        metadata: auditData.metadata || {}
                    };
                } catch (parseError) {
                    console.warn(`npm audit parse failed: ${parseError.message}`);
                }
            }
            return {
                source: 'npm-audit',
                vulnerabilities: [],
                error: error.message
            };
        }
    }

    parseNpmAuditResults(auditData) {
        const vulnerabilities = [];
        
        if (auditData.vulnerabilities) {
            Object.entries(auditData.vulnerabilities).forEach(([packageName, vulnData]) => {
                vulnData.via.forEach(vuln => {
                    if (typeof vuln === 'object') { // 직접적인 취약점
                        vulnerabilities.push({
                            id: `npm-${vuln.source}`,
                            source: 'npm-audit',
                            package: packageName,
                            severity: vuln.severity,
                            title: vuln.title,
                            url: vuln.url,
                            range: vuln.range,
                            cves: vuln.cves || [],
                            cvss: vuln.cvss || null,
                            fixedIn: vulnData.fixAvailable ? vulnData.fixAvailable.version : null
                        });
                    }
                });
            });
        }
        
        return vulnerabilities;
    }

    // OSV Database 스캔
    async scanWithOSV(packages) {
        try {
            console.log('🔍 Scanning OSV vulnerability database...');
            const vulnerabilities = [];
            
            // 배치별로 요청 (API 제한 고려)
            const batchSize = 10;
            for (let i = 0; i < packages.length; i += batchSize) {
                const batch = packages.slice(i, i + batchSize);
                const batchPromises = batch.map(pkg => this.queryOSVForPackage(pkg));
                
                const batchResults = await Promise.allSettled(batchPromises);
                batchResults.forEach(result => {
                    if (result.status === 'fulfilled' && result.value) {
                        vulnerabilities.push(...result.value);
                    }
                });
                
                // API 제한 방지를 위한 지연
                if (i + batchSize < packages.length) {
                    await new Promise(resolve => setTimeout(resolve, 200));
                }
            }
            
            return {
                source: 'osv-database',
                vulnerabilities,
                metadata: { queriedPackages: packages.length }
            };
        } catch (error) {
            console.warn(`OSV scan failed: ${error.message}`);
            return {
                source: 'osv-database',
                vulnerabilities: [],
                error: error.message
            };
        }
    }

    async queryOSVForPackage(packageInfo) {
        try {
            const query = {
                version: packageInfo.version,
                package: {
                    name: packageInfo.name,
                    ecosystem: "npm"
                }
            };

            const response = await this.httpPost(`${this.osv_API_BASE}/query`, query);
            
            if (response.vulns && response.vulns.length > 0) {
                return response.vulns.map(vuln => ({
                    id: vuln.id,
                    source: 'osv-database',
                    package: packageInfo.name,
                    severity: this.mapOSVSeverity(vuln.severity),
                    title: vuln.summary,
                    description: vuln.details,
                    references: vuln.references || [],
                    affectedVersions: vuln.affected?.map(a => a.ranges).flat() || [],
                    publishedAt: vuln.published,
                    modifiedAt: vuln.modified,
                    aliases: vuln.aliases || []
                }));
            }
            
            return [];
        } catch (error) {
            console.warn(`OSV query failed for ${packageInfo.name}: ${error.message}`);
            return [];
        }
    }

    mapOSVSeverity(severity) {
        if (!severity || !severity[0]) return 'unknown';
        
        const score = severity[0].score;
        if (score >= 9.0) return 'critical';
        if (score >= 7.0) return 'high';
        if (score >= 4.0) return 'moderate';
        return 'low';
    }

    // GitHub Advisory 스캔
    async scanWithGitHubAdvisory(packages) {
        try {
            console.log('🔍 Scanning GitHub Advisory database...');
            const vulnerabilities = [];
            
            // GitHub API는 검색 기반이므로 패키지별로 조회
            for (const pkg of packages) {
                const advisories = await this.queryGitHubAdvisory(pkg.name);
                vulnerabilities.push(...advisories);
                
                // API 제한 방지
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            return {
                source: 'github-advisory',
                vulnerabilities,
                metadata: { queriedPackages: packages.length }
            };
        } catch (error) {
            console.warn(`GitHub Advisory scan failed: ${error.message}`);
            return {
                source: 'github-advisory',
                vulnerabilities: [],
                error: error.message
            };
        }
    }

    async queryGitHubAdvisory(packageName) {
        try {
            // GitHub API는 검색 쿼리를 사용
            const searchUrl = `${this.github_API_BASE}?affects=${encodeURIComponent(packageName)}`;
            const response = await this.httpGet(searchUrl);
            
            return response.map(advisory => ({
                id: advisory.ghsa_id,
                source: 'github-advisory',
                package: packageName,
                severity: advisory.severity?.toLowerCase() || 'unknown',
                title: advisory.summary,
                description: advisory.description,
                url: advisory.html_url,
                publishedAt: advisory.published_at,
                updatedAt: advisory.updated_at,
                cvss: advisory.cvss,
                cves: advisory.cve_id ? [advisory.cve_id] : [],
                references: advisory.references || []
            }));
        } catch (error) {
            console.warn(`GitHub Advisory query failed for ${packageName}: ${error.message}`);
            return [];
        }
    }

    // HTTP 헬퍼 함수들
    async httpGet(url) {
        return new Promise((resolve, reject) => {
            https.get(url, {
                headers: {
                    'User-Agent': 'packmate-security-scanner',
                    'Accept': 'application/json'
                }
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch (error) {
                        reject(new Error(`JSON parse error: ${error.message}`));
                    }
                });
            }).on('error', reject);
        });
    }

    async httpPost(url, postData) {
        return new Promise((resolve, reject) => {
            const data = JSON.stringify(postData);
            const url_obj = new URL(url);
            
            const options = {
                hostname: url_obj.hostname,
                port: url_obj.port || 443,
                path: url_obj.pathname + url_obj.search,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(data),
                    'User-Agent': 'packmate-security-scanner'
                }
            };

            const req = https.request(options, (res) => {
                let responseData = '';
                res.on('data', chunk => responseData += chunk);
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(responseData));
                    } catch (error) {
                        reject(new Error(`JSON parse error: ${error.message}`));
                    }
                });
            });

            req.on('error', reject);
            req.write(data);
            req.end();
        });
    }

    // 결과 통합
    consolidateResults(scanResult, scanResults) {
        const vulnerabilityMap = new Map();
        
        scanResults.forEach(result => {
            if (result.status === 'fulfilled' && result.value) {
                const data = result.value;
                scanResult.sources.push(data.source);
                
                data.vulnerabilities.forEach(vuln => {
                    const key = `${vuln.package}-${vuln.id}`;
                    
                    if (vulnerabilityMap.has(key)) {
                        // 중복 취약점 - 소스 정보 추가
                        const existing = vulnerabilityMap.get(key);
                        existing.sources = existing.sources || [existing.source];
                        existing.sources.push(data.source);
                    } else {
                        vulnerabilityMap.set(key, vuln);
                    }
                });
            }
        });
        
        scanResult.vulnerabilities = Array.from(vulnerabilityMap.values());
        
        // 심각도별 요약
        scanResult.vulnerabilities.forEach(vuln => {
            const severity = vuln.severity || 'unknown';
            if (scanResult.summary[severity] !== undefined) {
                scanResult.summary[severity]++;
                scanResult.summary.total++;
            }
        });
    }

    // 위험도 점수 계산
    calculateRiskScore(vulnerabilities) {
        let totalScore = 0;
        let maxPossibleScore = 0;
        
        vulnerabilities.forEach(vuln => {
            const weight = this.severityWeights[vuln.severity] || 1;
            totalScore += weight;
            maxPossibleScore += 10; // 최대 점수는 critical 기준
        });
        
        return maxPossibleScore > 0 ? Math.round((totalScore / maxPossibleScore) * 100) : 0;
    }

    // 개선 권장사항 생성
    generateRecommendations(scanResult) {
        const recommendations = [];
        
        // 심각한 취약점 우선 처리
        const criticalVulns = scanResult.vulnerabilities.filter(v => v.severity === 'critical');
        if (criticalVulns.length > 0) {
            recommendations.push({
                priority: 'critical',
                type: 'immediate-action',
                title: `${criticalVulns.length}개의 치명적 취약점을 즉시 수정하세요`,
                description: '치명적 취약점은 시스템에 심각한 보안 위험을 초래할 수 있습니다.',
                packages: criticalVulns.map(v => v.package),
                actions: ['패키지 업데이트', '대안 패키지 검토', '보안 패치 적용']
            });
        }
        
        // 업데이트 가능한 패키지들
        const fixableVulns = scanResult.vulnerabilities.filter(v => v.fixedIn);
        if (fixableVulns.length > 0) {
            recommendations.push({
                priority: 'high',
                type: 'update-packages',
                title: '업데이트를 통해 수정 가능한 취약점이 있습니다',
                description: `${fixableVulns.length}개의 취약점을 패키지 업데이트로 해결할 수 있습니다.`,
                packages: fixableVulns.map(v => ({ name: v.package, fixVersion: v.fixedIn }))
            });
        }
        
        // 위험도가 높은 경우
        if (scanResult.riskScore > 70) {
            recommendations.push({
                priority: 'high',
                type: 'security-review',
                title: '전반적인 보안 검토가 필요합니다',
                description: `현재 보안 위험도가 ${scanResult.riskScore}점으로 매우 높습니다.`,
                actions: ['의존성 감사', '보안 정책 수립', '정기 스캔 설정']
            });
        }
        
        return recommendations;
    }

    // 캐시된 스캔 결과 조회
    async getCachedScanResult(projectPath) {
        try {
            const cacheKey = this.generateCacheKey(projectPath);
            const cachePath = path.join(this.cacheDir, `scan-${cacheKey}.json`);
            
            if (fs.existsSync(cachePath)) {
                const cached = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
                
                // 캐시 유효성 검사 (24시간)
                const ageInHours = (Date.now() - new Date(cached.scanTimestamp).getTime()) / (1000 * 60 * 60);
                if (ageInHours < 24) {
                    cached.fromCache = true;
                    return cached;
                }
            }
        } catch (error) {
            console.warn(`Cache read failed: ${error.message}`);
        }
        return null;
    }

    // 스캔 결과 캐시 저장
    async cacheScanResult(projectPath, result) {
        try {
            if (!this.options.cacheResults) return;
            
            const cacheKey = this.generateCacheKey(projectPath);
            const cachePath = path.join(this.cacheDir, `scan-${cacheKey}.json`);
            
            fs.writeFileSync(cachePath, JSON.stringify(result, null, 2));
        } catch (error) {
            console.warn(`Cache write failed: ${error.message}`);
        }
    }

    // 캐시 키 생성
    generateCacheKey(projectPath) {
        const packageJsonPath = path.join(projectPath, 'package.json');
        if (fs.existsSync(packageJsonPath)) {
            const content = fs.readFileSync(packageJsonPath, 'utf-8');
            return require('crypto').createHash('md5').update(content).digest('hex');
        }
        return require('crypto').createHash('md5').update(projectPath).digest('hex');
    }

    // 빈 결과 반환
    getEmptyResult() {
        return {
            sources: [],
            vulnerabilities: [],
            summary: {
                total: 0,
                critical: 0,
                high: 0,
                moderate: 0,
                low: 0,
                info: 0
            },
            packages: new Map(),
            recommendations: [],
            riskScore: 0,
            scanTimestamp: new Date().toISOString(),
            error: 'Scan failed, returning empty result'
        };
    }

    // 리소스 정리
    async cleanup() {
        // 오래된 캐시 파일 정리 (7일 이상)
        try {
            const files = fs.readdirSync(this.cacheDir);
            const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
            
            for (const file of files) {
                const filePath = path.join(this.cacheDir, file);
                const stats = fs.statSync(filePath);
                
                if (stats.mtime.getTime() < weekAgo) {
                    fs.unlinkSync(filePath);
                }
            }
        } catch (error) {
            console.warn(`Cache cleanup failed: ${error.message}`);
        }
    }
}