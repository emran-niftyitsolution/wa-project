import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

const DEFAULT_TTL_SECONDS = 300; // 5 minutes
const KEY_PREFIX = 'wa:';

@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private readonly redis: Redis | null = null;
  private readonly enabled: boolean;

  constructor(private readonly configService: ConfigService) {
    const url = this.configService.get<string>('REDIS_URL');
    this.enabled = Boolean(url);
    if (this.enabled && url) {
      this.redis = new Redis(url, {
        maxRetriesPerRequest: 3,
        retryStrategy: (times) =>
          times > 3 ? null : Math.min(times * 100, 3000),
        lazyConnect: true,
      });
      this.redis.on('error', (err) => this.logger.warn('Redis error', err));
      this.redis.on('connect', () => this.logger.log('Redis connected'));
    }
  }

  async onModuleDestroy() {
    if (this.redis) {
      await this.redis.quit();
    }
  }

  private key(name: string): string {
    return `${KEY_PREFIX}${name}`;
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.redis) return null;
    try {
      const raw = await this.redis.get(this.key(key));
      if (raw == null) return null;
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async set(
    key: string,
    value: unknown,
    ttlSeconds: number = DEFAULT_TTL_SECONDS,
  ): Promise<void> {
    if (!this.redis) return;
    try {
      const k = this.key(key);
      await this.redis.setex(k, ttlSeconds, JSON.stringify(value));
    } catch (err) {
      this.logger.warn('Cache set failed', err);
    }
  }

  async del(key: string): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.del(this.key(key));
    } catch (err) {
      this.logger.warn('Cache del failed', err);
    }
  }

  /** Delete all keys matching pattern (e.g. "category:*"). Use sparingly. */
  async delByPattern(pattern: string): Promise<void> {
    if (!this.redis) return;
    try {
      const fullPattern = this.key(pattern);
      const keys = await this.redis.keys(fullPattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } catch (err) {
      this.logger.warn('Cache delByPattern failed', err);
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }
}
