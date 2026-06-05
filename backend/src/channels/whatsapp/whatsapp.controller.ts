import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Logger,
  Post,
  Query,
  RawBody,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WhatsAppService } from './whatsapp.service';
import type { WhatsAppBody } from './whatsapp.service';
import { IdentityService } from '../../identity/identity.service';
import { RunnerService } from '../../agent/runner.service';
import { MediaService } from '../../media/media.service';

@Controller('webhook/whatsapp')
export class WhatsAppController {
  private readonly logger = new Logger(WhatsAppController.name);

  constructor(
    private readonly config: ConfigService,
    private readonly whatsappService: WhatsAppService,
    private readonly identityService: IdentityService,
    private readonly runnerService: RunnerService,
    private readonly mediaService: MediaService,
  ) {}

  /**
   * Meta's webhook verification handshake.
   * Returns `hub.challenge` only when `hub.verify_token` matches the env var.
   * Note: Express + qs parses `hub.mode` query params as `{ hub: { mode } }`.
   */
  @Get()
  verifyWebhook(
    @Query('hub')
    hub: {
      mode?: string;
      verify_token?: string;
      challenge?: string;
    },
  ): string {
    if (
      hub?.mode === 'subscribe' &&
      hub.verify_token === this.config.get<string>('WHATSAPP_VERIFY_TOKEN')
    ) {
      return hub.challenge ?? '';
    }
    throw new ForbiddenException();
  }

  /**
   * Receives WhatsApp Cloud API events.
   * The raw body is validated against the `X-Hub-Signature-256` HMAC header
   * before any processing — invalid requests are rejected with 403.
   *
   * Phase 6.4 will add: IdentityService.resolveUser → RunnerService.run → sendMessage.
   * Phase 5 will add: buffer download via WhatsAppService.downloadMedia → MediaService.store.
   */
  @Post()
  @HttpCode(200)
  async handleMessage(
    @RawBody() rawBody: Buffer,
    @Headers('x-hub-signature-256') signature: string,
    @Body() body: WhatsAppBody,
  ): Promise<void> {
    if (!this.whatsappService.validateSignature(rawBody, signature)) {
      throw new ForbiddenException();
    }

    const payload = this.whatsappService.extractPayload(body);
    if (!payload) {
      this.logger.debug(
        'Received a non-message event (status update etc.) — acknowledged',
      );
      return;
    }

    this.logger.debug(
      `Received ${payload.mediaType ?? 'text'} from ${payload.from}`,
    );

    const { user, suggestLinking } = await this.identityService.resolveUser(
      'whatsapp',
      payload.from,
    );
    const userId = user._id.toString();

    let mediaBuffer: Buffer | undefined;
    let mimeType: string | undefined;
    let mediaFileId: string | undefined;

    if (payload.mediaId) {
      try {
        const downloaded = await this.whatsappService.downloadMedia(
          payload.mediaId,
        );
        mediaBuffer = downloaded.buffer;
        mimeType = downloaded.mimeType;
        mediaFileId = await this.mediaService.store(
          mediaBuffer,
          mimeType,
          userId,
          'whatsapp',
        );
      } catch (err) {
        this.logger.warn(`Failed to download media for ${payload.from}`, err);
      }
    }

    let reply = await this.runnerService.run(userId, 'whatsapp', {
      text: payload.text,
      mediaBuffer,
      mimeType,
      mediaFileId,
    });

    if (suggestLinking) {
      reply =
        `You seem to have another account linked to this number. ` +
        `Reply LINK to merge them.\n\n` +
        reply;
    }

    await this.whatsappService.sendMessage(payload.from, reply);
  }
}
