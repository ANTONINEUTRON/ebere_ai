import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { TelegramController } from './telegram.controller';
import { IdentityModule } from '../../identity/identity.module';
import { AgentModule } from '../../agent/agent.module';
import { MediaModule } from '../../media/media.module';

@Module({
  imports: [IdentityModule, AgentModule, MediaModule],
  providers: [TelegramService],
  controllers: [TelegramController],
  exports: [TelegramService],
})
export class TelegramModule {}
