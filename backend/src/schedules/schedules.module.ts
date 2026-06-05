import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Schedule, ScheduleSchema } from './schedule.schema';
import { SchedulesService } from './schedules.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { MemoryModule } from '../memory/memory.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Schedule.name, schema: ScheduleSchema },
    ]),
    NotificationsModule,
    MemoryModule,
  ],
  providers: [SchedulesService],
  exports: [SchedulesService],
})
export class SchedulesModule {}
