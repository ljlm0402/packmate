/**
 * Enhanced Controller Test Script
 */

import { EnhancedPackmateController } from './src/enhanced-controller.js';

async function test() {
    console.log('🧪 Testing Enhanced Controller...\n');
    
    try {
        const controller = new EnhancedPackmateController();
        
        console.log('✅ Controller created successfully');
        
        // System check only
        await controller.performSystemCheck();
        
        console.log('✅ System check completed');
        
        // Worker pool test
        if (controller.workerPool) {
            console.log('✅ Worker Pool is initialized');
            console.log(`   - Pool size: ${controller.workerPool.pool?.size || 0}`);
            console.log(`   - Is healthy: ${controller.workerPool.isHealthy()}`);
        } else {
            console.log('❌ Worker Pool is null');
        }
        
        // Cache test
        if (controller.compressedCache) {
            const isHealthy = await controller.compressedCache.isHealthy();
            console.log(`✅ Compressed Cache: ${isHealthy ? 'healthy' : 'unhealthy'}`);
        }
        
        // Cleanup
        await controller.shutdown();
        console.log('✅ Shutdown completed');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

test();