import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Runner, isFinalResponse } from '@google/adk';
import { MongoSessionService } from './sessions/mongo-session.service';
import { createEbereAgent } from './ebere.agent';
import { MemoryService } from '../memory/memory.service';
import { SafetyGuardService } from '../safety/safety-guard.service';
import { SchedulesService } from '../schedules/schedules.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';
import { IdentityService } from '../identity/identity.service';
import { SkillsService } from '../skills/skills.service';
import { createMemoryTools } from './tools/memory.tools';
import { createScheduleTools } from './tools/schedules.tools';
import { createNotificationsTools } from './tools/notifications.tools';
import { createProfileTools } from './tools/profile.tools';
import { createIdentityTools } from './tools/identity.tools';
import { createSkillTools } from './tools/skills.tools';
import { createAgentConfigTools } from './tools/agent-config.tools';

export interface RunPayload {
  text?: string;
  mediaBuffer?: Buffer;
  mimeType?: string;
  mediaFileId?: string;
}

@Injectable()
export class RunnerService {
  private readonly logger = new Logger(RunnerService.name);

  constructor(
    private readonly sessionService: MongoSessionService,
    private readonly config: ConfigService,
    private readonly memoryService: MemoryService,
    private readonly guardService: SafetyGuardService,
    private readonly schedulesService: SchedulesService,
    private readonly notificationsService: NotificationsService,
    private readonly usersService: UsersService,
    private readonly identityService: IdentityService,
    private readonly skillsService: SkillsService,
  ) {}

  async run(
    userId: string,
    channel: string,
    payload: RunPayload,
  ): Promise<string> {
    const sessionId = `${userId}:${channel}`;

    // Fetch per-user personalisation in parallel
    const [skillIndex, agentConfig] = await Promise.all([
      this.skillsService.getSkillIndex(userId),
      this.usersService.getAgentConfig(userId),
    ]);

    // Build per-call tool list (userId bound in each closure — never in Zod schemas)
    const tools = [
      ...createMemoryTools(this.memoryService, this.guardService),
      ...createScheduleTools(this.schedulesService),
      ...createNotificationsTools(this.notificationsService),
      ...createProfileTools(this.usersService),
      ...createIdentityTools(this.identityService, this.usersService),
      ...createSkillTools(this.skillsService, userId),
      ...createAgentConfigTools(this.usersService, userId),
    ];

    // Build per-call agent with personalised system prompt
    const agent = createEbereAgent(this.config, tools, {
      skillIndex,
      agentName: agentConfig.agentName,
      agentTone: agentConfig.agentTone,
    });

    const runner = new Runner({
      agent,
      sessionService: this.sessionService,
      appName: 'ebere',
    });

    const existing = await this.sessionService.getSession({
      appName: 'ebere',
      userId,
      sessionId,
    });
    if (!existing) {
      await this.sessionService.createSession({
        appName: 'ebere',
        userId,
        sessionId,
      });
    }

    const parts: Record<string, unknown>[] = [];

    if (payload.text) {
      parts.push({ text: payload.text });
    }
    if (payload.mediaBuffer && payload.mimeType) {
      parts.push({
        inlineData: {
          data: payload.mediaBuffer.toString('base64'),
          mimeType: payload.mimeType,
        },
      });
    }
    if (!parts.length) {
      parts.push({ text: '[media received — no text]' });
    }

    const newMessage = { role: 'user', parts };
    let finalText = '';

    try {
      for await (const event of runner.runAsync({
        userId,
        sessionId,
        newMessage,
      })) {
        const e = event as unknown as Record<string, unknown>;
        if (e['errorCode']) {
          this.logger.error(
            `ADK error event code=${e['errorCode']} message=${e['errorMessage']}`,
          );
          continue;
        }
        if (isFinalResponse(event) && event.content?.parts) {
          const texts = (event.content.parts as { text?: string }[])
            .filter((p) => p.text)
            .map((p) => p.text!);
          if (texts.length) finalText = texts.join('');
        }
      }
    } catch (err) {
      this.logger.error(
        `Runner error for user=${userId} channel=${channel}`,
        err,
      );
    }

    return finalText || 'Sorry, I could not process your request right now.';
  }
}
