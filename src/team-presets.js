/**
 * 팀 설정 프리셋 템플릿
 * 다양한 보안 수준과 개발 환경에 맞는 미리 정의된 설정
 */

export const TEAM_PRESETS = {
    // 엄격한 보안 환경 (금융, 의료 등)
    strict: {
        version: '1.0.0',
        name: 'Strict Security Preset',
        description: 'Maximum security configuration for enterprise and regulated industries',
        
        rules: {
            dependencies: {
                allowPrerelease: false,
                allowDeprecated: false,
                enforceExactVersions: true,
                requireLockfile: true,
                allowedLicenses: ['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause'],
                blockedPackages: ['debug', 'node-uuid', 'request'],
                maxDependencyCount: 100,
                maxDevDependencyCount: 200
            },
            
            security: {
                enableAutomaticScans: true,
                blockCriticalVulnerabilities: true,
                blockHighVulnerabilities: true,
                maxVulnerabilities: 0,
                maxCvssScore: 4.0,
                requireSecurityReview: true,
                mandatorySecurityHeaders: true,
                disallowEvil: true
            },
            
            performance: {
                maxBundleSize: '1MB',
                limitDependencyLayers: 5,
                requireLazyLoading: true,
                enforceTreeShaking: true,
                mandatoryCodeSplitting: true
            },
            
            compliance: {
                requireChangelogUpdate: true,
                enforceSemanticVersioning: true,
                requireCodeSignature: true,
                mandatoryLicenseHeaders: true,
                requireSecurityAudit: true,
                enforceDataRetention: true
            },
            
            codeQuality: {
                minCoverage: 90,
                enforceTypescript: true,
                requireLinting: true,
                mandatoryTests: true,
                enforceDocumentation: true,
                requireCodeReview: true,
                branchProtection: true
            }
        },
        
        hooks: {
            'pre-commit': {
                enabled: true,
                scripts: [
                    'security-scan',
                    'quality-check',
                    'dependency-audit',
                    'license-check'
                ]
            },
            'pre-push': {
                enabled: true,
                scripts: [
                    'full-test-suite',
                    'security-audit',
                    'compliance-check'
                ]
            },
            'commit-msg': {
                enabled: true,
                enforceFormat: true,
                requireTicketNumber: true
            }
        },
        
        notifications: {
            securityAlerts: 'immediate',
            complianceViolations: 'immediate',
            dependencyUpdates: 'daily',
            codeQualityIssues: 'immediate'
        },
        
        overrides: {
            allowEmergencyCommits: false,
            emergencyContactRequired: true,
            bypassApprovalRequired: true
        }
    },

    // 보통 수준 (일반적인 비즈니스 애플리케이션)
    moderate: {
        version: '1.0.0',
        name: 'Moderate Security Preset', 
        description: 'Balanced security and development velocity for most business applications',
        
        rules: {
            dependencies: {
                allowPrerelease: false,
                allowDeprecated: false,
                enforceExactVersions: false,
                requireLockfile: true,
                allowedLicenses: ['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC'],
                blockedPackages: ['debug', 'request'],
                maxDependencyCount: 150,
                maxDevDependencyCount: 300
            },
            
            security: {
                enableAutomaticScans: true,
                blockCriticalVulnerabilities: true,
                blockHighVulnerabilities: false,
                maxVulnerabilities: 5,
                maxCvssScore: 7.0,
                requireSecurityReview: false,
                mandatorySecurityHeaders: false,
                disallowEvil: true
            },
            
            performance: {
                maxBundleSize: '2MB',
                limitDependencyLayers: 8,
                requireLazyLoading: false,
                enforceTreeShaking: false,
                mandatoryCodeSplitting: false
            },
            
            compliance: {
                requireChangelogUpdate: true,
                enforceSemanticVersioning: true,
                requireCodeSignature: false,
                mandatoryLicenseHeaders: false,
                requireSecurityAudit: false,
                enforceDataRetention: false
            },
            
            codeQuality: {
                minCoverage: 70,
                enforceTypescript: false,
                requireLinting: true,
                mandatoryTests: true,
                enforceDocumentation: false,
                requireCodeReview: true,
                branchProtection: true
            }
        },
        
        hooks: {
            'pre-commit': {
                enabled: true,
                scripts: [
                    'lint-check',
                    'basic-tests',
                    'dependency-check'
                ]
            },
            'pre-push': {
                enabled: true,
                scripts: [
                    'test-suite',
                    'security-scan'
                ]
            },
            'commit-msg': {
                enabled: true,
                enforceFormat: true,
                requireTicketNumber: false
            }
        },
        
        notifications: {
            securityAlerts: 'immediate',
            complianceViolations: 'daily',
            dependencyUpdates: 'weekly',
            codeQualityIssues: 'daily'
        },
        
        overrides: {
            allowEmergencyCommits: true,
            emergencyContactRequired: false,
            bypassApprovalRequired: false
        }
    },

    // 느슨한 설정 (개발 초기, 프로토타입 등)
    loose: {
        version: '1.0.0',
        name: 'Loose Development Preset',
        description: 'Minimal restrictions for rapid development and prototyping',
        
        rules: {
            dependencies: {
                allowPrerelease: true,
                allowDeprecated: true,
                enforceExactVersions: false,
                requireLockfile: false,
                allowedLicenses: '*',
                blockedPackages: [],
                maxDependencyCount: 300,
                maxDevDependencyCount: 500
            },
            
            security: {
                enableAutomaticScans: true,
                blockCriticalVulnerabilities: false,
                blockHighVulnerabilities: false,
                maxVulnerabilities: 50,
                maxCvssScore: 10.0,
                requireSecurityReview: false,
                mandatorySecurityHeaders: false,
                disallowEvil: false
            },
            
            performance: {
                maxBundleSize: '10MB',
                limitDependencyLayers: 15,
                requireLazyLoading: false,
                enforceTreeShaking: false,
                mandatoryCodeSplitting: false
            },
            
            compliance: {
                requireChangelogUpdate: false,
                enforceSemanticVersioning: false,
                requireCodeSignature: false,
                mandatoryLicenseHeaders: false,
                requireSecurityAudit: false,
                enforceDataRetention: false
            },
            
            codeQuality: {
                minCoverage: 30,
                enforceTypescript: false,
                requireLinting: false,
                mandatoryTests: false,
                enforceDocumentation: false,
                requireCodeReview: false,
                branchProtection: false
            }
        },
        
        hooks: {
            'pre-commit': {
                enabled: false,
                scripts: []
            },
            'pre-push': {
                enabled: false,
                scripts: []
            },
            'commit-msg': {
                enabled: false,
                enforceFormat: false,
                requireTicketNumber: false
            }
        },
        
        notifications: {
            securityAlerts: 'weekly',
            complianceViolations: 'never',
            dependencyUpdates: 'monthly',
            codeQualityIssues: 'never'
        },
        
        overrides: {
            allowEmergencyCommits: true,
            emergencyContactRequired: false,
            bypassApprovalRequired: false
        }
    },

    // 오픈소스 프로젝트용
    opensource: {
        version: '1.0.0',
        name: 'Open Source Project Preset',
        description: 'Configuration optimized for open source development and community contributions',
        
        rules: {
            dependencies: {
                allowPrerelease: false,
                allowDeprecated: false,
                enforceExactVersions: false,
                requireLockfile: true,
                allowedLicenses: ['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'GPL-3.0', 'LGPL-2.1'],
                blockedPackages: ['debug'],
                maxDependencyCount: 200,
                maxDevDependencyCount: 400
            },
            
            security: {
                enableAutomaticScans: true,
                blockCriticalVulnerabilities: true,
                blockHighVulnerabilities: false,
                maxVulnerabilities: 10,
                maxCvssScore: 8.0,
                requireSecurityReview: false,
                mandatorySecurityHeaders: false,
                disallowEvil: true
            },
            
            performance: {
                maxBundleSize: '5MB',
                limitDependencyLayers: 10,
                requireLazyLoading: false,
                enforceTreeShaking: true,
                mandatoryCodeSplitting: false
            },
            
            compliance: {
                requireChangelogUpdate: true,
                enforceSemanticVersioning: true,
                requireCodeSignature: false,
                mandatoryLicenseHeaders: true,
                requireSecurityAudit: false,
                enforceDataRetention: false
            },
            
            codeQuality: {
                minCoverage: 80,
                enforceTypescript: false,
                requireLinting: true,
                mandatoryTests: true,
                enforceDocumentation: true,
                requireCodeReview: true,
                branchProtection: true
            }
        },
        
        hooks: {
            'pre-commit': {
                enabled: true,
                scripts: [
                    'lint-check',
                    'format-check',
                    'test-affected'
                ]
            },
            'pre-push': {
                enabled: true,
                scripts: [
                    'full-test-suite',
                    'build-check'
                ]
            },
            'commit-msg': {
                enabled: true,
                enforceFormat: true,
                requireTicketNumber: false
            }
        },
        
        notifications: {
            securityAlerts: 'immediate',
            complianceViolations: 'immediate',
            dependencyUpdates: 'weekly',
            codeQualityIssues: 'weekly'
        },
        
        overrides: {
            allowEmergencyCommits: false,
            emergencyContactRequired: false,
            bypassApprovalRequired: true
        }
    },

    // 스타트업/애자일 개발용
    startup: {
        version: '1.0.0',
        name: 'Startup Agile Preset',
        description: 'Fast-moving development with essential safety nets',
        
        rules: {
            dependencies: {
                allowPrerelease: true,
                allowDeprecated: false,
                enforceExactVersions: false,
                requireLockfile: true,
                allowedLicenses: ['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC'],
                blockedPackages: ['request'],
                maxDependencyCount: 250,
                maxDevDependencyCount: 400
            },
            
            security: {
                enableAutomaticScans: true,
                blockCriticalVulnerabilities: true,
                blockHighVulnerabilities: false,
                maxVulnerabilities: 15,
                maxCvssScore: 8.5,
                requireSecurityReview: false,
                mandatorySecurityHeaders: false,
                disallowEvil: true
            },
            
            performance: {
                maxBundleSize: '3MB',
                limitDependencyLayers: 12,
                requireLazyLoading: false,
                enforceTreeShaking: false,
                mandatoryCodeSplitting: false
            },
            
            compliance: {
                requireChangelogUpdate: false,
                enforceSemanticVersioning: false,
                requireCodeSignature: false,
                mandatoryLicenseHeaders: false,
                requireSecurityAudit: false,
                enforceDataRetention: false
            },
            
            codeQuality: {
                minCoverage: 60,
                enforceTypescript: false,
                requireLinting: true,
                mandatoryTests: false,
                enforceDocumentation: false,
                requireCodeReview: false,
                branchProtection: false
            }
        },
        
        hooks: {
            'pre-commit': {
                enabled: true,
                scripts: [
                    'lint-check',
                    'quick-tests'
                ]
            },
            'pre-push': {
                enabled: true,
                scripts: [
                    'security-scan'
                ]
            },
            'commit-msg': {
                enabled: false,
                enforceFormat: false,
                requireTicketNumber: false
            }
        },
        
        notifications: {
            securityAlerts: 'immediate',
            complianceViolations: 'weekly',
            dependencyUpdates: 'weekly',
            codeQualityIssues: 'weekly'
        },
        
        overrides: {
            allowEmergencyCommits: true,
            emergencyContactRequired: false,
            bypassApprovalRequired: false
        }
    }
};

// 프리셋 유틸리티 함수들
export class PresetManager {
    static getAllPresets() {
        return Object.keys(TEAM_PRESETS);
    }

    static getPreset(name) {
        return TEAM_PRESETS[name];
    }

    static validatePreset(preset) {
        const required = ['version', 'name', 'description', 'rules'];
        
        for (const field of required) {
            if (!preset[field]) {
                throw new Error(`Missing required field: ${field}`);
            }
        }
        
        return true;
    }

    static mergePresets(basePreset, overrides) {
        return this.deepMerge(basePreset, overrides);
    }

    static deepMerge(target, source) {
        const result = { ...target };
        
        for (const key in source) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                result[key] = this.deepMerge(target[key] || {}, source[key]);
            } else {
                result[key] = source[key];
            }
        }
        
        return result;
    }

    static createCustomPreset(baseName, customizations, newName) {
        const basePreset = this.getPreset(baseName);
        if (!basePreset) {
            throw new Error(`Base preset '${baseName}' not found`);
        }
        
        const customPreset = this.mergePresets(basePreset, customizations);
        customPreset.name = newName;
        customPreset.description = `Custom preset based on ${baseName}`;
        
        return customPreset;
    }

    static exportPreset(preset) {
        return JSON.stringify(preset, null, 2);
    }

    static importPreset(jsonString) {
        try {
            const preset = JSON.parse(jsonString);
            this.validatePreset(preset);
            return preset;
        } catch (error) {
            throw new Error(`Invalid preset format: ${error.message}`);
        }
    }

    static getPresetRecommendation(projectType, teamSize, securityLevel) {
        // 프로젝트 타입과 팀 상황에 따른 프리셋 추천
        const recommendations = {
            'financial': 'strict',
            'healthcare': 'strict',
            'government': 'strict',
            'enterprise': 'moderate',
            'business': 'moderate',
            'opensource': 'opensource',
            'startup': 'startup',
            'prototype': 'loose',
            'personal': 'loose'
        };

        // 팀 크기 고려
        if (teamSize > 20) {
            if (recommendations[projectType] === 'loose') {
                return 'moderate';
            }
        }

        // 보안 수준 고려
        if (securityLevel === 'high') {
            return 'strict';
        } else if (securityLevel === 'low') {
            return 'loose';
        }

        return recommendations[projectType] || 'moderate';
    }

    static comparePresets(preset1Name, preset2Name) {
        const preset1 = this.getPreset(preset1Name);
        const preset2 = this.getPreset(preset2Name);
        
        if (!preset1 || !preset2) {
            throw new Error('One or both presets not found');
        }

        const differences = [];
        
        this.compareObjects(preset1.rules, preset2.rules, 'rules', differences);
        this.compareObjects(preset1.hooks, preset2.hooks, 'hooks', differences);
        
        return {
            preset1: preset1Name,
            preset2: preset2Name,
            differences
        };
    }

    static compareObjects(obj1, obj2, path, differences) {
        const allKeys = new Set([...Object.keys(obj1 || {}), ...Object.keys(obj2 || {})]);
        
        for (const key of allKeys) {
            const currentPath = `${path}.${key}`;
            const val1 = obj1?.[key];
            const val2 = obj2?.[key];
            
            if (val1 !== val2) {
                if (typeof val1 === 'object' && typeof val2 === 'object') {
                    this.compareObjects(val1, val2, currentPath, differences);
                } else {
                    differences.push({
                        path: currentPath,
                        preset1Value: val1,
                        preset2Value: val2
                    });
                }
            }
        }
    }
}