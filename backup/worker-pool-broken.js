/**
 * Worker Pool 시스템
 * CPU 집약적인 작업을 병렬화하여 성능 향상
 */

import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { cpus } from 'os';
import EventEmitter from 'events';

export class WorkerPool extends EventEmitter {
    constructor(workerScript, options = {}) {
        super();
        this.workerScript = workerScript;
        this.maxWorkers = options.maxWorkers || Math.max(2, cpus().length - 1);
        this.workers = [];
        this.availableWorkers = [];
        this.taskQueue = [];
        this.activeJobs = new Map();
        this.jobIdCounter = 0;
        
        this.stats = {
            tasksCompleted: 0,
            tasksErrored: 0,
            totalExecutionTime: 0,
            avgExecutionTime: 0
        };

        this.startTime = Date.now(); // 초기화 시간 추적
        this.initialize();
    }

    initialize() {
        // 워커들 생성
        for (let i = 0; i < this.maxWorkers; i++) {
            this.createWorker(i);
        }
        
        console.log(`✨ Worker pool initialized with ${this.maxWorkers} workers`);
    }

    createWorker(id) {
        const worker = new Worker(this.workerScript, {
            workerData: { workerId: id }
        });
        
        worker.workerId = id;
        worker.isAvailable = true;
        worker.currentJobId = null;
        
        worker.on('message', (result) => {
            this.handleWorkerMessage(worker, result);
        });
        
        worker.on('error', (error) => {
            this.handleWorkerError(worker, error);
        });
        
        worker.on('exit', (code) => {
            if (code !== 0) {
                console.warn(`Worker ${id} exited with code ${code}`);
                this.restartWorker(worker);
            }
        });
        
        this.workers.push(worker);
        this.availableWorkers.push(worker);
        
        return worker;
    }

    handleWorkerMessage(worker, result) {
        const { jobId, data, error, executionTime } = result;
        const job = this.activeJobs.get(jobId);
        
        if (!job) {
            console.warn(`Received result for unknown job ${jobId}`);
            return;
        }
        
        // 통계 업데이트
        if (error) {
            this.stats.tasksErrored++;
            job.reject(new Error(error.message));
        } else {
            this.stats.tasksCompleted++;
            this.stats.totalExecutionTime += executionTime;
            this.stats.avgExecutionTime = this.stats.totalExecutionTime / this.stats.tasksCompleted;
            job.resolve(data);
        }
        
        // 작업 정리
        this.activeJobs.delete(jobId);
        this.releaseWorker(worker);
        this.processNextTask();
    }

    handleWorkerError(worker, error) {
        console.error(`Worker ${worker.workerId} error:`, error);
        
        // 현재 작업 실패 처리
        if (worker.currentJobId) {
            const job = this.activeJobs.get(worker.currentJobId);
            if (job) {
                job.reject(new Error(`Worker error: ${error.message}`));
                this.activeJobs.delete(worker.currentJobId);
            }
        }
        
        this.restartWorker(worker);
    }

    restartWorker(oldWorker) {
        // 기존 워커 제거
        const workerIndex = this.workers.findIndex(w => w === oldWorker);
        if (workerIndex > -1) {
            this.workers.splice(workerIndex, 1);
            const availableIndex = this.availableWorkers.findIndex(w => w === oldWorker);
            if (availableIndex > -1) {
                this.availableWorkers.splice(availableIndex, 1);
            }
        }
        
        // 새 워커 생성
        this.createWorker(oldWorker.workerId);
        
        // 대기 중인 작업 처리
        this.processNextTask();
    }

    // 작업 실행
    async execute(taskType, taskData, options = {}) {
        const { timeout = 30000, priority = 'normal' } = options;
        
        return new Promise((resolve, reject) => {
            const jobId = ++this.jobIdCounter;
            const job = {
                jobId,
                taskType,
                taskData,
                timeout,
                priority,
                resolve,
                reject,
                createdAt: Date.now()
            };
            
            // 우선순위에 따라 큐에 삽입
            if (priority === 'high') {
                this.taskQueue.unshift(job);
            } else {
                this.taskQueue.push(job);
            }
            
            // 타임아웃 설정
            const timeoutId = setTimeout(() => {
                this.handleJobTimeout(jobId);
            }, timeout);
            
            job.timeoutId = timeoutId;
            this.processNextTask();
        });
    }

    handleJobTimeout(jobId) {
        const job = this.activeJobs.get(jobId);
        if (job) {
            console.warn(`⏰ Job ${jobId} timed out`);
            clearTimeout(job.timeoutId);
            job.reject(new Error('Task timeout'));
            this.activeJobs.delete(jobId);
            
            // 워커 재시작 (응답 불가 상태일 수 있음)
            const worker = this.workers.find(w => w.currentJobId === jobId);
            if (worker) {
                this.restartWorker(worker);
            }
        }
    }

    // 리소스 정리
    async destroy() {
        console.log('🔄 Shutting down worker pool...');
        
        // 모든 활성 작업 취소
        this.activeJobs.forEach(job => {
            clearTimeout(job.timeoutId);
            job.reject(new Error('Worker pool shutting down'));
        });
        this.activeJobs.clear();
        
        // 모든 워커 종료
        await Promise.all(this.workers.map(worker => {
            return new Promise(resolve => {
                worker.once('exit', () => resolve());
                worker.postMessage({ type: 'shutdown' });
                
                // 강제 종료 타이머
                setTimeout(() => {
                    worker.terminate();
                    resolve();
                }, 5000);
            });
        }));
        
        this.workers = [];
        this.availableWorkers = [];
        this.taskQueue = [];
        
        console.log('✅ Worker pool destroyed');
    }

    // 다음 작업 처리
    processNextTask() {
        if (this.taskQueue.length === 0 || this.availableWorkers.length === 0) {
            return;
        }
        
        const job = this.taskQueue.shift();
        const worker = this.availableWorkers.shift();
        
        worker.isAvailable = false;
        worker.currentJobId = job.jobId;
        
        this.activeJobs.set(job.jobId, job);
        
        worker.postMessage({
            type: 'execute',
            jobId: job.jobId,
            taskType: job.taskType,
            taskData: job.taskData
        });
    }

    // 워커 해제
    releaseWorker(worker) {
        worker.isAvailable = true;
        worker.currentJobId = null;
        
        if (!this.availableWorkers.includes(worker)) {
            this.availableWorkers.push(worker);
        }
    }

    // 통계 및 상태 모니터링
    getStats() {
        return {
            ...this.stats,
            activeWorkers: this.workers.length,
            availableWorkers: this.availableWorkers.length,
            queuedTasks: this.taskQueue.length,
            activeTasks: this.activeJobs.size,
            uptime: Date.now() - (this.startTime || Date.now())
        };
    }

    // 헬스 체크
    isHealthy() {
        const stats = this.getStats();
        return stats.activeWorkers > 0 && 
               stats.tasksErrored / (stats.tasksCompleted + stats.tasksErrored || 1) < 0.1;
    }

    // 작업 대기열 우선순위 재정렬
    reprioritizeTasks() {
        this.taskQueue.sort((a, b) => {
            const priorityOrder = { critical: 3, high: 2, normal: 1, low: 0 };
            return (priorityOrder[b.priority] || 1) - (priorityOrder[a.priority] || 1);
        });
    }

    // 워커 풀 확장/축소
    async resize(newSize) {
        if (newSize < 1) {
            throw new Error('Worker pool size must be at least 1');
        }
        
        if (newSize > this.workers.length) {
            // 워커 추가
            const toAdd = newSize - this.workers.length;
            for (let i = 0; i < toAdd; i++) {
                const id = this.workers.length;
                this.createWorker(id);
            }
        } else if (newSize < this.workers.length) {
            // 워커 제거 (사용 가능한 워커부터)
            const toRemove = this.workers.length - newSize;
            for (let i = 0; i < toRemove && this.availableWorkers.length > 0; i++) {
                const worker = this.availableWorkers.pop();
                const index = this.workers.indexOf(worker);
                if (index > -1) {
                    this.workers.splice(index, 1);
                    await worker.terminate();
                }
            }
        }
        
        this.maxWorkers = newSize;
    }
}
            });
        }));
        
        this.workers = [];
        this.availableWorkers = [];
        this.taskQueue = [];
        
        console.log('✅ Worker pool destroyed');
    }

    // 통계 및 상태 모니터링
    getStats() {
        return {
            ...this.stats,
            activeWorkers: this.workers.length,
            availableWorkers: this.availableWorkers.length,
            queuedTasks: this.taskQueue.length,
            activeTasks: this.activeJobs.size,
            uptime: Date.now() - this.startTime
        };
    }

    // 헬스 체크
    isHealthy() {
        const stats = this.getStats();
        return stats.activeWorkers > 0 && 
               stats.tasksErrored / (stats.tasksCompleted + stats.tasksErrored) < 0.1;
    }
            }
            
            this.processNextTask();
        });
    }

    processNextTask() {
        if (this.taskQueue.length === 0 || this.availableWorkers.length === 0) {
            return;
        }
        
        const job = this.taskQueue.shift();
        const worker = this.availableWorkers.shift();
        
        worker.isAvailable = false;
        worker.currentJobId = job.jobId;
        this.activeJobs.set(job.jobId, job);
        
        // 타임아웃 설정
        const timeoutId = setTimeout(() => {
            if (this.activeJobs.has(job.jobId)) {
                job.reject(new Error(`Task timeout after ${job.timeout}ms`));
                this.activeJobs.delete(job.jobId);
                this.terminateWorker(worker);
            }
        }, job.timeout);
        
        job.timeoutId = timeoutId;
        
        // 워커에게 작업 전송
        worker.postMessage({
            jobId: job.jobId,
            taskType: job.taskType,
            taskData: job.taskData
        });
    }

    releaseWorker(worker) {
        const job = this.activeJobs.get(worker.currentJobId);
        if (job && job.timeoutId) {
            clearTimeout(job.timeoutId);
        }
        
        worker.isAvailable = true;
        worker.currentJobId = null;
        this.availableWorkers.push(worker);
    }

    terminateWorker(worker) {
        worker.terminate();
        this.restartWorker(worker);
    }

    // 배치 작업 처리
    async executeBatch(tasks, options = {}) {
        const { batchSize = this.maxWorkers, progressCallback } = options;
        const results = [];
        
        for (let i = 0; i < tasks.length; i += batchSize) {
            const batch = tasks.slice(i, i + batchSize);
            const batchPromises = batch.map(task => 
                this.execute(task.type, task.data, task.options)
            );
            
            const batchResults = await Promise.allSettled(batchPromises);
            results.push(...batchResults);
            
            if (progressCallback) {
                progressCallback({
                    completed: Math.min(i + batchSize, tasks.length),
                    total: tasks.length,
                    batchResults
                });
            }
        }
        
        return results;
    }

    // 풀 상태 확인
    getStatus() {
        return {
            totalWorkers: this.workers.length,
            availableWorkers: this.availableWorkers.length,
            busyWorkers: this.workers.length - this.availableWorkers.length,
            queuedTasks: this.taskQueue.length,
            activeTasks: this.activeJobs.size,
            stats: { ...this.stats }
        };
    }

    // 특정 타입의 작업들 취소
    cancelTasks(taskType) {
        let cancelledCount = 0;
        
        // 큐에서 제거
        this.taskQueue = this.taskQueue.filter(job => {
            if (job.taskType === taskType) {
                job.reject(new Error('Task cancelled'));
                cancelledCount++;
                return false;
            }
            return true;
        });
        
        return cancelledCount;
    }

    // 우아한 종료
    async shutdown(timeout = 10000) {
        console.log('🔄 Shutting down worker pool...');
        
        // 새 작업 중단
        const remainingTasks = this.taskQueue.length;
        this.taskQueue.forEach(job => {
            job.reject(new Error('Worker pool shutting down'));
        });
        this.taskQueue = [];
        
        // 활성 작업 완료 대기
        const activeJobsArray = Array.from(this.activeJobs.values());
        if (activeJobsArray.length > 0) {
            console.log(`⏳ Waiting for ${activeJobsArray.length} active tasks to complete...`);
            
            try {
                await Promise.race([
                    Promise.allSettled(activeJobsArray.map(job => 
                        new Promise(resolve => {
                            const originalResolve = job.resolve;
                            const originalReject = job.reject;
                            job.resolve = (data) => { originalResolve(data); resolve(); };
                            job.reject = (error) => { originalReject(error); resolve(); };
                        })
                    )),
                    new Promise(resolve => setTimeout(resolve, timeout))
                ]);
            } catch (error) {
                console.warn('Some tasks may not have completed before shutdown');
            }
        }
        
        // 워커들 종료
        await Promise.allSettled(
            this.workers.map(worker => worker.terminate())
        );
        
        console.log(`✅ Worker pool shut down. Cancelled ${remainingTasks} pending tasks.`);
    }
}

// 워커 스크립트를 위한 기본 핸들러
export class WorkerHandler {
    constructor() {
        this.handlers = new Map();
        this.setupMessageHandler();
    }

    // 작업 타입별 핸들러 등록
    registerHandler(taskType, handlerFunction) {
        this.handlers.set(taskType, handlerFunction);
    }

    setupMessageHandler() {
        if (!isMainThread && parentPort) {
            parentPort.on('message', async (message) => {
                const { jobId, taskType, taskData } = message;
                const startTime = Date.now();
                
                try {
                    const handler = this.handlers.get(taskType);
                    if (!handler) {
                        throw new Error(`No handler registered for task type: ${taskType}`);
                    }
                    
                    const result = await handler(taskData);
                    const executionTime = Date.now() - startTime;
                    
                    parentPort.postMessage({
                        jobId,
                        data: result,
                        executionTime
                    });
                } catch (error) {
                    const executionTime = Date.now() - startTime;
                    parentPort.postMessage({
                        jobId,
                        error: {
                            message: error.message,
                            stack: error.stack
                        },
                        executionTime
                    });
                }
            });
        }
    }
}