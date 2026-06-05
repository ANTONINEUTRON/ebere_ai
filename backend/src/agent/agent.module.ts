import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AiSession, AiSessionSchema } from './sessions/session.schema';
import { MongoSessionService } from './sessions/mongo-session.service';
import { RunnerService } from './runner.service';
import { MemoryModule } from '../memory/memory.module';
import { SafetyModule } from '../safety/safety.module';
import { SchedulesModule } from '../schedules/schedules.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';
import { IdentityModule } from '../identity/identity.module';
import { SkillsModule } from '../skills/skills.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AiSession.name, schema: AiSessionSchema },
    ]),
    ConfigModule,
    MemoryModule,
    SafetyModule,
    SchedulesModule,
    NotificationsModule,
    UsersModule,
    IdentityModule,
    SkillsModule,
  ],
  providers: [MongoSessionService, RunnerService],
  exports: [RunnerService],
})
export class AgentModule {}
