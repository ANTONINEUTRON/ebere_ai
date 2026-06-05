import { Module } from '@nestjs/common';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppController } from './whatsapp.controller';
import { IdentityModule } from '../../identity/identity.module';
import { AgentModule } from '../../agent/agent.module';
import { MediaModule } from '../../media/media.module';

@Module({
  imports: [IdentityModule, AgentModule, MediaModule],
  providers: [WhatsAppService],
  controllers: [WhatsAppController],
  exports: [WhatsAppService],
})
export class WhatsAppModule {}
