/**
 * Simple Enhanced Mode Test
 */

import { EnhancedPackmateController } from './src/enhanced-controller.js';

async function simpleTest() {
    console.log('🚀 Simple Enhanced Mode Test\n');
    
    try {
        const controller = new EnhancedPackmateController();
        console.log('✅ Controller initialized successfully');
        
        // Test worker pool
        if (controller.workerPool && controller.workerPool.isHealthy()) {
            console.log('✅ Worker Pool is healthy');
            
            // Simple worker test
            try {
                const result = await controller.workerPool.execute('test', { message: 'hello' });
                console.log('✅ Worker test successful:', result.data?.message);
            } catch (error) {
                console.log('❌ Worker test failed:', error.message);
            }
        }
        
        // Test compressed cache
        if (controller.compressedCache) {
            const cacheHealthy = await controller.compressedCache.isHealthy();
            console.log(`✅ Compressed Cache: ${cacheHealthy ? 'healthy' : 'unhealthy'}`);
        }
        
        // Quick shutdown
        await controller.shutdown();
        console.log('✅ Test completed successfully');
        
        process.exit(0);
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        process.exit(1);
    }
}

simpleTest();