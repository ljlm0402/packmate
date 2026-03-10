/**
 * Phase 2 Complete Integration Test
 * Tests all major systems and features
 */

import { EnhancedPackmateController } from './src/enhanced-controller.js';
import fs from 'fs';
import path from 'path';

async function runIntegrationTest() {
    console.log('🚀 Packmate v2.2.0 Phase 2 - Complete Integration Test\n');
    
    let controller;
    let allTestsPassed = true;
    const testResults = [];
    
    try {
        // 1. Controller Initialization Test
        console.log('📦 Test 1: Enhanced Controller Initialization...');
        controller = new EnhancedPackmateController();
        testResults.push({ test: 'Controller Initialization', status: 'PASS' });
        console.log('✅ Controller initialized successfully\n');
        
        // 2. System Health Check Test
        console.log('🔍 Test 2: System Health Check...');
        await controller.performSystemCheck();
        testResults.push({ test: 'System Health Check', status: 'PASS' });
        console.log('✅ System health check completed\n');
        
        // 3. Worker Pool Test
        console.log('⚡ Test 3: Worker Pool Functionality...');
        if (controller.workerPool && controller.workerPool.isHealthy()) {
            try {
                const result = await controller.workerPool.execute('test', { message: 'integration-test' });
                if (result.data && result.data.message) {
                    testResults.push({ test: 'Worker Pool', status: 'PASS' });
                    console.log('✅ Worker pool test successful\n');
                } else {
                    throw new Error('Invalid worker response');
                }
            } catch (error) {
                testResults.push({ test: 'Worker Pool', status: 'FAIL', error: error.message });
                console.log(`❌ Worker pool test failed: ${error.message}\n`);
                allTestsPassed = false;
            }
        } else {
            testResults.push({ test: 'Worker Pool', status: 'FAIL', error: 'Worker pool not healthy' });
            console.log('❌ Worker pool not healthy\n');
            allTestsPassed = false;
        }
        
        // 4. Cache Systems Test
        console.log('💾 Test 4: Cache Systems...');
        try {
            // Compressed Cache
            const cacheHealthy = await controller.compressedCache.isHealthy();
            if (!cacheHealthy) {
                throw new Error('Compressed cache not healthy');
            }
            
            // Predictive Cache directory existence
            const predictiveCacheExists = fs.existsSync(path.join(controller.cacheDir, 'predictive'));
            if (!predictiveCacheExists) {
                throw new Error('Predictive cache directory not found');
            }
            
            testResults.push({ test: 'Cache Systems', status: 'PASS' });
            console.log('✅ All cache systems operational\n');
        } catch (error) {
            testResults.push({ test: 'Cache Systems', status: 'FAIL', error: error.message });
            console.log(`❌ Cache systems test failed: ${error.message}\n`);
            allTestsPassed = false;
        }
        
        // 5. Security Scanner Test
        console.log('🛡️ Test 5: Security Scanner...');
        try {
            if (!controller.securityScanner) {
                throw new Error('Security scanner not initialized');
            }
            
            testResults.push({ test: 'Security Scanner', status: 'PASS' });
            console.log('✅ Security scanner ready\n');
        } catch (error) {
            testResults.push({ test: 'Security Scanner', status: 'FAIL', error: error.message });
            console.log(`❌ Security scanner test failed: ${error.message}\n`);
            allTestsPassed = false;
        }
        
        // 6. Advanced Analyzer Test (Phase 2)
        console.log('🔬 Test 6: Advanced Analyzer...');
        try {
            if (!controller.analyzer) {
                throw new Error('Advanced analyzer not initialized');
            }
            
            testResults.push({ test: 'Advanced Analyzer', status: 'PASS' });
            console.log('✅ Advanced analyzer ready\n');
        } catch (error) {
            testResults.push({ test: 'Advanced Analyzer', status: 'FAIL', error: error.message });
            console.log(`❌ Advanced analyzer test failed: ${error.message}\n`);
            allTestsPassed = false;
        }
        
        // 7. Team Configuration Test (Phase 2)
        console.log('👥 Test 7: Team Configuration...');
        try {
            if (!controller.teamConfig) {
                throw new Error('Team config manager not initialized');
            }
            
            testResults.push({ test: 'Team Configuration', status: 'PASS' });
            console.log('✅ Team configuration system ready\n');
        } catch (error) {
            testResults.push({ test: 'Team Configuration', status: 'FAIL', error: error.message });
            console.log(`❌ Team configuration test failed: ${error.message}\n`);
            allTestsPassed = false;
        }
        
        // 8. Policy Validation Engine Test (Phase 2)
        console.log('📋 Test 8: Policy Validation Engine...');
        try {
            if (!controller.policyEngine) {
                throw new Error('Policy validation engine not initialized');
            }
            
            testResults.push({ test: 'Policy Validation Engine', status: 'PASS' });
            console.log('✅ Policy validation engine ready\n');
        } catch (error) {
            testResults.push({ test: 'Policy Validation Engine', status: 'FAIL', error: error.message });
            console.log(`❌ Policy validation engine test failed: ${error.message}\n`);
            allTestsPassed = false;
        }
        
        // 9. UI System Test
        console.log('🎨 Test 9: Enhanced UI System...');
        try {
            if (!controller.ui) {
                throw new Error('UI system not initialized');
            }
            
            // Test UI methods
            controller.ui.note('Test', 'UI system test successful');
            
            testResults.push({ test: 'Enhanced UI System', status: 'PASS' });
            console.log('✅ Enhanced UI system operational\n');
        } catch (error) {
            testResults.push({ test: 'Enhanced UI System', status: 'FAIL', error: error.message });
            console.log(`❌ Enhanced UI system test failed: ${error.message}\n`);
            allTestsPassed = false;
        }
        
    } catch (error) {
        console.error(`❌ Critical test failure: ${error.message}`);
        allTestsPassed = false;
    } finally {
        // Cleanup
        if (controller) {
            console.log('🧹 Cleaning up...');
            await controller.shutdown();
        }
    }
    
    // Test Summary
    console.log('📊 Integration Test Results:');
    console.log('================================');
    
    testResults.forEach(result => {
        const status = result.status === 'PASS' ? '✅' : '❌';
        const error = result.error ? ` (${result.error})` : '';
        console.log(`${status} ${result.test}${error}`);
    });
    
    console.log('================================');
    
    const passedTests = testResults.filter(r => r.status === 'PASS').length;
    const totalTests = testResults.length;
    const successRate = Math.round((passedTests / totalTests) * 100);
    
    console.log(`\n📈 Overall Success Rate: ${successRate}% (${passedTests}/${totalTests})`);
    
    if (allTestsPassed && successRate === 100) {
        console.log('🎉 All integration tests passed! Phase 2 is fully operational.');
        process.exit(0);
    } else {
        console.log('⚠️ Some tests failed. Review the results above.');
        process.exit(1);
    }
}

runIntegrationTest();