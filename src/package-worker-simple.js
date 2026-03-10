/**
 * Simple Package Worker for Testing
 * Minimal functionality for Worker Pool testing
 */

import { parentPort } from 'worker_threads';

// 간단한 Worker Handler
class SimpleWorkerHandler {
    constructor() {
        this.handlers = new Map();
        this.setupHandlers();
    }
    
    setupHandlers() {
        // 간단한 테스트 핸들러들
        this.registerHandler('test', async (data) => {
            return { message: 'Worker test successful', data };
        });
        
        this.registerHandler('package-info', async (data) => {
            // 간단한 mock 응답
            return {
                name: data.packageName || 'test-package',
                version: '1.0.0',
                description: 'Test package',
                dependencies: {},
                mock: true
            };
        });
        
        this.registerHandler('dependency-analysis', async (data) => {
            // 간단한 mock 분석
            return {
                directDependencies: 0,
                dependencyTree: {},
                vulnerabilities: [],
                outdatedPackages: [],
                duplicates: [],
                circularDependencies: []
            };
        });
        
        // Worker 종료 핸들러
        this.registerHandler('shutdown', async (data) => {
            process.exit(0);
        });
    }
    
    registerHandler(type, handler) {
        this.handlers.set(type, handler);
    }
    
    async handleMessage(message) {
        const { taskType, taskData, jobId } = message;
        const handler = this.handlers.get(taskType);
        
        if (!handler) {
            throw new Error(`No handler found for type: ${taskType}`);
        }
        
        try {
            const startTime = Date.now();
            const result = await handler(taskData);
            const executionTime = Date.now() - startTime;
            
            parentPort.postMessage({ 
                jobId: jobId, 
                data: result,
                executionTime
            });
        } catch (error) {
            parentPort.postMessage({ 
                jobId: jobId, 
                error: { message: error.message }
            });
        }
    }
}

const handler = new SimpleWorkerHandler();

// 메시지 리스너 설정
parentPort.on('message', (message) => {
    handler.handleMessage(message).catch(error => {
        parentPort.postMessage({ 
            jobId: message.jobId, 
            error: { message: error.message }
        });
    });
});

// Worker 초기화 완료 신호 (optional)
// parentPort.postMessage({ type: 'ready', workerId: process.env.workerId });

// Silent initialization - no console output