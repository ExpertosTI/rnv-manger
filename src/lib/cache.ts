// Simple in-memory cache with TTL
interface CacheEntry<T> {
    data: T;
    timestamp: number;
    expiresAt: number;
}

class MemoryCache {
    private cache: Map<string, CacheEntry<any>> = new Map();
    private defaultTTL: number = 5 * 60 * 1000; // 5 minutes

    set<T>(key: string, data: T, ttlMs?: number): void {
        const now = Date.now();
        this.cache.set(key, {
            data,
            timestamp: now,
            expiresAt: now + (ttlMs || this.defaultTTL),
        });
    }

    get<T>(key: string): T | null {
        const entry = this.cache.get(key);
        if (!entry) return null;

        if (Date.now() > entry.expiresAt) {
            this.cache.delete(key);
            return null;
        }

        return entry.data as T;
    }

    invalidate(key: string): void {
        this.cache.delete(key);
    }

    invalidateAll(): void {
        this.cache.clear();
    }

    getAge(key: string): number | null {
        const entry = this.cache.get(key);
        if (!entry) return null;
        return Date.now() - entry.timestamp;
    }

    has(key: string): boolean {
        const data = this.get(key);
        return data !== null;
    }
}

// Global cache instance
export const apiCache = new MemoryCache();

// Cache keys
export const CACHE_KEYS = {
    HOSTINGER_VPS: "hostinger_vps_list",
    CLIENTS: "clients_list",
    SERVICES: "services_list",
} as const;
