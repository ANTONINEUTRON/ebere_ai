import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { FinancialPrivacyGuard } from './guards/financial-privacy.guard';
import { RateLimiterGuard } from './guards/rate-limiter.guard';
import { ServiceSafetyAdviceGuard } from './guards/service-safety-advice.guard';

describe('FinancialPrivacyGuard', () => {
  it('blocks when args.userId differs from callingUserId', async () => {
    await expect(
      FinancialPrivacyGuard.pre!(
        'getFinancialReport',
        { userId: 'other_user' },
        'my_user',
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('allows when no userId in args', async () => {
    const result = await FinancialPrivacyGuard.pre!(
      'getFinancialReport',
      {},
      'my_user',
    );
    expect(result).toBeUndefined();
  });

  it('blocks ledger saveRecord when args.userId differs', async () => {
    await expect(
      FinancialPrivacyGuard.pre!(
        'saveRecord',
        { type: 'ledger', userId: 'other' },
        'mine',
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('ignores non-financial tools', async () => {
    const result = await FinancialPrivacyGuard.pre!(
      'saveRecord',
      { type: 'post' },
      'mine',
    );
    expect(result).toBeUndefined();
  });
});

describe('RateLimiterGuard', () => {
  /** In-memory Redis mock that simulates INCR atomically per key. */
  function makeRedisMock() {
    const store = new Map<string, number>();
    return {
      incr: jest.fn(async (key: string) => {
        const next = (store.get(key) ?? 0) + 1;
        store.set(key, next);
        return next;
      }),
      expire: jest.fn().mockResolvedValue(1),
    };
  }

  function makeConfigMock(postsPerHour: string, skillsPerMin = '30') {
    return {
      get: jest.fn((key: string, defaultVal?: string) => {
        if (key === 'RATE_LIMIT_POSTS_PER_HOUR') return postsPerHour;
        if (key === 'RATE_LIMIT_SKILL_FETCHES_PER_MIN') return skillsPerMin;
        return defaultVal;
      }),
    };
  }

  it('allows up to the limit and blocks on the next call', async () => {
    const redis = makeRedisMock();
    const guard = new RateLimiterGuard(
      redis as never,
      makeConfigMock('10') as never,
    );
    const args = { type: 'post' };

    for (let i = 0; i < 10; i++) {
      const result = await guard.pre('saveRecord', args, 'user1');
      expect(result).toBeUndefined();
    }

    const blocked = await guard.pre('saveRecord', args, 'user1');
    expect(typeof blocked).toBe('string');
    expect(blocked).toMatch(/limit/i);
  });

  it('does not count non-post saveRecord calls', async () => {
    const redis = makeRedisMock();
    const guard = new RateLimiterGuard(
      redis as never,
      makeConfigMock('1') as never,
    );
    // Ledger save should not consume quota — no INCR called
    await guard.pre('saveRecord', { type: 'ledger' }, 'u');
    expect(redis.incr).not.toHaveBeenCalled();
    // Post save should still be allowed (limit is 1, first call)
    const result = await guard.pre('saveRecord', { type: 'post' }, 'u');
    expect(result).toBeUndefined();
  });

  it('tracks limits per user independently', async () => {
    const redis = makeRedisMock();
    const guard = new RateLimiterGuard(
      redis as never,
      makeConfigMock('1') as never,
    );

    await guard.pre('saveRecord', { type: 'post' }, 'user_a');
    const blockedA = await guard.pre('saveRecord', { type: 'post' }, 'user_a');
    expect(blockedA).toBeTruthy();

    // user_b has a different Redis key — unaffected
    const allowedB = await guard.pre('saveRecord', { type: 'post' }, 'user_b');
    expect(allowedB).toBeUndefined();
  });
});

describe('ServiceSafetyAdviceGuard', () => {
  it('appends safety advice for task category on expressInterest', async () => {
    const result: Record<string, unknown> = { category: 'task' };
    await ServiceSafetyAdviceGuard.post!('expressInterest', result, 'u');
    expect(typeof result.safetyAdvice).toBe('string');
    expect(String(result.safetyAdvice).length).toBeGreaterThan(0);
  });

  it('appends safety advice for home_services category', async () => {
    const result: Record<string, unknown> = { category: 'home_services' };
    await ServiceSafetyAdviceGuard.post!('expressInterest', result, 'u');
    expect(result.safetyAdvice).toBeTruthy();
  });

  it('does NOT append safety advice for housing category', async () => {
    const result: Record<string, unknown> = { category: 'housing' };
    await ServiceSafetyAdviceGuard.post!('expressInterest', result, 'u');
    expect(result.safetyAdvice).toBeUndefined();
  });

  it('ignores tools other than expressInterest', async () => {
    const result: Record<string, unknown> = { category: 'task' };
    await ServiceSafetyAdviceGuard.post!('saveRecord', result, 'u');
    expect(result.safetyAdvice).toBeUndefined();
  });
});

describe('BadRequestException guard import check', () => {
  it('BadRequestException is importable', () => {
    expect(BadRequestException).toBeDefined();
  });
});
