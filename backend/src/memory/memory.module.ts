import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';
import { Memory, MemorySchema } from './memory.schema';
import { MemoryService } from './memory.service';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Memory.name, schema: MemorySchema }]),
    BullModule.registerQueue({ name: 'notifications' }),
    UsersModule,
  ],
  providers: [MemoryService],
  exports: [MemoryService],
})
export class MemoryModule {}
