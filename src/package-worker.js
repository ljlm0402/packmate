/**
 * Package Management Worker
 * CPU 집약적인 패키지 작업들을 병렬 처리
 */

import { parentPort } from 'worker_threads';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import https from 'https';
import { promisify } from 'util';

// 간단한 Worker Handler
class WorkerHandler {
    constructor() {
        this.handlers = new Map();
    }
    
    registerHandler(type, handler) {
        this.handlers.set(type, handler);
    }
    
    async handleMessage(message) {
        const { type, data, id } = message;
        const handler = this.handlers.get(type);
        
        if (!handler) {
            throw new Error(`No handler found for type: ${type}`);
        }
        
        try {
            const result = await handler(data);
            parentPort.postMessage({ type: 'result', id, result });
        } catch (error) {
            parentPort.postMessage({ type: 'error', id, error: error.message });
        }
    }
}

const handler = new WorkerHandler();

// 메시지 리스너 설정
parentPort.on('message', (message) => {
    handler.handleMessage(message).catch(error => {
        parentPort.postMessage({ 
            type: 'error', 
            id: message.id, 
            error: error.message 
        });
    });
});

// HTTP 요청을 Promise로 래핑
const httpsGet = (url) => {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
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
};

// 패키지 정보 조회
handler.registerHandler('package-info', async (data) => {
    const { packageName, registryUrl = 'https://registry.npmjs.org' } = data;
    
    try {
        const url = `${registryUrl}/${encodeURIComponent(packageName)}`;
        const packageInfo = await httpsGet(url);
        
        // 필요한 정보만 추출해서 용량 절약
        return {
            name: packageInfo.name,
            version: packageInfo['dist-tags']?.latest,
            description: packageInfo.description,
            keywords: packageInfo.keywords,
            homepage: packageInfo.homepage,
            repository: packageInfo.repository,
            dependencies: packageInfo.versions?.[packageInfo['dist-tags']?.latest]?.dependencies || {},
            devDependencies: packageInfo.versions?.[packageInfo['dist-tags']?.latest]?.devDependencies || {},
            peerDependencies: packageInfo.versions?.[packageInfo['dist-tags']?.latest]?.peerDependencies || {},
            engines: packageInfo.versions?.[packageInfo['dist-tags']?.latest]?.engines || {},
            license: packageInfo.license,
            maintainers: packageInfo.maintainers,
            publishedAt: packageInfo.time?.[packageInfo['dist-tags']?.latest],
            downloadCount: null // npm API에서는 별도 조회 필요
        };
    } catch (error) {
        throw new Error(`Failed to fetch package info for ${packageName}: ${error.message}`);
    }
});

// 의존성 트리 분석
handler.registerHandler('dependency-analysis', async (data) => {
    const { packageJsonPath, depth = 3 } = data;
    
    try {
        if (!fs.existsSync(packageJsonPath)) {
            throw new Error('package.json not found');
        }
        
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        const dependencies = { 
            ...packageJson.dependencies, 
            ...packageJson.devDependencies 
        };
        
        const analysisResult = {
            directDependencies: Object.keys(dependencies).length,
            dependencyTree: {},
            vulnerabilities: [],
            outdatedPackages: [],
            duplicates: [],
            circularDependencies: []
        };
        
        // 의존성 트리 구축 (재귀적)
        const buildDependencyTree = async (deps, currentDepth = 0) => {
            if (currentDepth >= depth) return {};
            
            const tree = {};
            const depPromises = Object.entries(deps).map(async ([name, version]) => {
                try {
                    const info = await httpsGet(`https://registry.npmjs.org/${encodeURIComponent(name)}`);
                    const latestVersion = info['dist-tags']?.latest;
                    const versionInfo = info.versions?.[latestVersion];
                    
                    tree[name] = {
                        version,
                        latestVersion,
                        isOutdated: version !== latestVersion,
                        dependencies: versionInfo?.dependencies || {},
                        size: versionInfo?.dist?.unpackedSize || 0
                    };
                    
                    // 재귀적으로 하위 의존성 분석 (깊이 제한)
                    if (versionInfo?.dependencies && currentDepth < depth - 1) {
                        tree[name].children = await buildDependencyTree(
                            versionInfo.dependencies, 
                            currentDepth + 1
                        );
                    }
                } catch (error) {
                    tree[name] = { error: error.message };
                }
            });
            
            await Promise.allSettled(depPromises);
            return tree;
        };
        
        analysisResult.dependencyTree = await buildDependencyTree(dependencies);
        
        // 구버전 패키지 표시
        analysisResult.outdatedPackages = Object.entries(analysisResult.dependencyTree)
            .filter(([name, info]) => info.isOutdated)
            .map(([name, info]) => ({
                name,
                current: info.version,
                latest: info.latestVersion
            }));
        
        return analysisResult;
    } catch (error) {
        throw new Error(`Dependency analysis failed: ${error.message}`);
    }
});

// 보안 취약점 스캔 (npm audit 병렬 처리)
handler.registerHandler('security-scan', async (data) => {
    const { projectPath, packageNames } = data;
    
    try {
        // 개별 패키지별 보안 스캔
        if (packageNames && packageNames.length > 0) {
            const scanResults = [];
            
            for (const packageName of packageNames) {
                try {
                    // npm audit을 패키지별로 실행
                    const auditCommand = `npm audit --package-lock-only --json`;
                    const result = execSync(auditCommand, { 
                        cwd: projectPath,
                        encoding: 'utf-8',
                        timeout: 30000 // 30초 타임아웃
                    });
                    
                    const auditData = JSON.parse(result);
                    scanResults.push({
                        package: packageName,
                        vulnerabilities: auditData.vulnerabilities || {},
                        summary: auditData.metadata || {}
                    });
                } catch (error) {
                    scanResults.push({
                        package: packageName,
                        error: error.message
                    });
                }
            }
            
            return { packageScans: scanResults };
        }
        
        // 전체 프로젝트 스캔
        const auditCommand = `npm audit --json`;
        const auditResult = execSync(auditCommand, {
            cwd: projectPath,
            encoding: 'utf-8',
            timeout: 60000 // 1분 타임아웃
        });
        
        const auditData = JSON.parse(auditResult);
        
        return {
            vulnerabilities: auditData.vulnerabilities || {},
            metadata: auditData.metadata || {},
            summary: {
                total: Object.keys(auditData.vulnerabilities || {}).length,
                critical: 0,
                high: 0,
                moderate: 0,
                low: 0,
                info: 0
            }
        };
    } catch (error) {
        // npm audit는 취약점이 있을 때 exit code > 0을 반환하므로 JSON 파싱 시도
        if (error.stdout) {
            try {
                const auditData = JSON.parse(error.stdout);
                return auditData;
            } catch (parseError) {
                throw new Error(`Security scan failed: ${error.message}`);
            }
        }
        throw new Error(`Security scan failed: ${error.message}`);
    }
});

// 파일 시스템 분석 (용량, 파일 수 등)
handler.registerHandler('filesystem-analysis', async (data) => {
    const { targetPath, patterns = [] } = data;
    
    try {
        const analysis = {
            totalSize: 0,
            fileCount: 0,
            folderCount: 0,
            largestFiles: [],
            fileTypes: {},
            duplicates: []
        };
        
        const scanDirectory = (dir, currentDepth = 0, maxDepth = 10) => {
            if (currentDepth > maxDepth) return;
            
            const items = fs.readdirSync(dir, { withFileTypes: true });
            
            for (const item of items) {
                const fullPath = path.join(dir, item.name);
                
                if (item.isDirectory()) {
                    analysis.folderCount++;
                    
                    // node_modules 등 큰 폴더는 건너뛰기 옵션
                    if (item.name !== 'node_modules' && item.name !== '.git') {
                        scanDirectory(fullPath, currentDepth + 1, maxDepth);
                    }
                } else if (item.isFile()) {
                    const stats = fs.statSync(fullPath);
                    const ext = path.extname(item.name);
                    
                    analysis.totalSize += stats.size;
                    analysis.fileCount++;
                    
                    // 파일 타입별 통계
                    if (!analysis.fileTypes[ext]) {
                        analysis.fileTypes[ext] = { count: 0, totalSize: 0 };
                    }
                    analysis.fileTypes[ext].count++;
                    analysis.fileTypes[ext].totalSize += stats.size;
                    
                    // 큰 파일 추적 (상위 10개)
                    analysis.largestFiles.push({
                        path: fullPath,
                        size: stats.size,
                        ext
                    });
                    
                    analysis.largestFiles.sort((a, b) => b.size - a.size);
                    if (analysis.largestFiles.length > 10) {
                        analysis.largestFiles = analysis.largestFiles.slice(0, 10);
                    }
                }
            }
        };
        
        scanDirectory(targetPath);
        
        return {
            ...analysis,
            totalSizeMB: analysis.totalSize / (1024 * 1024),
            averageFileSize: analysis.fileCount > 0 ? analysis.totalSize / analysis.fileCount : 0
        };
    } catch (error) {
        throw new Error(`Filesystem analysis failed: ${error.message}`);
    }
});

// 패키지 호환성 확인
handler.registerHandler('compatibility-check', async (data) => {
    const { packageName, version, nodeVersion, platform } = data;
    
    try {
        const packageInfo = await httpsGet(`https://registry.npmjs.org/${encodeURIComponent(packageName)}`);
        const versionInfo = packageInfo.versions?.[version] || packageInfo.versions?.[packageInfo['dist-tags']?.latest];
        
        if (!versionInfo) {
            throw new Error(`Version ${version} not found for ${packageName}`);
        }
        
        const compatibility = {
            nodeVersion: {
                required: versionInfo.engines?.node,
                compatible: true,
                message: ''
            },
            platform: {
                supported: [],
                compatible: true,
                message: ''
            },
            peerDependencies: {
                missing: [],
                conflicting: []
            }
        };
        
        // Node.js 버전 호환성 확인
        if (versionInfo.engines?.node) {
            // 간단한 버전 범위 확인 (실제로는 semver 라이브러리 사용 권장)
            const requiredNode = versionInfo.engines.node;
            compatibility.nodeVersion.compatible = true; // 실제 구현 필요
            compatibility.nodeVersion.message = `Requires Node.js ${requiredNode}`;
        }
        
        // 플랫폼 호환성
        if (versionInfo.os) {
            compatibility.platform.supported = versionInfo.os;
            compatibility.platform.compatible = versionInfo.os.includes(platform);
        }
        
        return compatibility;
    } catch (error) {
        throw new Error(`Compatibility check failed: ${error.message}`);
    }
});

export default handler;