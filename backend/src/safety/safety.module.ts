import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module';
import { SafetyGuardService } from './safety-guard.service';
import { RateLimiterGuard } from './guards/rate-limiter.guard';
import { FinancialPrivacyGuard } from './guards/financial-privacy.guard';
import { ServiceSafetyAdviceGuard } from './guards/service-safety-advice.guard';
import { AbuseContentFilterGuard } from './guards/abuse-content-filter.guard';

@Module({
  providers: [
    {
      provide: SafetyGuardService,
      inject: [REDIS_CLIENT, ConfigService],
      useFactory: (redis: Redis, config: ConfigService) => {
        const service = new SafetyGuardService();
        service.register(new RateLimiterGuard(redis, config));
        service.register(FinancialPrivacyGuard);
        service.register(ServiceSafetyAdviceGuard);
        service.register(AbuseContentFilterGuard);
        return service;
      },
    },
  ],
  exports: [SafetyGuardService],
})
export class SafetyModule {}
