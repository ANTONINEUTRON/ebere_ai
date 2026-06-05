import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bullmq';
import { RedisModule } from './redis/redis.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { NotificationsModule } from './notifications/notifications.module';
import { UsersModule } from './users/users.module';
import { IdentityModule } from './identity/identity.module';
import { TelegramModule } from './channels/telegram/telegram.module';
import { WhatsAppModule } from './channels/whatsapp/whatsapp.module';
import { MediaModule } from './media/media.module';
import { AgentModule } from './agent/agent.module';
import { SchedulesModule } from './schedules/schedules.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.getOrThrow<string>('MONGODB_URI'),
      }),
    }),
    ScheduleModule.forRoot(),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: parseInt(config.get<string>('REDIS_PORT', '6379'), 10),
          password: config.get<string>('REDIS_PASSWORD') || undefined,
          tls: config.get<string>('REDIS_TLS') === 'true' ? {} : undefined,
        },
        defaultJobOptions: {
          removeOnComplete: { count: 1000 },
          removeOnFail: { count: 5000 },
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
        },
      }),
    }),
    RedisModule,
    NotificationsModule,
    UsersModule,
    IdentityModule,
    TelegramModule,
    WhatsAppModule,
    MediaModule,
    AgentModule,
    SchedulesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
