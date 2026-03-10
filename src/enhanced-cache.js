/**
 * Enhanced Caching System for Packmate v2.2.0
 * 3단계 캐싱: Memory (LRU) → Disk (JSON Files) → Registry (Network)
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

// LRU Cache 구현
class LRUCache {
    constructor(maxSize = 1000) {
        this.maxSize = maxSize;
        this.cache = new Map();
    }

    get(key) {
        if (this.cache.has(key)) {
            // 접근된 항목을 맨 뒤로 이동 (LRU)
            const value = this.cache.get(key);
            this.cache.delete(key);
            this.cache.set(key, value);
            return value;
        }
        return null;
    }

    set(key, value) {
        // 이미 존재하면 갱신
        if (this.cache.has(key)) {
            this.cache.delete(key);
        } 
        // 크기 초과시 가장 오래된 항목 제거
        else if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        
        this.cache.set(key, value);
    }

    has(key) {
        return this.cache.has(key);
    }

    clear() {
        this.cache.clear();
    }

    size() {
        return this.cache.size;
    }

    // 캐시 통계
    getStats() {
        return {
            size: this.cache.size,
            maxSize: this.maxSize,
            usage: `${Math.round(this.cache.size / this.maxSize * 100)}%`
        };
    }
}

// JSON 파일 기반 디스크 캐시
class DiskCache {
    constructor(cacheDir = null) {
        this.cacheDir = cacheDir || path.join(os.tmpdir(), 'packmate-cache');
        this.indexPath = path.join(this.cacheDir, 'cache-index.json');
        this.isInitialized = false;
        this.index = {};
    }

    async init() {
        if (this.isInitialized) return;

        try {
            // 캐시 디렉터리 생성
            if (!fs.existsSync(this.cacheDir)) {
                fs.mkdirSync(this.cacheDir, { recursive: true });
            }

            // 인덱스 파일 로드
            if (fs.existsSync(this.indexPath)) {
                const indexData = fs.readFileSync(this.indexPath, 'utf-8');
                this.index = JSON.parse(indexData);
            } else {
                this.index = {};
                this.saveIndex();
            }

            this.isInitialized = true;
            console.log(`📁 Cache initialized: ${this.cacheDir}`);
        } catch (error) {
            console.warn(`⚠️  Disk cache init failed: ${error.message}`);
            this.index = {};
        }
    }

    saveIndex() {
        try {
            fs.writeFileSync(this.indexPath, JSON.stringify(this.index, null, 2));
        } catch (error) {
            console.warn(`Index save failed: ${error.message}`);
        }
    }

    getCacheFilePath(packageName) {
        // 패키지명을 파일시스템 안전한 이름으로 변환
        const safeName = packageName.replace(/[@\/]/g, '_');
        return path.join(this.cacheDir, `${safeName}.json`);
    }

    async get(packageName, ttl = 3600000) { // 1시간 기본 TTL
        if (!this.isInitialized) await this.init();

        try {
            const cacheFile = this.getCacheFilePath(packageName);
            const indexEntry = this.index[packageName];

            if (!indexEntry || !fs.existsSync(cacheFile)) {
                return null;
            }

            const now = Date.now();
            if ((now - indexEntry.createdAt) > ttl) {
                // 만료된 캐시 삭제
                this.delete(packageName);
                return null;
            }

            // 접근 시간 업데이트
            indexEntry.accessedAt = now;
            this.saveIndex();

            const cacheData = fs.readFileSync(cacheFile, 'utf-8');
            return JSON.parse(cacheData);

        } catch (error) {
            console.warn(`Disk cache get error for ${packageName}:`, error.message);
            return null;
        }
    }

    async set(packageName, versionData) {
        if (!this.isInitialized) await this.init();

        try {
            const cacheFile = this.getCacheFilePath(packageName);
            const now = Date.now();

            // 데이터 파일 저장
            fs.writeFileSync(cacheFile, JSON.stringify(versionData, null, 2));

            // 인덱스 업데이트
            this.index[packageName] = {
                createdAt: now,
                accessedAt: now,
                filePath: cacheFile
            };
            this.saveIndex();

        } catch (error) {
            console.warn(`Disk cache set error for ${packageName}:`, error.message);
        }
    }

    delete(packageName) {
        try {
            const cacheFile = this.getCacheFilePath(packageName);
            
            // 파일 삭제
            if (fs.existsSync(cacheFile)) {
                fs.unlinkSync(cacheFile);
            }

            // 인덱스에서 삭제
            delete this.index[packageName];
            this.saveIndex();

        } catch (error) {
            console.warn(`Disk cache delete error for ${packageName}:`, error.message);
        }
    }

    async cleanup(maxAge = 7 * 24 * 60 * 60 * 1000) { // 7일
        if (!this.isInitialized) await this.init();

        try {
            const cutoff = Date.now() - maxAge;
            let deletedCount = 0;

            for (const [packageName, entry] of Object.entries(this.index)) {
                if (entry.accessedAt < cutoff) {
                    this.delete(packageName);
                    deletedCount++;
                }
            }

            if (deletedCount > 0) {
                console.log(`🧹 Cleaned ${deletedCount} old cache entries`);
            }
        } catch (error) {
            console.warn(`Disk cache cleanup error:`, error.message);
        }
    }

    async getStats() {
        if (!this.isInitialized) await this.init();

        try {
            const entries = Object.keys(this.index).length;
            let totalSize = 0;

            // 캐시 디렉터리 크기 계산
            if (fs.existsSync(this.cacheDir)) {
                const files = fs.readdirSync(this.cacheDir);
                for (const file of files) {
                    const filePath = path.join(this.cacheDir, file);
                    if (fs.existsSync(filePath)) {
                        totalSize += fs.statSync(filePath).size;
                    }
                }
            }

            return {
                entries,
                diskSize: `${Math.round(totalSize / 1024)} KB`,
                cacheDir: this.cacheDir
            };
        } catch (error) {
            return { entries: 0, diskSize: '0 KB', error: error.message };
        }
    }

    async close() {
        // JSON 파일 기반이므로 특별히 닫을 것 없음
        this.saveIndex();
    }
}

// Smart Cache Manager (통합 관리)
export class SmartCacheManager {
    constructor(options = {}) {
        this.memoryCache = new LRUCache(options.memoryCacheSize || 1000);
        this.diskCache = new DiskCache(options.cacheDir);
        this.networkHits = 0;
        this.diskHits = 0;
        this.memoryHits = 0;
        this.totalRequests = 0;
        
        // 통계
        this.stats = {
            networkHits: 0,
            diskHits: 0,
            memoryHits: 0,
            totalRequests: 0
        };
    }

    async init() {
        await this.diskCache.init();
    }

    async get(packageName, ttl = 3600000) {
        this.stats.totalRequests++;

        // 1단계: Memory 캐시 확인
        const memoryResult = this.memoryCache.get(packageName);
        if (memoryResult) {
            this.stats.memoryHits++;
            return { data: memoryResult, source: 'memory' };
        }

        // 2단계: Disk 캐시 확인
        const diskResult = await this.diskCache.get(packageName, ttl);
        if (diskResult) {
            this.stats.diskHits++;
            // Memory 캐시에 저장
            this.memoryCache.set(packageName, diskResult);
            return { data: diskResult, source: 'disk' };
        }

        // 3단계: Network에서 가져와야 함
        this.stats.networkHits++;
        return { data: null, source: 'network' };
    }

    async set(packageName, versionData) {
        // Memory와 Disk 양쪽에 저장
        this.memoryCache.set(packageName, versionData);
        await this.diskCache.set(packageName, versionData);
    }

    async cleanup() {
        await this.diskCache.cleanup();
    }

    getHitRate() {
        if (this.stats.totalRequests === 0) return 0;
        
        const cacheHits = this.stats.memoryHits + this.stats.diskHits;
        return Math.round(cacheHits / this.stats.totalRequests * 100);
    }

    async getDetailedStats() {
        const memoryStats = this.memoryCache.getStats();
        const diskStats = await this.diskCache.getStats();
        
        return {
            memory: memoryStats,
            disk: diskStats,
            performance: {
                totalRequests: this.stats.totalRequests,
                memoryHits: this.stats.memoryHits,
                diskHits: this.stats.diskHits,
                networkHits: this.stats.networkHits,
                hitRate: `${this.getHitRate()}%`,
                breakdown: {
                    memory: `${Math.round(this.stats.memoryHits / (this.stats.totalRequests || 1) * 100)}%`,
                    disk: `${Math.round(this.stats.diskHits / (this.stats.totalRequests || 1) * 100)}%`,
                    network: `${Math.round(this.stats.networkHits / (this.stats.totalRequests || 1) * 100)}%`
                }
            }
        };
    }

    async close() {
        await this.diskCache.close();
    }
}

// 기본 인스턴스 (싱글톤 패턴)
let globalCacheManager = null;

export function getCacheManager() {
    if (!globalCacheManager) {
        globalCacheManager = new SmartCacheManager();
    }
    return globalCacheManager;
}

export async function initializeCache() {
    const cache = getCacheManager();
    await cache.init();
    return cache;
}