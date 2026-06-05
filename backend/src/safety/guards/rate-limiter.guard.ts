import type Redis from 'ioredis';
import type { ConfigService } from '@nestjs/config';
import type { Guard } from '../guard.interface';

export class RateLimiterGuard implements Guard {
  readonly name = 'RateLimiterGuard';
  private readonly postLimit: number;
  private readonly skillLimit: number;

  constructor(
    private readonly redis: Redis,
    config: ConfigService,
  ) {
    this.postLimit = parseInt(
      config.get<string>('RATE_LIMIT_POSTS_PER_HOUR', '10'),
      10,
    );
    this.skillLimit = parseInt(
      config.get<string>('RATE_LIMIT_SKILL_FETCHES_PER_MIN', '30'),
      10,
    );
  }

  async pre(
    toolName: string,
    args: unknown,
    userId: string,
  ): Promise<string | void> {
    if (
      toolName === 'saveRecord' &&
      (args as Record<string, unknown>).type === 'post'
    ) {
      return this.checkLimit(
        `rate:post:${userId}:${Math.floor(Date.now() / 3_600_000)}`,
        3600,
        this.postLimit,
        `post limit (${this.postLimit} posts per hour)`,
      );
    }
    if (toolName === 'fetchSkill') {
      return this.checkLimit(
        `rate:skill:${userId}:${Math.floor(Date.now() / 60_000)}`,
        60,
        this.skillLimit,
        `skill fetch limit (${this.skillLimit} per minute)`,
      );
    }
  }

  private async checkLimit(
    key: string,
    ttlSeconds: number,
    limit: number,
    label: string,
  ): Promise<string | void> {
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, ttlSeconds);
    }
    if (count > limit) {
      return `You've reached the ${label}. Try again later.`;
    }
  }
}
