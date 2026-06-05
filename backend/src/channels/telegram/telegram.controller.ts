import {
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  Logger,
  Post,
  Body,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { TelegramService } from './telegram.service';
import type { TelegramUpdate } from './telegram.service';
import { IdentityService } from '../../identity/identity.service';
import { RunnerService } from '../../agent/runner.service';
import { MediaService } from '../../media/media.service';

@Controller('webhook/telegram')
export class TelegramController {
  private readonly logger = new Logger(TelegramController.name);

  constructor(
    private readonly config: ConfigService,
    private readonly telegramService: TelegramService,
    private readonly identityService: IdentityService,
    private readonly runnerService: RunnerService,
    private readonly mediaService: MediaService,
  ) {}

  /**
   * Telegram delivers updates here.
   * The shared secret in `X-Telegram-Bot-Api-Secret-Token` is validated first;
   * any request without it is rejected with 403.
   *
   * Phase 6.4 will add: IdentityService.resolveUser → RunnerService.run → sendMessage.
   * Phase 5 will add: buffer download via TelegramService.downloadFile → MediaService.store.
   */
  @Post()
  @HttpCode(200)
  async handleUpdate(
    @Headers('x-telegram-bot-api-secret-token') secret: string,
    @Body() update: TelegramUpdate,
  ): Promise<void> {
    const expected = Buffer.from(
      this.config.get<string>('TELEGRAM_WEBHOOK_SECRET') ?? '',
    );
    const provided = Buffer.from(secret ?? '');
    if (
      expected.length !== provided.length ||
      !timingSafeEqual(expected, provided)
    ) {
      throw new ForbiddenException();
    }

    const payload = this.telegramService.extractPayload(update);
    if (!payload) {
      this.logger.debug(
        `Ignored update_id=${update.update_id} (unsupported type)`,
      );
      return;
    }

    this.logger.debug(
      `Received ${payload.mediaType ?? 'text'} from chat ${payload.chatId}`,
    );

    const fromId = String(update.message?.from?.id ?? payload.chatId);
    const { user, suggestLinking } = await this.identityService.resolveUser(
      'telegram',
      fromId,
    );
    const userId = user._id.toString();

    let mediaBuffer: Buffer | undefined;
    let mimeType: string | undefined;
    let mediaFileId: string | undefined;

    if (payload.fileId) {
      try {
        mediaBuffer = await this.telegramService.downloadFile(payload.fileId);
        mimeType = payload.mediaType === 'voice' ? 'audio/ogg' : 'image/jpeg';
        mediaFileId = await this.mediaService.store(
          mediaBuffer,
          mimeType,
          userId,
          'telegram',
        );
      } catch (err) {
        this.logger.warn(
          `Failed to download media for chat=${payload.chatId}`,
          err,
        );
      }
    }

    let reply = await this.runnerService.run(userId, 'telegram', {
      text: payload.text,
      mediaBuffer,
      mimeType,
      mediaFileId,
    });

    if (suggestLinking) {
      reply =
        `You seem to have another account linked to this number. ` +
        `Reply /link to merge them.\n\n` +
        reply;
    }

    await this.telegramService.sendMessage(payload.chatId, reply);
  }
}
