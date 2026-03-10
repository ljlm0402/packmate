/**
 * Security Vulnerability Checker Module
 * 패키지 보안 취약성 검사 및 분류
 */

import { execSync } from 'child_process';
import process from 'process';

// 취약성 심각도 분류
export const SEVERITY_LEVELS = {
    CRITICAL: 'critical',
    HIGH: 'high', 
    MODERATE: 'moderate',
    LOW: 'low',
    INFO: 'info'
};

// 취약성 상세 정보 구조
export class Vulnerability {
    constructor({
        packageName,
        severity,
        title,
        description,
        vulnerableVersions,
        patchedVersions,
        cve,
        advisoryUrl,
        source = 'npm'
    }) {
        this.packageName = packageName;
        this.severity = severity;
        this.title = title;
        this.description = description;
        this.vulnerableVersions = vulnerableVersions;
        this.patchedVersions = patchedVersions;
        this.cve = cve;
        this.advisoryUrl = advisoryUrl;
        this.source = source;
        this.detectedAt = new Date().toISOString();
    }
}

/**
 * npm audit API를 통한 취약성 검사
 */
export async function checkNpmAudit() {
    try {
        // npm audit --json 실행하여 JSON 결과 획득
        const auditResult = execSync('npm audit --json', {
            encoding: 'utf-8',
            stdio: 'pipe',
            shell: true,
            cwd: process.cwd()
        });
        
        const auditData = JSON.parse(auditResult);
        return parseNpmAuditResult(auditData);
        
    } catch (error) {
        // npm audit는 취약성이 발견되면 non-zero exit code 반환
        // 이는 정상적인 동작이므로 JSON 파싱을 시도
        try {
            const auditData = JSON.parse(error.stdout || error.message);
            return parseNpmAuditResult(auditData);
        } catch (parseError) {
            console.warn(`[Security] npm audit failed: ${parseError.message}`);
            return [];
        }
    }
}

/**
 * npm audit 결과를 표준화된 Vulnerability 객체로 변환
 */
function parseNpmAuditResult(auditData) {
    const vulnerabilities = [];
    
    // npm audit v7+ 형식 (advisories)
    if (auditData.advisories) {
        for (const [advisoryId, advisory] of Object.entries(auditData.advisories)) {
            const vulnerability = new Vulnerability({
                packageName: advisory.module_name,
                severity: mapNpmSeverity(advisory.severity),
                title: advisory.title,
                description: advisory.overview,
                vulnerableVersions: advisory.vulnerable_versions,
                patchedVersions: advisory.patched_versions,
                cve: advisory.cves?.[0] || null,
                advisoryUrl: advisory.url,
                source: 'npm-audit'
            });
            vulnerabilities.push(vulnerability);
        }
    }
    
    // npm audit v8+ 형식 (vulnerabilities)
    if (auditData.vulnerabilities) {
        for (const [packageName, vulnInfo] of Object.entries(auditData.vulnerabilities)) {
            if (vulnInfo.via && Array.isArray(vulnInfo.via)) {
                vulnInfo.via.forEach(via => {
                    if (typeof via === 'object') {
                        const vulnerability = new Vulnerability({
                            packageName: packageName,
                            severity: mapNpmSeverity(via.severity),
                            title: via.title,
                            description: via.description || 'No description available',
                            vulnerableVersions: via.range || 'Unknown',
                            patchedVersions: 'See advisory',
                            cve: via.cve?.join(', ') || null,
                            advisoryUrl: via.url,
                            source: 'npm-audit'
                        });
                        vulnerabilities.push(vulnerability);
                    }
                });
            }
        }
    }
    
    return vulnerabilities;
}

/**
 * npm audit severity를 표준 severity로 매핑
 */
function mapNpmSeverity(npmSeverity) {
    const mapping = {
        'critical': SEVERITY_LEVELS.CRITICAL,
        'high': SEVERITY_LEVELS.HIGH,
        'moderate': SEVERITY_LEVELS.MODERATE,
        'low': SEVERITY_LEVELS.LOW,
        'info': SEVERITY_LEVELS.INFO
    };
    return mapping[npmSeverity] || SEVERITY_LEVELS.LOW;
}

/**
 * 패키지별 취약성 그룹화
 */
export function groupVulnerabilitiesByPackage(vulnerabilities) {
    const grouped = {};
    
    vulnerabilities.forEach(vuln => {
        if (!grouped[vuln.packageName]) {
            grouped[vuln.packageName] = [];
        }
        grouped[vuln.packageName].push(vuln);
    });
    
    return grouped;
}

/**
 * 심각도별 취약성 분류
 */
export function classifyBySeverity(vulnerabilities) {
    const classified = {
        [SEVERITY_LEVELS.CRITICAL]: [],
        [SEVERITY_LEVELS.HIGH]: [],
        [SEVERITY_LEVELS.MODERATE]: [],
        [SEVERITY_LEVELS.LOW]: [],
        [SEVERITY_LEVELS.INFO]: []
    };
    
    vulnerabilities.forEach(vuln => {
        if (classified[vuln.severity]) {
            classified[vuln.severity].push(vuln);
        } else {
            classified[SEVERITY_LEVELS.LOW].push(vuln);
        }
    });
    
    return classified;
}

/**
 * 메인 보안 검사 함수
 */
export async function checkVulnerabilities() {
    console.log('🔍 Running security vulnerability scan...');
    
    try {
        // 현재는 npm audit만 지원, 향후 확장 예정
        const npmVulns = await checkNpmAudit();
        
        console.log(`📊 Found ${npmVulns.length} potential vulnerabilities`);
        
        const classified = classifyBySeverity(npmVulns);
        const grouped = groupVulnerabilitiesByPackage(npmVulns);
        
        return {
            vulnerabilities: npmVulns,
            classified: classified,
            grouped: grouped,
            summary: {
                total: npmVulns.length,
                critical: classified[SEVERITY_LEVELS.CRITICAL].length,
                high: classified[SEVERITY_LEVELS.HIGH].length,
                moderate: classified[SEVERITY_LEVELS.MODERATE].length,
                low: classified[SEVERITY_LEVELS.LOW].length,
                info: classified[SEVERITY_LEVELS.INFO].length
            }
        };
        
    } catch (error) {
        console.error('❌ Security scan failed:', error.message);
        return {
            vulnerabilities: [],
            classified: {},
            grouped: {},
            summary: { total: 0, critical: 0, high: 0, moderate: 0, low: 0, info: 0 }
        };
    }
}

/**
 * 보안 검사 결과를 사용자 친화적 형태로 포맷
 */
export function formatSecuritySummary(securityResults) {
    const { summary } = securityResults;
    
    if (summary.total === 0) {
        return '✅ No vulnerabilities found!';
    }
    
    let output = `🔍 Security Scan Results:\n`;
    
    if (summary.critical > 0) {
        output += `🚨 Critical: ${summary.critical}\n`;
    }
    if (summary.high > 0) {
        output += `⚠️  High: ${summary.high}\n`;
    }
    if (summary.moderate > 0) {
        output += `💛 Moderate: ${summary.moderate}\n`;
    }
    if (summary.low > 0) {
        output += `ℹ️  Low: ${summary.low}\n`;
    }
    if (summary.info > 0) {
        output += `📋 Info: ${summary.info}\n`;
    }
    
    return output.trim();
}