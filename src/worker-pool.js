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

        this.startTime = Date.now();
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
            this.stats.totalExecutionTime += executionTime || 0;
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
            uptime: Date.now() - this.startTime
        };
    }

    // 헬스 체크
    isHealthy() {
        const stats = this.getStats();
        return stats.activeWorkers > 0 && 
               stats.tasksErrored / (stats.tasksCompleted + stats.tasksErrored || 1) < 0.1;
    }
}